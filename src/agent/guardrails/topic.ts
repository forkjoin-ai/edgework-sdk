/**
 * Topic Control Guardrail
 *
 * Blocks forbidden topics and enforces on-topic responses.
 * AWS Bedrock pattern.
 */

import type {
  Guardrail,
  GuardrailResult,
  GuardrailContext,
} from '../core/types';

export interface TopicConfig {
  /** Forbidden topics (will block if detected) */
  forbiddenTopics?: string[];
  /** Allowed topics (will block if NOT detected — use for narrow scoping) */
  allowedTopics?: string[];
  /** Custom topic detection patterns */
  patterns?: Record<string, RegExp[]>;
  /** Whether to trigger tripwire */
  tripwire?: boolean;
}

/**
 * Create a topic control guardrail.
 */
export function createTopicGuardrail(config: TopicConfig): Guardrail {
  const tripwire = config.tripwire ?? false;

  return {
    name: 'topic_control',
    tripwire,
    validate: async (
      input: unknown,
      _ctx: GuardrailContext
    ): Promise<GuardrailResult> => {
      const text = String(input).toLowerCase();

      // Check forbidden topics
      if (config.forbiddenTopics) {
        for (const topic of config.forbiddenTopics) {
          const topicLower = topic.toLowerCase();
          if (text.includes(topicLower)) {
            // Check custom patterns if available
            const patterns = config.patterns?.[topic];
            if (patterns) {
              for (const pattern of patterns) {
                if (pattern.test(text)) {
                  return {
                    passed: false,
                    tripwireTriggered: tripwire,
                    info: { forbiddenTopic: topic, matched: true },
                  };
                }
              }
            } else {
              return {
                passed: false,
                tripwireTriggered: tripwire,
                info: { forbiddenTopic: topic, matched: true },
              };
            }
          }
        }
      }

      // Check allowed topics (if specified, must match at least one)
      if (config.allowedTopics && config.allowedTopics.length > 0) {
        const matchesAny = config.allowedTopics.some((topic) => {
          const topicLower = topic.toLowerCase();
          if (text.includes(topicLower)) return true;
          const patterns = config.patterns?.[topic];
          if (patterns) {
            return patterns.some((p) => p.test(text));
          }
          return false;
        });

        if (!matchesAny) {
          return {
            passed: false,
            tripwireTriggered: tripwire,
            info: {
              allowedTopics: config.allowedTopics,
              matched: false,
            },
          };
        }
      }

      return { passed: true };
    },
  };
}
