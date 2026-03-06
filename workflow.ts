import {
  sequenceNode,
  toolNode,
} from '@jshookmcp/extension-sdk/workflow';
import type { WorkflowContract } from '@jshookmcp/extension-sdk/workflow';

const DISCOVERY_PATHS = [
  '/docs',
  '/openapi.json',
  '/api/docs',
  '/swagger.json',
  '/api/v1/openapi.json',
  '/api/openapi.json',
] as const;

const DEFAULT_TARGET_PATHS = [
  '/api/v1/users/me',
  '/api/v1/chats',
] as const;

const apiProbeBatchWorkflow: WorkflowContract = {
  kind: 'workflow-contract',
  version: 1,
  id: 'workflow.api-probe-batch.v1',
  displayName: 'API Probe Batch',
  description:
    'Navigate to a same-origin app page, probe OpenAPI discovery paths first, ' +
    'then probe configured business endpoints with auto-injected auth.',
  tags: ['workflow', 'api', 'probe', 'openapi', 'auth'],
  timeoutMs: 5 * 60_000,
  defaultMaxConcurrency: 1,

  build(ctx) {
    const appUrl = ctx.getConfig<string>(
      'workflows.apiProbe.appUrl',
      'https://example.com/app',
    );
    const baseUrl = ctx.getConfig<string>(
      'workflows.apiProbe.baseUrl',
      'https://example.com',
    );
    const method = ctx.getConfig<string>('workflows.apiProbe.method', 'GET');
    const autoInjectAuth = ctx.getConfig<boolean>(
      'workflows.apiProbe.autoInjectAuth',
      true,
    );
    const maxBodySnippetLength = ctx.getConfig<number>(
      'workflows.apiProbe.maxBodySnippetLength',
      500,
    );
    const discoveryIncludeBodies = ctx.getConfig<boolean>(
      'workflows.apiProbe.discoveryIncludeBodies',
      false,
    );
    const targetPaths = ctx.getConfig<string[]>(
      'workflows.apiProbe.targetPaths',
      [...DEFAULT_TARGET_PATHS],
    );

    const navigate = toolNode('navigate-app-origin', 'page_navigate', {
      input: {
        url: appUrl,
        waitUntil: 'domcontentloaded',
        enableNetworkMonitoring: true,
      },
    });

    const discoveryProbe = toolNode('probe-openapi-discovery', 'api_probe_batch', {
      input: {
        baseUrl,
        method,
        autoInjectAuth,
        maxBodySnippetLength,
        includeBodyStatuses: discoveryIncludeBodies ? [200, 201, 204] : [],
        paths: [...DISCOVERY_PATHS],
      },
    });

    const targetProbe = toolNode('probe-business-endpoints', 'api_probe_batch', {
      input: {
        baseUrl,
        method,
        autoInjectAuth,
        maxBodySnippetLength,
        paths: targetPaths,
      },
    });

    const summarize = toolNode('emit-summary', 'console_execute', {
      input: {
        expression:
          '({ status: "api_probe_complete", order: ["navigate", "discovery", "target"], note: "Inspect previous step outputs for discovery and target probe results" })',
      },
    });

    return sequenceNode('api-probe-batch-root', [
      navigate,
      discoveryProbe,
      targetProbe,
      summarize,
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
