/**
 * PII Detection Guardrail
 *
 * Detects and optionally redacts personally identifiable information.
 * AWS Bedrock pattern.
 */

import type {
  Guardrail,
  GuardrailResult,
  GuardrailContext,
} from '../core/types';

export interface PIIConfig {
  /** PII types to detect */
  types?: PIIType[];
  /** Whether to redact (replace with placeholder) or just detect */
  redact?: boolean;
  /** Custom redaction placeholder (default: [REDACTED]) */
  placeholder?: string;
  /** Whether to trigger tripwire on detection */
  tripwire?: boolean;
}

export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'address'
  | 'name';

const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  address:
    /\b\d{1,5}\s+\w+(?:\s+\w+)*\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way)\b/gi,
  name: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
};

const DEFAULT_TYPES: PIIType[] = ['email', 'phone', 'ssn', 'credit_card'];

/**
 * Create a PII detection guardrail.
 */
export function createPIIGuardrail(config?: PIIConfig): Guardrail {
  const types = config?.types ?? DEFAULT_TYPES;
  const redact = config?.redact ?? true;
  const placeholder = config?.placeholder ?? '[REDACTED]';
  const tripwire = config?.tripwire ?? false;

  return {
    name: 'pii_detection',
    tripwire,
    validate: async (
      input: unknown,
      _ctx: GuardrailContext
    ): Promise<GuardrailResult> => {
      const text = String(input);
      const detections: Array<{ type: PIIType; match: string }> = [];

      for (const type of types) {
        const pattern = PII_PATTERNS[type];
        // Reset regex state
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          detections.push({ type, match: match[0] });
        }
      }

      if (detections.length === 0) {
        return { passed: true };
      }

      // Redact if configured
      let replacement: string | undefined;
      if (redact) {
        let redacted = text;
        for (const type of types) {
          const pattern = PII_PATTERNS[type];
          pattern.lastIndex = 0;
          redacted = redacted.replace(pattern, placeholder);
        }
        replacement = redacted;
      }

      return {
        passed: false,
        tripwireTriggered: tripwire,
        info: {
          detections: detections.map((d) => ({
            type: d.type,
            matchLength: d.match.length,
          })),
          detectionCount: detections.length,
        },
        replacement: redact ? replacement : undefined,
      };
    },
  };
}
