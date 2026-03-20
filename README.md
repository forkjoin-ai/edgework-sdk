# @affectively/edgework-sdk

Welcome! This SDK brings AI inference directly to the browser  --  fast, private, and offline-capable.

## Install

```bash
npm install @affectively/edgework-sdk
```

## What's Inside

- **Storage**  --  Local-first data with D1/Dash sync
- **Inference**  --  WebGPU-powered AI that runs on-device
- **RLHF**  --  Collect feedback to improve models over time
- **React**  --  Ready-to-use components for feedback UI
- **Agent Runtime**  --  Gnosis-style topology runtime for agent/client orchestration

## Quick Start

```tsx
import { EdgeworkProvider, useInference } from '@affectively/edgework-sdk/react';

function App() {
  return (
    <EdgeworkProvider>
      <MyComponent />
    </EdgeworkProvider>
  );
}
```

## Build Surface

Monorepo builds split this package into `build:prep`, `build:js`, and `build:dts` so `a0` can schedule JS bundling and declaration emission as sibling lanes instead of hiding both phases inside one opaque `tsup` invocation. The declaration lane uses a package-local shim surface for external type-only imports, which keeps DTS emission out of the workspace reference lattice.

## Quality Autopilot

Run one command to lint common production routes/assets (`/terms`, `/privacy`, `/sitemap.xml`, `/robots.txt`, `/.well-known/*`, favicons, manifests) and optionally smoke-test deployed process URLs.

```bash
# From repo root
bun run audit:aeon-legal-routes --no-strict

# From packages/edgework-sdk
bun run quality -- --source=workspace --smoke --smoke-timeout=10000
```

Programmatic usage:

```ts
import { runQualityAutopilot } from '@affectively/edgework-sdk/deploy';

const report = await runQualityAutopilot({
  source: 'workspace',
  smoke: true,
});
```

## Media CLI

Generate media from the edge OpenAI-compatible API and write files directly:

```bash
# Image generation (writes PNG only when API returns usable image output)
bun run media:image -- --prompt "cinematic portrait" --model ssd-1b-lcm-int8 --out ssd.png

# Video generation -> writes MP4
bun run media:video -- --prompt "cinematic snow over mountains" --out ltx.mp4
```

`media:image` accepts only canonical model IDs and rejects removed alias names (for example legacy SDXL aliases that previously masked different backends). `media:video` checks `/v1/models` first, but still probes generation endpoints so stale readiness metadata cannot block working video lanes.

## Learn More

- [Documentation](https://edgework.ai/docs/sdk)
- [GitHub](https://github.com/affectively/edgework-sdk)

## License

Copyright Taylor William Buley. All rights reserved.

Apache-2.0

---

Made with care by the AFFECTIVELY team.

Last Updated: 2026-01-31

## Sub-Directories

- **[Generated](./generated)**
- **[Rust](./rust)**
- **[Scripts](./scripts)**
- **[Src](./src)**
