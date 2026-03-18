# Aeon Foundation Scaffold + Clone Spec (Implemented)

## Scope

This package now ships a canonical scaffold and clone workflow for `aeon-foundation`:

- `edgework deploy scaffold aeon-foundation <dir>`
- `edgework deploy clone <source> <dir>`
- `edgework lift ...` alias for deploy
- `edgework shift <source> <dir>` alias for clone/download

## Quality Autopilot Framework

Implemented in `edgework-sdk`:

- Local lint checks for legal/SEO/well-known paths.
- Route inventory normalization from:
  - worker entry files (`src/worker.ts`, `src/index.ts`, root worker entry files)
  - sitemap URLs (`public/sitemap.xml`)
- Optional remote smoke checks (status + workers.dev redirect detection).
- JSON + human-readable reporting via `runQualityAutopilot`.

Scaffold output is generated to satisfy this framework by default.

## Scaffold Defaults

Generated `aeon.toml` defaults to:

- `preset = "all"`
- full feature toggles enabled (analytics, sitemap, robots, metadata, ESI, dashrelay, dash, neural, presence, ucan, zk, d1, r2, kv, mcp)
- quality policy:
  - static routes target `100`
  - interactive routes target `95`

## MCP Integration

Scaffold now includes `mcp.json` with:

- `edgework` -> `@emotions-app/edgework-mcp`
- `edgework-deploy` -> `@emotions-app/edgework-node mcp-server`
- `aeon-foundation` quality shim command

`edgework-node` MCP server now also exposes deploy framework tools:

- `deploy_scaffold_aeon_foundation`
- `deploy_clone_shift`
- `deploy_quality_autopilot`

## Demo App in Repo

A committed scaffold demo is available at:

- `apps/affectively-app`

This target is configured for the `affectively.app` domain context and includes full scaffold artifacts, MCP config, and quality/lighthouse scripts.
