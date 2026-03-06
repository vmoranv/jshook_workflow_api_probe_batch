# api-probe-batch workflow

Declarative workflow for OpenAPI-first endpoint probing. It codifies a safe probing order: establish same-origin browser context first, probe documentation/discovery paths next, and only then probe business endpoints.

## Entry File

- `workflow.ts`

## Workflow ID

- `workflow.api-probe-batch.v1`

## Structure

This workflow wraps the built-in `api_probe_batch` tool with a repeatable operator flow:

- `page_navigate` to a same-origin app page so localStorage auth can be reused
- First `api_probe_batch` call for standard OpenAPI / Swagger discovery paths
- Second `api_probe_batch` call for configured business endpoints
- `console_execute` summary step to mark completion for downstream runners

## Tools Used

- `page_navigate`
- `api_probe_batch`
- `console_execute`

## Config

- `workflows.apiProbe.appUrl`
- `workflows.apiProbe.baseUrl`
- `workflows.apiProbe.method`
- `workflows.apiProbe.autoInjectAuth`
- `workflows.apiProbe.maxBodySnippetLength`
- `workflows.apiProbe.discoveryIncludeBodies`
- `workflows.apiProbe.targetPaths`

## Local Validation

1. Run `pnpm install`.
2. Run `pnpm typecheck`.
3. Put this repo under a configured `workflows/` extension root.
4. Run `extensions_reload` in `jshookmcp`.
5. Confirm the workflow appears in `extensions_list`.
6. Execute the workflow and verify the order is `navigate -> discovery probe -> target probe -> summary`.
