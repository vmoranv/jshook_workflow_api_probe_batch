import type { WorkflowContract, WorkflowExecutionContext } from '@jshookmcp/extension-sdk/workflow';
import { toolNode, sequenceNode, branchNode } from '@jshookmcp/extension-sdk/workflow';

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
    const appUrl = ctx.getConfig<string>('workflows.apiProbe.appUrl', '');
    if (!appUrl) throw new Error('[workflow.api-probe-batch] Missing required config: workflows.apiProbe.appUrl');
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

    return sequenceNode('api-probe-batch-root')
      .step(toolNode('navigate-app-origin', 'page_navigate').input({
        url: appUrl,
        waitUntil: 'domcontentloaded',
        enableNetworkMonitoring: true,
      }))
      .step(branchNode('maybe-auth-extract', 'api_probe_run_auth_extract')
        .predicateFn(() => runAuthExtract)
        .whenTrue(toolNode('auth-extract', 'page_script_run').input({ name: 'auth_extract' }))
        .whenFalse(toolNode('skip-auth-extract', 'console_execute').input({
          expression: '({ skipped: true, step: "auth_extract", reason: "config_disabled" })',
        })))
      .step(toolNode('probe-openapi-discovery', 'api_probe_batch').input({
        baseUrl,
        method,
        autoInjectAuth,
        maxBodySnippetLength,
        includeBodyStatuses,
        paths: [...DISCOVERY_PATHS],
      }))
      .step(toolNode('probe-business-endpoints', 'api_probe_batch').input({
        baseUrl,
        method,
        autoInjectAuth,
        maxBodySnippetLength,
        includeBodyStatuses,
        paths: targetPaths,
      }))
      .step(toolNode('emit-summary', 'console_execute').input({
        expression: `(${JSON.stringify({
          status: 'api_probe_complete',
          order: ['navigate', 'auth_extract', 'discovery', 'target'],
          appUrl,
          baseUrl,
          targetPaths,
        })})`,
      }))
      .build();
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
