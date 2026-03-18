# Edgework Agent Development Kit

**The easiest way to turn your CPU/WebGPU/WebNN into productive compute.**

This kit lets you spin up an agent that contributes compute to the Edgework network -- no C&C overhead, just pure compute contribution. Start an agent with a single command, let it earn while your system idles.

## Features

- 🚀 **One-Command Setup** - `bun run edgework-agent:setup`
- 🎮 **Gateway Connector** - Automatic gateway registration on Optimism
- 💰 **Custodial Wallet** - Optional automatic wallet creation (stores keys locally encrypted)
- 📊 **Compute Pooling** - WebGPU/WebNN/CPU workload distribution
- 🖥️ **System Tray** - Optional native integration (Windows/macOS/Linux)
- 🔄 **Auto-Restart** - Optional boot persistence
- 🌍 **Multi-Platform** - macOS, Windows, Linux, even Raspberry Pi

## Gnosis Runtime

Agent client adapters now execute through a Gnosis-compatible runtime layer using topology primitives (`PROCESS`, `FORK`, `RACE`, `FOLD`, `VENT`) with a shared fetch compatibility wrapper.

## Quick Start

### 1. Initialize Agent (Interactive Setup)

```bash
bun run edgework-agent:setup

# Follow the prompts:
# ✓ Create new wallet? (auto-generates keys)
# ✓ Gateway name & region?
# ✓ CPU allocation %?
# ✓ Run in system tray? (macOS/Windows/Linux)
# ✓ Restart on boot?
```

### 2. Start the Gateway

```bash
bun run edgework-gateway:start
```

### 3. Start the Agent

```bash
bun run edgework-agent:start
```

### Environment

```bash
# Used by AgentManager, ComputeNode gateway calls, and relayer registration
export EDGEWORK_API_KEY="your-edgework-api-key"
```

## Commands

```bash
# Quick setup (interactive)
bun run edgework-agent:setup

# Start gateway connector
bun run edgework-gateway:start

# Start compute agent
bun run edgework-agent:start

# Check status
bun run edgework-agent:status

# View earnings
bun run edgework-agent:earnings

# Stop agent
bun run edgework-agent:stop

# Unregister from gateway
bun run edgework-gateway:unregister
```

## Configuration

### Auto-setup Options

During `edgework-agent:setup`, you can:

1. **Wallet Creation**
   - Option to auto-generate custodial wallet
   - Keys stored locally in `~/.edgework/keys` (encrypted)
   - Secure, auditable local storage

2. **Gateway Settings**
   - Name: e.g., "Office Worker", "Test Lab"
   - Region: auto-detected or manual (us-west, eu-central, etc.)
   - Metadata: JSON description of your node

3. **Compute Allocation**
   - CPU threads: 1-∞ (default: auto-detect optimal)
   - GPU: WebGPU if available
   - Memory: configurable pool size

4. **System Tray (Optional)**
   - Native menu bar icon
   - Quick start/stop
   - Status overview

5. **Boot Persistence**
   - launchd (macOS)
   - systemd (Linux)
   - Task Scheduler (Windows)

## Configuration File

`~/.edgework/agent-config.json`:

```json
{
  "gateway": {
    "name": "My Node",
    "region": "us-west",
    "walletAddress": "0x...",
    "metadata": {
      "cpu_cores": 8,
      "gpu": "amd",
      "country": "US"
    }
  },
  "compute": {
    "cpuAllocation": 0.8,
    "memoryMB": 2048,
    "maxTaskDuration": 600
  },
  "system": {
    "runAtBoot": true,
    "systemTray": true,
    "logLevel": "info"
  }
}
```

## Architecture

### AgentManager

Orchestrates the gateway connector and compute node:

```typescript
const agent = new AgentManager({
  walletAddress: '0x...',
  gatewayName: 'My Node',
  apiKey: process.env.EDGEWORK_API_KEY, // optional; env fallback is automatic
  cpuAllocation: 0.8,
});

await agent.initialize();
await agent.start();

agent.on('stats', (stats) => {
  console.log('Earnings:', stats.estimatedEarnings);
});
```

