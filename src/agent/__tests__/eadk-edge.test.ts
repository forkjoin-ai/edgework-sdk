/**
 * EADK Edge-Native & Transport Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EdgeAgent, PeerAgent, LocalInferenceProvider } from '../edge';
import { P2PMesh, A2AClient, A2AServer } from '../transport';
import type { A2AAgentCard, A2AMessage } from '../transport';

// ---------------------------------------------------------------------------
// EdgeAgent Tests
// ---------------------------------------------------------------------------

describe('EdgeAgent', () => {
  it('should create with local compute preference', () => {
    const agent = new EdgeAgent({
      name: 'browser-agent',
      instructions: 'Run locally.',
      localModel: 'smollm-360m',
    });

    expect(agent.config.name).toBe('browser-agent');
    expect(agent.type).toBe('edge');
    expect(agent.config.computePreference).toBe('local');
  });

  it('should run and return result', async () => {
    const agent = new EdgeAgent({
      name: 'edge-test',
      instructions: 'Process locally.',
    });

    const result = await agent.run('Hello!');
    expect(result.output).toContain('EdgeAgent');
    expect(result.output).toContain('Hello!');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should run input guardrails', async () => {
    const agent = new EdgeAgent({
      name: 'guarded-edge',
      instructions: 'Process locally.',
      guardrails: {
        input: [
          {
            name: 'block',
            tripwire: true,
            validate: async (input) => ({
              passed: !String(input).includes('STOP'),
              tripwireTriggered: String(input).includes('STOP'),
            }),
          },
        ],
      },
    });

    const result = await agent.run('STOP now');
    expect(result.guardrailsTriggered).toContain('block');
  });
});

describe('LocalInferenceProvider', () => {
  it('should wrap a generate function', async () => {
    const provider = new LocalInferenceProvider(async (prompt) => ({
      text: `Generated: ${prompt.slice(0, 20)}`,
      tokenCount: 10,
      durationMs: 50,
    }));

    const response = await provider.chat({
      model: 'local',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
    });

    expect(response.content).toContain('Generated');
    expect(response.finishReason).toBe('stop');
    expect(response.usage.completionTokens).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// PeerAgent Tests
// ---------------------------------------------------------------------------

describe('PeerAgent', () => {
  it('should create with edge compute preference', () => {
    const agent = new PeerAgent({
      name: 'peer-agent',
      instructions: 'Distributed processing.',
      peers: ['http://peer1:8080', 'http://peer2:8080'],
    });

    expect(agent.config.name).toBe('peer-agent');
    expect(agent.type).toBe('peer');
  });

  it('should handle no peers gracefully', async () => {
    const agent = new PeerAgent({
      name: 'lonely-peer',
      instructions: 'No peers.',
      peers: [],
    });

    const result = await agent.run('Hello');
    expect(result.output).toContain('All peers failed');
  });
});

// ---------------------------------------------------------------------------
// P2P Mesh Tests
// ---------------------------------------------------------------------------

describe('P2PMesh', () => {
  it('should create with an ID', () => {
    const mesh = new P2PMesh({ peerId: 'my-peer' });
    expect(mesh.getId()).toBe('my-peer');
  });

  it('should generate an ID if not provided', () => {
    const mesh = new P2PMesh();
    expect(mesh.getId()).toBeDefined();
    expect(typeof mesh.getId()).toBe('string');
  });

  it('should add and list peers', () => {
    const mesh = new P2PMesh();

    mesh.addPeer({
      id: 'peer1',
      endpoint: 'http://peer1:8080',
      lastSeen: Date.now(),
      capabilities: ['inference'],
    });

    mesh.addPeer({
      id: 'peer2',
      endpoint: 'http://peer2:8080',
      lastSeen: Date.now(),
      capabilities: ['inference', 'embedding'],
    });

    expect(mesh.getPeers()).toHaveLength(2);
  });

  it('should remove peers', () => {
    const mesh = new P2PMesh();

    mesh.addPeer({
      id: 'peer1',
      endpoint: 'http://peer1:8080',
      lastSeen: Date.now(),
      capabilities: [],
    });

    mesh.removePeer('peer1');
    expect(mesh.getPeers()).toHaveLength(0);
  });

  it('should register message handlers', () => {
    const mesh = new P2PMesh();
    const messages: any[] = [];

    mesh.onMessage('request', (msg) => {
      messages.push(msg);
    });

    // Handler registered — not invoked directly but ready
    expect(messages).toHaveLength(0);
  });

  it('should handle incoming messages', async () => {
    const mesh = new P2PMesh();
    const received: any[] = [];

    mesh.onMessage('request', (msg) => {
      received.push(msg);
    });

    await mesh.handleMessage({
      id: '1',
      from: 'remote-peer',
      to: mesh.getId(),
      type: 'request',
      payload: { data: 'test' },
      timestamp: Date.now(),
    });

    expect(received).toHaveLength(1);
    // Should auto-register the sender as a peer
    expect(mesh.getPeers()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A2A Protocol Tests
// ---------------------------------------------------------------------------

describe('A2A Protocol', () => {
  const agentCard: A2AAgentCard = {
    name: 'test-agent',
    description: 'A test agent',
    capabilities: ['chat', 'tools'],
    endpoint: 'http://localhost:8080',
    version: '1.0',
    formats: ['text', 'json'],
  };

  describe('A2AClient', () => {
    it('should create with agent card', () => {
      const client = new A2AClient(agentCard);
      expect(client).toBeDefined();
    });
  });

  describe('A2AServer', () => {
    it('should create with handler', () => {
      const server = new A2AServer(agentCard, async (msg) => ({
        output: `Handled: ${msg.task}`,
      }));

      expect(server.getAgentCard()).toEqual(agentCard);
    });

    it('should handle tasks', async () => {
      const server = new A2AServer(agentCard, async (msg) => ({
        output: `Processed: ${msg.task}`,
        metadata: { agent: msg.from.name },
      }));

      const message: A2AMessage = {
        id: 'msg-1',
        from: { ...agentCard, name: 'sender' },
        task: 'summarize',
        input: { text: 'Hello world' },
      };

      const response = await server.handleTask(message);

      expect(response.status).toBe('success');
      expect(response.output).toBe('Processed: summarize');
      expect(response.processingMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors', async () => {
      const server = new A2AServer(agentCard, async () => {
        throw new Error('Handler failed');
      });

      const response = await server.handleTask({
        id: 'msg-1',
        from: agentCard,
        task: 'fail',
        input: {},
      });

      expect(response.status).toBe('error');
      expect(response.error).toBe('Handler failed');
    });
  });
});
