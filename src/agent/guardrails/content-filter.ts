/**
 * Content Filter Guardrail
 *
 * Detects harmful content categories (AWS Bedrock pattern).
 */

import type {
  Guardrail,
  GuardrailResult,
  GuardrailContext,
} from '../core/types';

export interface ContentFilterConfig {
  /** Categories to filter */
  categories?: ContentCategory[];
  /** Custom blocked patterns (regex strings) */
  blockedPatterns?: string[];
  /** Threshold for detection (0-1, default 0.5) */
  threshold?: number;
  /** Whether to trigger tripwire on detection */
  tripwire?: boolean;
}

export type ContentCategory =
  | 'hate'
  | 'violence'
  | 'sexual'
  | 'self_harm'
  | 'dangerous'
  | 'illegal';

const DEFAULT_CATEGORIES: ContentCategory[] = [
  'hate',
  'violence',
  'sexual',
  'self_harm',
  'dangerous',
  'illegal',
];

// Pattern-based detection (lightweight, runs on-device)
const CATEGORY_PATTERNS: Record<ContentCategory, RegExp[]> = {
  hate: [
    /\b(hate\s+(?:speech|crime))\b/i,
    /\b(racial\s+slur|ethnic\s+cleansing)\b/i,
  ],
  violence: [
    /\b(how\s+to\s+(?:kill|murder|assassinate|bomb|poison))\b/i,
    /\b(mass\s+(?:shooting|murder|casualty))\b/i,
  ],
  sexual: [/\b(explicit\s+(?:sexual|pornographic))\b/i],
  self_harm: [
    /\b(how\s+to\s+(?:commit\s+suicide|self[\s-]harm|hurt\s+(?:myself|yourself)))\b/i,
  ],
  dangerous: [
    /\b(how\s+to\s+(?:make|build|create)\s+(?:a\s+)?(?:bomb|explosive|weapon|poison))\b/i,
  ],
  illegal: [/\b(how\s+to\s+(?:hack|steal|forge|counterfeit|launder))\b/i],
};

/**
 * Create a content filter guardrail.
 */
export function createContentFilterGuardrail(
  config?: ContentFilterConfig
): Guardrail {
  const categories = config?.categories ?? DEFAULT_CATEGORIES;
  const blockedPatterns = (config?.blockedPatterns ?? []).map(
    (p) => new RegExp(p, 'i')
  );
  const tripwire = config?.tripwire ?? false;

  return {
    name: 'content_filter',
    tripwire,
    validate: async (
      input: unknown,
      _ctx: GuardrailContext
    ): Promise<GuardrailResult> => {
      const text = String(input);
      const detectedCategories: ContentCategory[] = [];

      // Check category patterns
      for (const category of categories) {
        const patterns = CATEGORY_PATTERNS[category] ?? [];
        for (const pattern of patterns) {
          if (pattern.test(text)) {
            detectedCategories.push(category);
            break;
          }
        }
      }

      // Check custom blocked patterns
      const blockedMatches: string[] = [];
      for (const pattern of blockedPatterns) {
        if (pattern.test(text)) {
          blockedMatches.push(pattern.source);
        }
      }

      const passed =
        detectedCategories.length === 0 && blockedMatches.length === 0;

      return {
        passed,
        tripwireTriggered: !passed && tripwire,
        info: {
          detectedCategories,
          blockedMatches,
        },
      };
    },
  };
}