### GatewayConnector

Handles Optimism wallet registration:

```typescript
const gateway = new GatewayConnector({
  provider: 'https://sepolia.optimism.io',
  walletAddress: '0x...',
  apiKey: process.env.EDGEWORK_API_KEY, // optional; env fallback is automatic
});

// Optional: Auto-create wallet and register
await gateway.registerWithNewWallet({
  name: 'My Gateway',
  metadata: { region: 'us-west' },
});

// Or use existing wallet
await gateway.register();
```

### ComputeNode

Browser-based compute that runs in tabs/workers:

```typescript
const node = new ComputeNode({
  gatewayUrl: 'http://localhost:8080',
  apiKey: process.env.EDGEWORK_API_KEY, // optional; env fallback is automatic
  cpuAllocation: 0.8,
});

await node.connect();
await node.start();
```

## System Tray Integration

### macOS (Cocoa)

Native menu bar app with quick controls and real-time stats.

```typescript
import { createMacOSSystemTray } from '@affectively/edgework-sdk/agent/systemTray';

const tray = createMacOSSystemTray();
tray.show();
tray.setStatus('Computing...');
```

### Windows (Windows API)

Tray icon with context menu and click-to-settings.

```typescript
import { createWindowsSystemTray } from '@affectively/edgework-sdk/agent/systemTray';

const tray = createWindowsSystemTray();
tray.show();
```

### Linux (xdg-desktop-portal / tint2)

Works with most DMs (GNOME, KDE, Cinnamon, XFCE).

```typescript
import { createLinuxSystemTray } from '@affectively/edgework-sdk/agent/systemTray';

const tray = createLinuxSystemTray();
tray.show();
```

## Key Generation & Security

Wallet keys are **never exposed**. The agent uses them only for:

1. **Signing gateway registration transactions**
2. **Claiming rewards on Optimism**
3. **Heartbeat attestations**

Keys are encrypted with a device-specific key derived from:

- Hostname
- OS username
- Local hardware fingerprint

This is "custodial lite" -- you keep full control, agent keeps keys safe locally.

## Compute Contribution Flow

1. Agent registers with `EdgeworkGatewayRegistry` on Optimism
2. Listens for compute tasks on Edgework mesh gateway
3. Completes tasks using available WebGPU/CPU
4. Reports results back to gateway
5. Off-chain oracle verifies and credits rewards
6. User claims earnings on-chain

## Troubleshooting

### "Failed to register gateway"

- Check internet connectivity
- Verify Optimism Sepolia RPC is accessible
- Ensure wallet has ~0.01 ETH for gas

### "System tray not available"

- Install necessary packages:
  - **macOS**: Requires Cocoa.framework (built-in)
  - **Windows**: Requires Windows.h (built-in)
  - **Linux**: `apt install libgtk-3-0` (GNOME) or equivalent

### "Compute tasks not received"

- Check firewall rules
- Verify gateway URL is reachable
- Check logs: `bun run edgework-agent:status --logs`

## Examples

### Headless Server

```bash
# Run in background, auto-restart on failure
bun run edgework-agent:start --daemonize --auto-restart
```

### Docker Container

```dockerfile
FROM oven/bun:latest
COPY . /app
WORKDIR /app
RUN bun install
RUN bun run edgework-agent:setup --non-interactive
CMD ["bun", "run", "edgework-agent:start"]
```

### GitHub Actions (Gray Zone)

```yaml
- name: Start Edgework Agent
  run: bun run edgework-agent:start
```

## Earning Model

- Compute completed: Report to oracle
- Oracle verifies: Off-chain integrity check
- Rewards credited: On-chain accumulation
- Claim earnings: Manual or auto-sweep to wallet

Gateway operators earn 5% commission on facilitated compute.

## License

Copyright Taylor William Buley. All rights reserved.

Apache-2.0

---

**Bring your compute. Earn rewards. No middlemen. 🚀**
