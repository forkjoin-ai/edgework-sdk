# Edgework Agent Dev Kit - Quick Reference

## TL;DR

```bash
# 1. Setup (one-time, interactive)
bun run agent:setup

# 2. Start gateway
bun run gateway:start &

# 3. Start agent
bun run agent:start

# 4. Check earnings
bun run agent:earnings

# 5. View status
bun run agent:status
```

That's it. Your computer now earns you EDGEWORK tokens.

---

## Commands

| Command | Purpose |
|---------|---------|
| `bun run agent:setup` | Interactive setup wizard |
| `bun run agent:start` | Start contributing compute |
| `bun run agent:stop` | Stop agent |
| `bun run agent:status` | View current status + stats |
| `bun run agent:earnings` | View on-chain rewards |
| `bun run gateway:start` | Start gateway (separate terminal) |

---

## What Happens

1. **Setup**: Creates wallet, registers gateway on Optimism
2. **Start**: Connects to mesh network, waits for tasks
3. **Execute**: Runs inference jobs using WebGPU/CPU
4. **Report**: Sends results back to gateway
5. **Earn**: Oracle verifies, credits rewards on-chain

---

## Architecture

```
Agent ← Gateway ← Compute Tasks
  ↓        ↓
Wallet    Heartbeat
  ↓
Optimism (Registry + Rewards)
```

---

## Key Features

✅ **One-Command Setup**
✅ **Auto Wallet Creation** (encrypted locally)
✅ **Optimism Registration** (free)
✅ **System Tray Integration** (macOS/Windows/Linux)
✅ **Boot Persistence** (optional)
✅ **WebGPU Support** (3-5x faster)
✅ **Zero Monthly Fees**

---

## Configuration

Stored at `~/.edgework/agent-config.json`:

```json
{
  "gateway": {
    "name": "My Agent",
    "region": "us-west",
    "walletAddress": "0x..."
  },
  "compute": {
    "cpuAllocation": 0.8,
    "memoryMB": 2048
  },
  "system": {
    "runAtBoot": true,
    "systemTray": true
  }
}
```

---

## Wallet Security

- Keys stored locally at `~/.edgework/wallet.json.enc`
- Encrypted with device-specific key (hostname + OS)
- AES-256-CBC encryption
- File permissions: 0o600 (owner only)
- **Never uploaded**, **never exposed**

---

## Earnings

Tasks → Execution → Result → Verification → Reward

- Base rate: ~$0.0001 per compute minute
- Gateway commission: 5%
- No upfront costs or fees

View earnings:
```bash
bun run agent:earnings
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Wallet not found" | Run `bun run agent:setup` |
| "Failed to register" | Check internet, ensure 0.01 ETH for gas |
| "No tasks received" | Check firewall, verify gateway running |
| "System tray unavailable" | Normal on headless servers |

---

## Platforms

| OS | Supported | Tray | Boot |
|----|-----------|------|------|
| macOS | ✅ | ✅ | ✅ launchd |
| Windows | ✅ | ✅ | ✅ Task Scheduler |
| Linux | ✅ | ✅ | ✅ systemd |
| Raspberry Pi | ✅ | ⚠️ | ✅ |
| Docker | ✅ | ❌ | N/A |

---

## Advanced Usage

### Docker

```dockerfile
FROM oven/bun:latest
COPY . /app
WORKDIR /app
RUN bun install
RUN bun run agent:setup --non-interactive
CMD ["bun", "run", "agent:start"]
```

### GitHub Actions

```yaml
- name: Setup Edgework
  run: bun run agent:setup --non-interactive

- name: Start Agent
  run: bun run agent:start &

- name: Run Tests
  run: bun test
```

### Headless Server

```bash
# Daemonize
setsid bun run agent:start > ~/.edgework/logs/agent.log 2>&1 &
```

---

## Performance Tips

1. **CPU**: Allocate 50-80% for best results
2. **GPU**: Enable if available (3-5x faster)
3. **Memory**: Use 2-4GB minimum
4. **Network**: Use wired for reliability
5. **Uptime**: 24/7 operation = maximum earnings

---

## FAQ

**Q: Is this legal?**
A: Yes. You're voluntarily contributing spare compute resources.

**Q: What if I stop?**
A: Just run `bun run agent:stop`. No penalties, no fees.

**Q: How much can I earn?**
A: Depends on CPU/GPU and uptime. Typical: $5-20/month per machine.

**Q: Are my keys safe?**
A: Yes. Encrypted locally, never transmitted.

**Q: Can I run multiple agents?**
A: Yes, on different machines. Each registers separately.

**Q: What about battery drain?**
A: Agent auto-pauses on battery power, or when configured.

---

## Resources

- **Full Docs**: [INTEGRATION.md](./INTEGRATION.md)
- **README**: [README.md](./README.md)
- **Source**: `packages/edgework-sdk/src/agent/`

---

**Start earning compute rewards today! 🚀**
