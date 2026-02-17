/**
 * BPE Tokenizer for SmolLM2 / LLaMA Models
 *
 * Implements byte-level BPE tokenization with special token handling.
 */

import type { TokenizerData } from '../../types';

// Byte to Unicode mapping (GPT-2 style)
function bytesToUnicode(): Map<number, string> {
  const bs: number[] = [];
  for (let i = 33; i <= 126; i++) bs.push(i); // '!' to '~'
  for (let i = 161; i <= 172; i++) bs.push(i); // Latin supplement
  for (let i = 174; i <= 255; i++) bs.push(i); // More Latin

  const cs: number[] = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }

  const map = new Map<number, string>();
  for (let i = 0; i < bs.length; i++) {
    map.set(bs[i], String.fromCharCode(cs[i]));
  }
  return map;
}

function unicodeToBytes(): Map<string, number> {
  const b2u = bytesToUnicode();
  const map = new Map<string, number>();
  for (const [b, u] of b2u) {
    map.set(u, b);
  }
  return map;
}

export class Tokenizer {
  private encoder: Map<string, number>;
  private decoder: Map<number, string>;
  private bpeRanks: Map<string, number>;
  private specialTokens: Map<string, number>;
  private reverseSpecialTokens: Map<number, string>;
  private byteEncoder: Map<number, string>;
  private byteDecoder: Map<string, number>;
  private chatTemplate?: string;

  // Special token IDs
  readonly bosId: number;
  readonly eosId: number;
  readonly padId: number;

  constructor(data: TokenizerData) {
    this.byteEncoder = bytesToUnicode();
    this.byteDecoder = unicodeToBytes();

    // Parse vocab
    const vocabText = new TextDecoder().decode(data.vocab);
    const vocab = JSON.parse(vocabText) as Record<string, number>;
    this.encoder = new Map(Object.entries(vocab));
    this.decoder = new Map();
    for (const [token, id] of this.encoder) {
      this.decoder.set(id, token);
    }

    // Parse merges
    this.bpeRanks = new Map();
    if (data.merges) {
      const mergesText = new TextDecoder().decode(data.merges);
      const lines = mergesText.split('\n').filter((l) => l.trim());
      for (let i = 0; i < lines.length; i++) {
        this.bpeRanks.set(lines[i], i);
      }
    }

    // Special tokens
    this.specialTokens = new Map(Object.entries(data.specialTokens));
    this.reverseSpecialTokens = new Map();
    for (const [token, id] of this.specialTokens) {
      this.reverseSpecialTokens.set(id, token);
    }

    this.bosId =
      this.specialTokens.get('<|im_start|>') ??
      this.specialTokens.get('<s>') ??
      1;
    this.eosId =
      this.specialTokens.get('<|im_end|>') ??
      this.specialTokens.get('</s>') ??
      2;
    this.padId = this.specialTokens.get('<pad>') ?? 0;

    this.chatTemplate = data.chatTemplate;
  }

  /**
   * Get pairs of adjacent characters in a word
   */
  private getPairs(word: string[]): Set<string> {
    const pairs = new Set<string>();
    for (let i = 0; i < word.length - 1; i++) {
      pairs.add(`${word[i]} ${word[i + 1]}`);
    }
    return pairs;
  }

  /**
   * Apply BPE to a word
   */
  private bpe(token: string): string {
    let word = token.split('');
    let pairs = this.getPairs(word);

    if (pairs.size === 0) {
      return token;
    }

    while (true) {
      // Find the pair with lowest rank
      let minRank = Infinity;
      let bestPair: string | null = null;

      for (const pair of pairs) {
        const rank = this.bpeRanks.get(pair);
        if (rank !== undefined && rank < minRank) {
          minRank = rank;
          bestPair = pair;
        }
      }

      if (bestPair === null) {
        break;
      }

      const [first, second] = bestPair.split(' ');
      const newWord: string[] = [];
      let i = 0;

      while (i < word.length) {
        const j = word.indexOf(first, i);
        if (j === -1) {
          newWord.push(...word.slice(i));
          break;
        }
        newWord.push(...word.slice(i, j));
        i = j;

        if (
          word[i] === first &&
          i < word.length - 1 &&
          word[i + 1] === second
        ) {
          newWord.push(first + second);
          i += 2;
        } else {
          newWord.push(word[i]);
          i += 1;
        }
      }

      word = newWord;
      if (word.length === 1) {
        break;
      }
      pairs = this.getPairs(word);
    }

    return word.join(' ');
  }

