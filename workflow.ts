type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
  multiplier?: number;
};

type WorkflowExecutionContext = {
  workflowRunId: string;
  profile: string;
  invokeTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  emitSpan(name: string, attrs?: Record<string, unknown>): void;
  emitMetric(
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'histogram',
    attrs?: Record<string, unknown>,
  ): void;
  getConfig<T = unknown>(path: string, fallback?: T): T;
};

type ToolNode = {
  kind: 'tool';
  id: string;
  toolName: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
  retry?: RetryPolicy;
};

type SequenceNode = {
  kind: 'sequence';
  id: string;
  steps: WorkflowNode[];
};

type BranchNode = {
  kind: 'branch';
  id: string;
  predicateId: string;
  predicateFn?: (ctx: WorkflowExecutionContext) => boolean | Promise<boolean>;
  whenTrue: WorkflowNode;
  whenFalse?: WorkflowNode;
};

type WorkflowNode = ToolNode | SequenceNode | BranchNode;

type WorkflowContract = {
  kind: 'workflow-contract';
  version: 1;
  id: string;
  displayName: string;
  description?: string;
  tags?: string[];
  timeoutMs?: number;
  defaultMaxConcurrency?: number;
  build(ctx: WorkflowExecutionContext): WorkflowNode;
  onStart?(ctx: WorkflowExecutionContext): Promise<void> | void;
  onFinish?(ctx: WorkflowExecutionContext, result: unknown): Promise<void> | void;
  onError?(ctx: WorkflowExecutionContext, error: Error): Promise<void> | void;
};

function toolNode(
  id: string,
  toolName: string,
  options?: { input?: Record<string, unknown>; retry?: RetryPolicy; timeoutMs?: number },
): ToolNode {
  return {
    kind: 'tool',
    id,
    toolName,
    input: options?.input,
    retry: options?.retry,
    timeoutMs: options?.timeoutMs,
  };
}

function sequenceNode(id: string, steps: WorkflowNode[]): SequenceNode {
  return { kind: 'sequence', id, steps };
}

function branchNode(
  id: string,
  predicateId: string,
  whenTrue: WorkflowNode,
  whenFalse: WorkflowNode | undefined,
  predicateFn?: (ctx: WorkflowExecutionContext) => boolean | Promise<boolean>,
): BranchNode {
  return { kind: 'branch', id, predicateId, predicateFn, whenTrue, whenFalse };
}

const DISCOVERY_PATHS = [
  '/docs',
  '/openapi.json',
  '/api/docs',
  '/swagger.json',
  '/api/v1/openapi.json',
  '/api/openapi.json',
] as const;

const DEFAULT_TARGET_PATHS = ['/api/v1/auths/', '/api/v2/chats/', '/api/models'] as const;

function getOrigin(url: string): string {
  const match = url.match(/^(https?:\/\/[^/]+)/i);
  return match ? match[1] : url;
}

const apiProbeBatchWorkflow: WorkflowContract = {
  kind: 'workflow-contract',
  version: 1,
  id: 'workflow.api-probe-batch.v1',
  displayName: 'API Probe Batch',
  description:
    'Navigate to an application origin, optionally extract auth context, probe OpenAPI discovery paths first, and then probe configured business endpoints.',
  tags: ['workflow', 'api', 'probe', 'openapi', 'auth'],
  timeoutMs: 5 * 60_000,
  defaultMaxConcurrency: 1,

  build(ctx) {
    const appUrl = ctx.getConfig<string>('workflows.apiProbe.appUrl', 'https://example.com/');
    const derivedBaseUrl = getOrigin(appUrl);
    const baseUrl = ctx.getConfig<string>('workflows.apiProbe.baseUrl', derivedBaseUrl);
    const method = ctx.getConfig<string>('workflows.apiProbe.method', 'GET');
    const autoInjectAuth = ctx.getConfig<boolean>('workflows.apiProbe.autoInjectAuth', true);
    const maxBodySnippetLength = ctx.getConfig<number>('workflows.apiProbe.maxBodySnippetLength', 800);
    const includeBodyStatuses = ctx.getConfig<number[]>(
      'workflows.apiProbe.includeBodyStatuses',
      [200, 201, 204, 400, 401, 403, 404],
    );
    const targetPaths = ctx.getConfig<string[]>(
      'workflows.apiProbe.targetPaths',
      [...DEFAULT_TARGET_PATHS],
    );
    const runAuthExtract = ctx.getConfig<boolean>('workflows.apiProbe.runAuthExtract', true);

    const authBranch = branchNode(
      'maybe-auth-extract',
      'api_probe_run_auth_extract',
      toolNode('auth-extract', 'page_script_run', {
        input: { name: 'auth_extract' },
      }),
      toolNode('skip-auth-extract', 'console_execute', {
        input: {
          expression: '({ skipped: true, step: "auth_extract", reason: "config_disabled" })',
        },
      }),
      () => runAuthExtract,
    );

    return sequenceNode('api-probe-batch-root', [
      toolNode('navigate-app-origin', 'page_navigate', {
        input: {
          url: appUrl,
          waitUntil: 'domcontentloaded',
          enableNetworkMonitoring: true,
        },
      }),
      authBranch,
      toolNode('probe-openapi-discovery', 'api_probe_batch', {
        input: {
          baseUrl,
          method,
          autoInjectAuth,
          maxBodySnippetLength,
          includeBodyStatuses,
          paths: [...DISCOVERY_PATHS],
        },
      }),
      toolNode('probe-business-endpoints', 'api_probe_batch', {
        input: {
          baseUrl,
          method,
          autoInjectAuth,
          maxBodySnippetLength,
          includeBodyStatuses,
          paths: targetPaths,
        },
      }),
      toolNode('emit-summary', 'console_execute', {
        input: {
          expression: `(${JSON.stringify({
            status: 'api_probe_complete',
            order: ['navigate', 'auth_extract', 'discovery', 'target'],
            appUrl,
            baseUrl,
            targetPaths,
          })})`,
        },
      }),
    ]);
  },

  onStart(ctx) {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId: 'workflow.api-probe-batch.v1',
      stage: 'start',
    });
  },

  onFinish(ctx) {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId: 'workflow.api-probe-batch.v1',
      stage: 'finish',
    });
  },

  onError(ctx, error) {
    ctx.emitMetric('workflow_errors_total', 1, 'counter', {
      workflowId: 'workflow.api-probe-batch.v1',
      error: error.name,
    });
  },
};

export default apiProbeBatchWorkflow;
