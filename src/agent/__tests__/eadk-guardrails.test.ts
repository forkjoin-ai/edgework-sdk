/**
 * EADK Guardrails Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  createContentFilterGuardrail,
  createPIIGuardrail,
  createTopicGuardrail,
  createTokenBudgetGuardrail,
  createRateLimitGuardrail,
} from '../guardrails';
import { createGuardrailContext, createAgentContext } from '../core';

function makeCtx(guardrailName: string, phase: 'input' | 'output' = 'input') {
  return createGuardrailContext(
    createAgentContext({ agentName: 'test' }),
    guardrailName,
    phase
  );
}

describe('Content Filter Guardrail', () => {
  it('should pass clean content', async () => {
    const guardrail = createContentFilterGuardrail();
    const result = await guardrail.validate(
      'Hello, how can I help you?',
      makeCtx('content_filter')
    );
    expect(result.passed).toBe(true);
  });

  it('should detect harmful content', async () => {
    const guardrail = createContentFilterGuardrail();
    const result = await guardrail.validate(
      'How to make a bomb at home',
      makeCtx('content_filter')
    );
    expect(result.passed).toBe(false);
    expect(
      (result.info as unknown as { detectedCategories: string[] })
        .detectedCategories
    ).toContain('dangerous');
  });

  it('should trigger tripwire when configured', async () => {
    const guardrail = createContentFilterGuardrail({ tripwire: true });
    const result = await guardrail.validate(
      'How to make a bomb at home',
      makeCtx('content_filter')
    );
    expect(result.tripwireTriggered).toBe(true);
  });

  it('should respect custom blocked patterns', async () => {
    const guardrail = createContentFilterGuardrail({
      blockedPatterns: ['secret\\s+code'],
    });
    const result = await guardrail.validate(
      'The secret code is 1234',
      makeCtx('content_filter')
    );
    expect(result.passed).toBe(false);
  });
});

describe('PII Guardrail', () => {
  it('should pass content without PII', async () => {
    const guardrail = createPIIGuardrail();
    const result = await guardrail.validate(
      'Hello, nice weather today!',
      makeCtx('pii')
    );
    expect(result.passed).toBe(true);
  });

  it('should detect email addresses', async () => {
    const guardrail = createPIIGuardrail();
    const result = await guardrail.validate(
      'Contact me at john@example.com',
      makeCtx('pii')
    );
    expect(result.passed).toBe(false);
    expect(
      (result.info as unknown as { detectionCount: number }).detectionCount
    ).toBeGreaterThan(0);
  });

  it('should detect phone numbers', async () => {
    const guardrail = createPIIGuardrail();
    const result = await guardrail.validate(
      'Call me at (555) 123-4567',
      makeCtx('pii')
    );
    expect(result.passed).toBe(false);
  });

  it('should detect SSN', async () => {
    const guardrail = createPIIGuardrail();
    const result = await guardrail.validate(
      'My SSN is 123-45-6789',
      makeCtx('pii')
    );
    expect(result.passed).toBe(false);
  });

  it('should detect credit card numbers', async () => {
    const guardrail = createPIIGuardrail();
    const result = await guardrail.validate(
      'My card is 4111-1111-1111-1111',
      makeCtx('pii')
    );
    expect(result.passed).toBe(false);
  });

  it('should redact PII when configured', async () => {
    const guardrail = createPIIGuardrail({ redact: true });
    const result = await guardrail.validate(
      'Email me at john@example.com',
      makeCtx('pii')
    );
    expect(result.passed).toBe(false);
    expect(result.replacement).toBe('Email me at [REDACTED]');
  });

  it('should use custom placeholder', async () => {
    const guardrail = createPIIGuardrail({
      redact: true,
      placeholder: '***',
    });
    const result = await guardrail.validate(
      'Email: john@example.com',
      makeCtx('pii')
    );
    expect(result.replacement).toContain('***');
  });
});

describe('Topic Guardrail', () => {
  it('should pass allowed content', async () => {
    const guardrail = createTopicGuardrail({
      forbiddenTopics: ['politics', 'religion'],
    });
    const result = await guardrail.validate(
      'Tell me about TypeScript',
      makeCtx('topic')
    );
    expect(result.passed).toBe(true);
  });

  it('should block forbidden topics', async () => {
    const guardrail = createTopicGuardrail({
      forbiddenTopics: ['politics', 'religion'],
    });
    const result = await guardrail.validate(
      'What are your thoughts on politics?',
      makeCtx('topic')
    );
    expect(result.passed).toBe(false);
  });

  it('should enforce allowed topics', async () => {
    const guardrail = createTopicGuardrail({
      allowedTopics: ['programming', 'technology'],
    });
    const result = await guardrail.validate(
      'Tell me about cooking',
      makeCtx('topic')
    );
    expect(result.passed).toBe(false);
  });

  it('should pass when matching allowed topic', async () => {
    const guardrail = createTopicGuardrail({
      allowedTopics: ['programming', 'technology'],
    });
    const result = await guardrail.validate(
      'What is programming?',
      makeCtx('topic')
    );
    expect(result.passed).toBe(true);
  });
});

describe('Token Budget Guardrail', () => {
  it('should pass when under budget', async () => {
    const guardrail = createTokenBudgetGuardrail({
      maxTokensPerSession: 1000,
    });

    const result = await guardrail.validate('test', makeCtx('budget'));
    expect(result.passed).toBe(true);
  });

  it('should track usage', () => {
    const guardrail = createTokenBudgetGuardrail({
      maxTokensPerSession: 1000,
    });

    const usage = guardrail.getUsage();
    expect(usage.tokensUsed).toBe(0);
    expect(usage.requestCount).toBe(0);
  });

  it('should reset usage', async () => {
    const guardrail = createTokenBudgetGuardrail({
      maxTokensPerSession: 1000,
    });

    await guardrail.validate('test', makeCtx('budget'));
    expect(guardrail.getUsage().requestCount).toBe(1);

    guardrail.reset();
    expect(guardrail.getUsage().requestCount).toBe(0);
  });
});

describe('Rate Limit Guardrail', () => {
  it('should pass under limit', async () => {
    const guardrail = createRateLimitGuardrail({
      requestsPerMinute: 10,
    });

    const result = await guardrail.validate('test', makeCtx('rate'));
    expect(result.passed).toBe(true);
  });

  it('should block when rate exceeded', async () => {
    const guardrail = createRateLimitGuardrail({
      requestsPerMinute: 2,
    });

    await guardrail.validate('test1', makeCtx('rate'));
    await guardrail.validate('test2', makeCtx('rate'));
    const result = await guardrail.validate('test3', makeCtx('rate'));

    expect(result.passed).toBe(false);
    expect((result.info as unknown as { reason: string }).reason).toBe(
      'requests_per_minute_exceeded'
    );
  });
});