  /**
   * Encode text to token IDs
   */
  encode(text: string): number[] {
    const tokens: number[] = [];

    // Handle special tokens first
    const remaining = text;
    const specialPattern = new RegExp(
      Array.from(this.specialTokens.keys())
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|'),
      'g'
    );

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = specialPattern.exec(remaining)) !== null) {
      // Encode text before special token
      if (match.index > lastIndex) {
        const before = remaining.slice(lastIndex, match.index);
        tokens.push(...this.encodeOrdinary(before));
      }
      // Add special token
      const specialId = this.specialTokens.get(match[0]);
      if (specialId !== undefined) {
        tokens.push(specialId);
      }
      lastIndex = match.index + match[0].length;
    }

    // Encode remaining text
    if (lastIndex < remaining.length) {
      tokens.push(...this.encodeOrdinary(remaining.slice(lastIndex)));
    }

    return tokens;
  }

  /**
   * Encode ordinary text (no special tokens)
   */
  private encodeOrdinary(text: string): number[] {
    const tokens: number[] = [];
    const textBytes = new TextEncoder().encode(text);

    // Convert to unicode representation
    let unicodeText = '';
    for (const byte of textBytes) {
      const char = this.byteEncoder.get(byte);
      if (char) {
        unicodeText += char;
      }
    }

    // Split into words (simplified - real impl uses regex)
    const words = unicodeText.split(/(\s+)/);

    for (const word of words) {
      if (!word) continue;
      const bpeTokens = this.bpe(word).split(' ');
      for (const bpeToken of bpeTokens) {
        const id = this.encoder.get(bpeToken);
        if (id !== undefined) {
          tokens.push(id);
        }
      }
    }

    return tokens;
  }

  /**
   * Decode token IDs to text
   */
  decode(ids: number[]): string {
    const tokens: string[] = [];

    for (const id of ids) {
      // Check for special tokens
      const special = this.reverseSpecialTokens.get(id);
      if (special) {
        tokens.push(special);
        continue;
      }

      // Regular token
      const token = this.decoder.get(id);
      if (token) {
        tokens.push(token);
      }
    }

    // Convert unicode back to bytes
    const unicodeText = tokens.join('');
    const bytes: number[] = [];
    for (const char of unicodeText) {
      const byte = this.byteDecoder.get(char);
      if (byte !== undefined) {
        bytes.push(byte);
      }
    }

    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  /**
   * Format a conversation for chat
   */
  formatChat(
    messages: Array<{ role: string; content: string }>,
    addGenerationPrompt = true
  ): string {
    // ChatML format (SmolLM2/Qwen style)
    let formatted = '';
    for (const msg of messages) {
      formatted += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
    }
    if (addGenerationPrompt) {
      formatted += '<|im_start|>assistant\n';
    }
    return formatted;
  }

  /**
   * Get vocabulary size
   */
  get vocabSize(): number {
    return this.encoder.size;
  }
}

/**
 * Load tokenizer from storage
 */
export async function loadTokenizer(
  storage: { getTokenizer(modelId: string): Promise<TokenizerData | null> },
  modelId: string
): Promise<Tokenizer | null> {
  const data = await storage.getTokenizer(modelId);
  if (!data) return null;
  return new Tokenizer(data);
}
