/**
 * Tokenizer Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { Tokenizer } from '../compute/inference/tokenizer';
import type { TokenizerData } from '../types';

/**
 * Create a minimal mock tokenizer data for testing
 */
function createMockTokenizerData(): TokenizerData {
  // Simple vocabulary with ChatML tokens
  const vocab: Record<string, number> = {
    '<pad>': 0,
    '<s>': 1,
    '</s>': 2,
    '<unk>': 3,
    '<|im_start|>': 4,
    '<|im_end|>': 5,
    Ġ: 6, // Space prefix (GPT-2 style)
    hello: 7,
    world: 8,
    Ġhello: 9,
    Ġworld: 10,
    user: 11,
    assistant: 12,
    system: 13,
    Ġuser: 14,
    Ġassistant: 15,
    Ġsystem: 16,
    '\n': 17,
    Hi: 18,
    Ġthere: 19,
    '!': 20,
    '.': 21,
    ',': 22,
    '?': 23,
    Ġa: 24,
    Ġthe: 25,
    Ġis: 26,
    Ġare: 27,
    Ġyou: 28,
    Ġhow: 29,
    Ġwhat: 30,
    Ġtest: 31,
    Ġmessage: 32,
    Ġcontent: 33,
  };

  // Simple merges (BPE-style)
  const merges = [
    'h e',
    'l l',
    'll o',
    'hel lo',
    'w o',
    'wo r',
    'wor l',
    'worl d',
    't e',
    'te s',
    'tes t',
  ].join('\n');

  // Special tokens
  const specialTokens: Record<string, number> = {
    '</s>': 2,
    '<|im_end|>': 5,
    '<|im_start|>': 4,
    '<pad>': 0,
    '<s>': 1,
    '<unk>': 3,
  };

  return {
    modelId: 'test-model',
    vocab: new TextEncoder().encode(JSON.stringify(vocab))
      .buffer as ArrayBuffer,
    merges: new TextEncoder().encode(merges).buffer as ArrayBuffer,
    specialTokens,
    chatTemplate: 'ChatML',
  };
}

