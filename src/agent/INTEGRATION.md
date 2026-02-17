# Agent Development Kit Integration Guide

The Edgework Agent Development Kit transforms the SDK into a powerful compute contribution system. This guide covers integration, architecture, and best practices.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Edgework Agent                     │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  AgentManager (Orchestration)         │  │
│  │  - Manages lifecycle                  │  │
│  │  - Event emission                     │  │
│  │  - Configuration                      │  │
│  └─────────┬────────────────┬────────────┘  │
│            │                │                │
│     ┌──────▼──────┐   ┌─────▼──────────┐   │
│     │ Gateway     │   │ ComputeNode    │   │
│     │ Connector   │   │                │   │
│     │             │   │ - Task pooling │   │
│     │ - Register  │   │ - Execution    │   │
│     │ - Heartbeat │   │ - Reporting    │   │
│     │ - Optimize  │   │ - WebGPU/CPU   │   │
│     └──────┬──────┘   └─────┬──────────┘   │
│            │                │                │
│     ┌──────▼──────┐   ┌─────▼──────────┐   │
│     │ Wallet      │   │ System Tray    │   │
│     │ Manager     │   │                │   │
│     │             │   │ - macOS        │   │
│     │ - Key Gen   │   │ - Windows      │   │
│     │ - Encrypt   │   │ - Linux        │   │
│     │ - Storage   │   │                │   │
│     └─────────────┘   └────────────────┘   │
│                                              │
└─────────────────────────────────────────────┘
          ▼              ▼              ▼
     Optimism      Compute Pool    Dashboard
     Gateway      (WebGPU/CPU)
```

## Components

### 1. WalletManager

Handles local key generation and encrypted storage.

```typescript
import { WalletManager } from '@affectively/edgework-sdk/agent';

const walletMgr = new WalletManager();

// Create new wallet
const wallet = await walletMgr.generateWallet();
await walletMgr.saveWallet();
// Keys stored at ~/.edgework/wallet.json.enc (encrypted)

// Load wallet
const wallet = await walletMgr.loadWallet();

// Sign data
const signature = await walletMgr.sign('0x' + Buffer.from('message').toString('hex'));
```

**Security:**
- Keys encrypted with device-specific key (hostname + OS + hardware)
- Encrypted with AES-256-CBC
- File permissions: 0o600 (owner read/write only)
- Never exposed in plain text

### 2. GatewayConnector

Registers gateway on Optimism and manages heartbeats.

```typescript
import { GatewayConnector } from '@affectively/edgework-sdk/agent';

const connector = new GatewayConnector({
  walletAddress: '0x...',
  provider: 'https://sepolia.optimism.io',
});

// Connect to network
await connector.connect();

// Register with new wallet (auto-creates keys)
const { wallet, registration } = await connector.registerWithNewWallet({
  name: 'My Gateway',
  region: 'us-west',
});

// Or register with existing wallet
const registration = await connector.register({
  name: 'My Gateway',
  region: 'us-west',
  walletAddress: '0x...',
});

// Send heartbeat (keep gateway active)
await connector.sendHeartbeat();

// Check status
const status = await connector.getStatus();
// {
//   gatewayAddress: '0x...',
//   isActive: true,
//   totalComputeUnits: 1000,
//   pendingRewards: 150
// }

// Unregister
await connector.unregister('Shutting down');
```

**On-Chain:**
- Calls `EdgeworkGatewayRegistry.registerGateway(ucanRoot, metadata)`
- Requires ~0.01 ETH for gas
- Heartbeats sent every 24 hours (configurable)
- No monthly fees, zero cost to participate

### 3. ComputeNode

Handles task execution and result submission.

```typescript
import { ComputeNode } from '@affectively/edgework-sdk/agent';

const node = new ComputeNode({
  gatewayUrl: 'http://localhost:8080',
  cpuAllocation: 0.8,
  memoryMB: 2048,
  maxTaskDuration: 600,
  enableGPU: true,
});

