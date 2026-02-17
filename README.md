# @affectively/edgework-sdk

Welcome! This SDK brings AI inference directly to the browser — fast, private, and offline-capable.

## Install

```bash
npm install @affectively/edgework-sdk
```

## What's Inside

- **Storage** — Local-first data with D1/Dash sync
- **Inference** — WebGPU-powered AI that runs on-device
- **RLHF** — Collect feedback to improve models over time
- **React** — Ready-to-use components for feedback UI

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

## Learn More

- [Documentation](https://edgework.ai/docs/sdk)
- [GitHub](https://github.com/affectively/edgework-sdk)

## License

Apache-2.0

---

Made with care by the AFFECTIVELY team.

Last Updated: 2026-01-31

## Sub-Directories

- **[Generated](./generated)**
- **[Rust](./rust)**
- **[Scripts](./scripts)**
- **[Src](./src)**