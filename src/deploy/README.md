# Deploy Utilities

Parent: [Edgework SDK Core](../README.md)

Shared deploy helpers for publish orchestration, smoke verification, and route-quality checks.

`registerAeonPid(...)` stages a temporary minimal registration app instead of
mutating an app's real `dist/` tree, so large client bundles do not leak into
AeonPID control-plane uploads.

## Files

- [`index.ts`](./index.ts): Public deploy helper exports.
- [`smoke.ts`](./smoke.ts): Reusable smoke harness with retries, cleanup registration, MCP helpers, report writing, and preferences/flags assertions.
- [`quality.ts`](./quality.ts): Route and HTML quality probes used by deploy checks.
- [`mcp.ts`](./mcp.ts): MCP-facing deploy helpers.
- [`scaffold.ts`](./scaffold.ts): Project scaffolding helpers.
- [`clone.ts`](./clone.ts): Deploy clone helpers.
- [`forgo-logs-client.ts`](./forgo-logs-client.ts): Typed Forgo Logs API client now routed through Gnosis fetch/runtime compatibility helpers.

## Smoke Harness Contract

`smoke.ts` exports the shared production-smoke contract used by the public Yoga/Fractal apps:

- `SmokeSuite`
- `SmokeStep`
- `SmokeContext`
- `SmokeResult`
- `McpSession`
- `runSmokeSuite(...)`
- `withRetry(...)`
- `assertPreferencesRoundTrip(...)`
- `assertFlagsReadable(...)`

## Production Gate Behavior

App-owned deploy scripts publish first and then invoke `smoke:deployed`. Forge remote publish planning treats `smoke:deployed` as a production gate: if a project declares smoke, production publish must resolve through an app deploy target rather than raw Wrangler fallback.