// Start listening for tasks
await node.start();

// Node automatically:
// 1. Fetches tasks from gateway
// 2. Executes using WebGPU/WebNN/CPU
// 3. Submits results
// 4. Tracks stats

// Get statistics
const stats = node.getStats();
// {
//   tasksCompleted: 42,
//   totalComputeTime: 1234.5,
//   estimatedEarnings: 12.34,
//   activeTaskCount: 2,
//   cpuUsage: 0.75,
//   memoryUsage: 0.45,
//   uptime: 3600000
// }

// Stop
await node.stop();
```

### 4. AgentManager

Orchestrates gateway connector and compute node.

```typescript
import { AgentManager } from '@affectively/edgework-sdk/agent';

const manager = new AgentManager({
  gatewayName: 'My Compute Node',
  cpuAllocation: 0.8,
  enableSystemTray: true,
  runAtBoot: true,
});

// Initialize
await manager.initialize();

// Start (connects gateway, starts compute)
await manager.start();

// Listen for events
manager.on('started', () => {
  console.log('Agent started');
});

manager.on('statsUpdated', ({ stats }) => {
  console.log('Earnings:', stats.estimatedEarnings);
});

manager.on('error', ({ error, context }) => {
  console.error(`Error in ${context}:`, error);
});

// Get current stats
const stats = manager.getStats();

// Stop gracefully
await manager.stop('User requested');
```

### 5. SystemTray

Native system tray integration (macOS/Windows/Linux).

```typescript
import { createSystemTray } from '@affectively/edgework-sdk/agent';

const tray = createSystemTray({
  agentManager: manager,
  showOnStartup: true,
  clickBehavior: 'show',
});

await tray.show();

// Update status
await tray.setStatus('Computing...');

// Update stats
await tray.updateStats();
```

**Platform Support:**
- **macOS**: Cocoa/SwiftUI via menu bar
- **Windows**: Windows API tray + context menu
- **Linux**: xdg-desktop-portal + GTK (GNOME/KDE/XFCE compatible)

## Setup Flow

### Option 1: Interactive Setup

```bash
bun run agent:setup

# Follow prompts:
# ✓ Create new wallet? (y/n)
# ✓ Gateway name? (default: Edgework Agent)
# ✓ Region? (us-west, eu-central, etc.)
# ✓ CPU allocation %? (1-100, default: 80)
# ✓ Enable GPU acceleration? (y/n)
# ✓ Enable system tray? (y/n)
# ✓ Run at boot? (y/n)
```

### Option 2: Programmatic

```typescript
import { runSetupWizard, completeSetup } from '@affectively/edgework-sdk/agent';

// Non-interactive
const answers = await runSetupWizard(true);

// Or interactive
const answers = await runSetupWizard(false);

// Complete setup
await completeSetup(answers);
```

## CLI Commands

```bash
# Setup (interactive or non-interactive)
bun run agent:setup
bun run agent:setup --non-interactive

# Start/stop agent
bun run agent:start
bun run agent:stop

# View status
bun run agent:status

# View earnings
bun run agent:earnings

# Gateway management
bun run gateway:start
```

## Configuration

Config saved to `~/.edgework/agent-config.json`:

```json
{
  "gateway": {
    "name": "Office Worker",
    "region": "us-west",
    "walletAddress": "0x...",
    "metadata": {
      "cpuAllocation": 0.8,
      "gpu": true,
      "country": "US"
    }
  },
  "compute": {
    "cpuAllocation": 0.8,
    "memoryMB": 2048,
    "maxTaskDuration": 600,
    "enableGPU": true,
    "enableWebNN": true
  },
  "system": {
    "runAtBoot": true,
    "systemTray": true,
    "logLevel": "info"
  }
}
```

## Boot Persistence

### macOS (launchd)

Agent auto-starts via `~/Library/LaunchAgents/ai.edgework.agent.plist`:

```bash
# Manually enable
launchctl load ~/Library/LaunchAgents/ai.edgework.agent.plist

