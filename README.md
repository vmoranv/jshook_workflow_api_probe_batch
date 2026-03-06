# api-probe-batch workflow

Declarative workflow for OpenAPI-first probing of authenticated API endpoints.

## Entry File

- `workflow.ts`

## Workflow ID

- `workflow.api-probe-batch.v1`

## Structure

This workflow fixes a best-practice probing order around the built-in `api_probe_batch` tool:

- `ToolNode`: navigate to the target app origin first
- `ToolNode`: probe standard OpenAPI / Swagger discovery paths
- `ToolNode`: probe business API paths configured by the operator
- `ToolNode`: emit a final summary marker
- `SequenceNode`: keep the whole orchestration deterministic

## Tools Used

- `page_navigate`
- `api_probe_batch`
- `console_execute`

## Config

- `workflows.apiProbe.appUrl` — same-origin page used to inherit localStorage token
- `workflows.apiProbe.baseUrl` — API base URL to probe
- `workflows.apiProbe.method` — HTTP method for both discovery and target probes
- `workflows.apiProbe.autoInjectAuth` — whether the built-in probe should auto-read bearer token from localStorage
- `workflows.apiProbe.maxBodySnippetLength` — max response snippet length
- `workflows.apiProbe.discoveryIncludeBodies` — whether discovery probes should include response body snippets
- `workflows.apiProbe.targetPaths` — business API paths for the second phase

## Local Validation

1. Add this repo to the `jshookmcp` extension/workflow roots.
2. Run `extensions_reload`.
3. Confirm the workflow is listed in `extensions_list`.
4. Trigger the workflow with a workflow runner and verify:
   - it navigates to the configured app origin first
   - discovery probing runs before business-path probing
   - a summary step is emitted at the end