describe('Tokenizer', () => {
  let tokenizer: Tokenizer;
  let tokenizerData: TokenizerData;

  beforeEach(() => {
    tokenizerData = createMockTokenizerData();
    tokenizer = new Tokenizer(tokenizerData);
  });
  describe('initialization', () => {
    it('creates tokenizer from data', () => {
      expect(tokenizer).toBeDefined();
      expect(tokenizer.vocabSize).toBeGreaterThan(0);
    });

    it('sets special token IDs', () => {
      expect(tokenizer.bosId).toBe(4); // <|im_start|>
      expect(tokenizer.eosId).toBe(5); // <|im_end|>
      expect(tokenizer.padId).toBe(0);
    });

    it('handles missing ChatML tokens by falling back', () => {
      const fallbackData: TokenizerData = {
        modelId: 'test',
        specialTokens: { '</s>': 2, '<pad>': 0, '<s>': 1 },
        vocab: new TextEncoder().encode(
          JSON.stringify({ '</s>': 2, '<pad>': 0, '<s>': 1 })
        ).buffer as ArrayBuffer,
      };
      const tok = new Tokenizer(fallbackData);
      expect(tok.bosId).toBe(1); // Falls back to <s>
      expect(tok.eosId).toBe(2); // Falls back to </s>
    });
  });

  describe('encode', () => {
    it('encodes special tokens', () => {
      const tokens = tokenizer.encode('<|im_start|>');
      expect(tokens).toContain(4); // <|im_start|> ID
    });

    it('encodes multiple special tokens', () => {
      const tokens = tokenizer.encode('<|im_start|><|im_end|>');
      expect(tokens[0]).toBe(4); // <|im_start|>
      expect(tokens[1]).toBe(5); // <|im_end|>
    });

    it('handles empty string', () => {
      const tokens = tokenizer.encode('');
      expect(tokens).toEqual([]);
    });
  });

  describe('decode', () => {
    it('decodes special tokens', () => {
      const decoded = tokenizer.decode([4]); // <|im_start|>
      expect(decoded).toBe('<|im_start|>');
    });

    it('decodes multiple special tokens', () => {
      const decoded = tokenizer.decode([4, 5]); // <|im_start|><|im_end|>
      expect(decoded).toBe('<|im_start|><|im_end|>');
    });

    it('handles empty array', () => {
      const decoded = tokenizer.decode([]);
      expect(decoded).toBe('');
    });

    it('handles unknown token IDs gracefully', () => {
      // Should not throw, just skip unknown tokens
      const decoded = tokenizer.decode([99999]);
      expect(typeof decoded).toBe('string');
    });
  });

  describe('roundtrip', () => {
    it('encode then decode preserves special tokens', () => {
      const original = '<|im_start|><|im_end|>';
      const tokens = tokenizer.encode(original);
      const decoded = tokenizer.decode(tokens);
      expect(decoded).toContain('<|im_start|>');
      expect(decoded).toContain('<|im_end|>');
    });
  });

  describe('formatChat', () => {
    it('formats single message', () => {
      const messages = [{ content: 'Hello!', role: 'user' }];
      const formatted = tokenizer.formatChat(messages);

      expect(formatted).toContain('<|im_start|>user');
      expect(formatted).toContain('Hello!');
      expect(formatted).toContain('<|im_end|>');
      expect(formatted).toContain('<|im_start|>assistant');
    });

    it('formats conversation with system message', () => {
      const messages = [
        { content: 'You are helpful.', role: 'system' },
        { content: 'Hi!', role: 'user' },
        { content: 'Hello!', role: 'assistant' },
      ];
      const formatted = tokenizer.formatChat(messages);

      expect(formatted).toContain('<|im_start|>system');
      expect(formatted).toContain('You are helpful.');
      expect(formatted).toContain('<|im_start|>user');
      expect(formatted).toContain('Hi!');
      expect(formatted).toContain('<|im_start|>assistant');
      expect(formatted).toContain('Hello!');
    });

    it('adds generation prompt by default', () => {
      const messages = [{ content: 'Hi!', role: 'user' }];
      const formatted = tokenizer.formatChat(messages, true);

      // Should end with assistant prompt
      expect(formatted.endsWith('<|im_start|>assistant\n')).toBe(true);
    });

    it('can skip generation prompt', () => {
      const messages = [{ content: 'Hi!', role: 'user' }];
      const formatted = tokenizer.formatChat(messages, false);

      // Should end with im_end
      expect(formatted.endsWith('<|im_end|>\n')).toBe(true);
    });

    it('handles empty messages', () => {
      const formatted = tokenizer.formatChat([]);
      // Should just have generation prompt
      expect(formatted).toBe('<|im_start|>assistant\n');
    });

    it('preserves message order', () => {
      const messages = [
        { content: 'First', role: 'user' },
        { content: 'Second', role: 'assistant' },
        { content: 'Third', role: 'user' },
      ];
      const formatted = tokenizer.formatChat(messages, false);

      const firstIdx = formatted.indexOf('First');
      const secondIdx = formatted.indexOf('Second');
      const thirdIdx = formatted.indexOf('Third');

      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });
  });

  describe('vocabSize', () => {
    it('returns correct vocabulary size', () => {
      expect(tokenizer.vocabSize).toBe(34); // From our mock vocab
    });
  });
});

describe('Tokenizer BPE', () => {
  it('handles empty merges', () => {
    const dataWithoutMerges: TokenizerData = {
      modelId: 'test',
      specialTokens: { '</s>': 2, '<pad>': 0, '<s>': 1 },
      vocab: new TextEncoder().encode(
        JSON.stringify({ '</s>': 2, '<pad>': 0, '<s>': 1 })
      ).buffer as ArrayBuffer,
    };
    const tok = new Tokenizer(dataWithoutMerges);
    // Should not throw with undefined merges
    expect(tok.vocabSize).toBe(3);
  });

  it('constructs BPE ranks from merges', () => {
    const tokenizerData = createMockTokenizerData();
    const tokenizer = new Tokenizer(tokenizerData);
    // Tokenizer was constructed successfully with merges
    expect(tokenizer).toBeDefined();
  });
});