# Disable
launchctl unload ~/Library/LaunchAgents/ai.edgework.agent.plist
```

### Linux (systemd)

Agent auto-starts via `~/.config/systemd/user/edgework-agent.service`:

```bash
# Enable
systemctl --user enable edgework-agent.service
systemctl --user start edgework-agent.service

# View logs
journalctl --user -u edgework-agent -f
```

### Windows (Task Scheduler)

Agent registered as scheduled task:

```powershell
# Enable (as Administrator)
schtasks /create /tn "EdgeworkAgent" /tr "bun run agent:start" /sc onlogon
```

## Earning Model

1. **Task Received**: Agent fetches task from gateway
2. **Compute**: Executes using available WebGPU/WebNN/CPU
3. **Report**: Submits result back to gateway
4. **Verify**: Off-chain oracle verifies result integrity
5. **Credit**: EDGEWORK tokens accumulate on-chain
6. **Claim**: User claims rewards through dashboard

**Gateway Commission**: 5% of facilitated compute (goes to gateway operator)

## Usage Examples

### Headless Server

```bash
# Run in background, auto-restart on crash
bun run agent:start &
disown

# Or daemonize
setsid bun run agent:start > ~/.edgework/logs/agent.log 2>&1 &
```

### Docker

```dockerfile
FROM oven/bun:latest

WORKDIR /app
COPY package.json .
RUN bun install

# Setup in non-interactive mode
RUN bun run agent:setup --non-interactive

# Start agent
CMD ["bun", "run", "agent:start"]
```

### GitHub Actions (Gray Zone)

```yaml
- name: Setup Edgework
  run: |
    bun install @affectively/edgework-sdk
    bun run agent:setup --non-interactive

- name: Run Tests with Compute
  run: bun test
  env:
    EDGEWORK_ENABLED: true
```

### Testing

```typescript
import { AgentManager } from '@affectively/edgework-sdk/agent';

describe('AgentManager', () => {
  it('should initialize and start', async () => {
    const manager = new AgentManager({
      gatewayName: 'Test',
      cpuAllocation: 0.1,
    });

    await manager.initialize();
    await manager.start();

    expect(manager.getStats().tasksCompleted).toBe(0);

    await manager.stop();
  });

  it('should emit events', async () => {
    const manager = new AgentManager();
    const events: any[] = [];

    manager.on('started', (e) => events.push(e));
    manager.on('stopped', (e) => events.push(e));

    await manager.initialize();
    await manager.start();
    await manager.stop();

    expect(events).toHaveLength(2);
  });
});
```

## Troubleshooting

### "Wallet not found"

```bash
# Create new wallet
bun run agent:setup
```

### "Failed to register gateway"

- Check internet connection
- Verify Optimism Sepolia RPC is accessible
- Ensure wallet has ~0.01 ETH for gas

### "System tray not available"

- macOS: Should work natively (Cocoa.framework included)
- Windows: Ensure Windows.h available
- Linux: Install GTK 3: `apt install libgtk-3-0`

### "Compute tasks not received"

- Check firewall rules
- Verify gateway URL is reachable
- Check logs: `bun run agent:status --logs`

## Security Considerations

1. **Key Storage**: Keys encrypted locally with device-specific key
2. **No Remote Access**: Agent never uploads keys
3. **Isolated Execution**: Compute runs in isolated workers
4. **Resource Limits**: CPU/memory allocations enforced
5. **Audit Trail**: All transactions on Optimism are auditable

## Performance Tips

1. **CPU Allocation**: Start at 0.5-0.8, increase for dedicated hardware
2. **GPU**: Enable for 3-5x compute throughput
3. **Memory**: Allocate generously (2GB-4GB minimum)
4. **Network**: Use wired connection for better reliability
5. **Uptime**: Keep agent running 24/7 for maximum earnings

## License

Apache-2.0

---

**Build the future. Contribute compute. Earn rewards. 🚀**
