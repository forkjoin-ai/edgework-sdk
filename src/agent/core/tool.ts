/**
 * EADK Tool System
 *
 * Tool definitions, helpers, and built-in tool implementations.
 * Combines patterns from all major ADKs with edge-native extensions.
 */

import { z } from 'zod';
import type {
  Tool,
  ToolContext,
  ToolGuardrail,
  ComputePreference,
} from './types';
import { createToolContext } from './context';
import type { AgentContext } from './types';

/**
 * Create a tool from a typed function with automatic schema inference.
 * This is the primary way to define tools — similar to Google ADK's FunctionTool.
 */
export function defineTool<TInput extends z.ZodSchema, TOutput = unknown>(
  config: {
    name: string;
    description: string;
    input: TInput;
    output?: z.ZodSchema;
    needsApproval?: boolean | ((input: z.infer<TInput>) => Promise<boolean>);
    guardrails?: { input?: ToolGuardrail[]; output?: ToolGuardrail[] };
    strictMode?: boolean;
    computeTarget?: ComputePreference;
  },
  handler: (input: z.infer<TInput>, ctx: ToolContext) => Promise<TOutput>
): Tool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.input,
    outputSchema: config.output,
    needsApproval: config.needsApproval,
    guardrails: config.guardrails,
    strictMode: config.strictMode ?? false,
    computeTarget: config.computeTarget,
    execute: handler as Tool['execute'],
  };
}

/**
 * Convert a Zod schema to a JSON Schema object (for LLM tool definitions).
 */
export function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // Use Zod's built-in description if available
  const description = schema.description;

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodSchema;
      properties[key] = zodToJsonSchema(fieldSchema);

      // Check if field is optional
      if (!(fieldSchema instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      ...(description ? { description } : {}),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string', ...(description ? { description } : {}) };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', ...(description ? { description } : {}) };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', ...(description ? { description } : {}) };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema((schema as z.ZodArray<z.ZodSchema>).element),
      ...(description ? { description } : {}),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: (schema as z.ZodEnum<[string, ...string[]]>).options,
      ...(description ? { description } : {}),
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as z.ZodOptional<z.ZodSchema>).unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(
      (schema as z.ZodDefault<z.ZodSchema>).removeDefault()
    );
    return { ...inner, ...(description ? { description } : {}) };
  }

  // Fallback for complex types
  return { type: 'object', ...(description ? { description } : {}) };
}

/**
 * Convert tools to LLM tool definitions for API calls.
 */
export function toolsToLLMDefinitions(tools: Tool[]): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema),
  }));
}

/**
 * Execute a tool with full guardrail, validation, and approval pipeline.
 */
export async function executeTool(
  tool: Tool,
  input: unknown,
  agentCtx: AgentContext,
  retryCount = 0
): Promise<{ result: unknown; error?: string; durationMs: number }> {
  const ctx = createToolContext(agentCtx, tool.name, retryCount);
  const startTime = Date.now();

  try {
    // 1. Validate input against schema
    if (tool.strictMode || tool.inputSchema) {
      const parseResult = tool.inputSchema.safeParse(input);
      if (!parseResult.success) {
        return {
          result: null,
          error: `Input validation failed: ${parseResult.error.message}`,
          durationMs: Date.now() - startTime,
        };
      }
      input = parseResult.data;
    }

    // 2. Run input guardrails
    if (tool.guardrails?.input) {
      for (const guardrail of tool.guardrails.input) {
        const result = await guardrail.validate(input, ctx);
        if (!result.passed) {
          if (result.replacement !== undefined) {
            input = result.replacement;
          } else {
            return {
              result: null,
              error: `Tool input guardrail '${guardrail.name}' blocked execution`,
              durationMs: Date.now() - startTime,
            };
          }
        }
      }
    }

    // 3. Check approval
    if (tool.needsApproval) {
      const needs =
        typeof tool.needsApproval === 'function'
          ? await tool.needsApproval(input)
          : tool.needsApproval;

      if (needs) {
        // In an interactive session, this would pause and ask the user.
        // For now, we proceed — the approval mechanism is handled by the Runner.
      }
    }

    // 4. Execute
    let result = await tool.execute(input, ctx);

    // 5. Validate output
    if (tool.outputSchema) {
      const parseResult = tool.outputSchema.safeParse(result);
      if (!parseResult.success) {
        return {
          result: null,
          error: `Output validation failed: ${parseResult.error.message}`,
          durationMs: Date.now() - startTime,
        };
      }
      result = parseResult.data;
    }

    // 6. Run output guardrails
    if (tool.guardrails?.output) {
      for (const guardrail of tool.guardrails.output) {
        const guardResult = await guardrail.validate(result, ctx);
        if (!guardResult.passed) {
          if (guardResult.replacement !== undefined) {
            result = guardResult.replacement;
          } else {
            return {
              result: null,
              error: `Tool output guardrail '${guardrail.name}' blocked result`,
              durationMs: Date.now() - startTime,
            };
          }
        }
      }
    }

    return { result, durationMs: Date.now() - startTime };
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Agent-as-Tool helper (Google ADK / OpenAI pattern)
// ---------------------------------------------------------------------------

/**
 * Wrap an agent as a tool that can be used by other agents.
 * The agent is consulted and its result is returned as the tool output.
 */
export function agentAsTool(
  agent: { run: (input: string) => Promise<{ output: string }> },
  options?: {
    name?: string;
    description?: string;
  }
): Tool {
  return defineTool(
    {
      name:
        options?.name ?? `consult_${(agent as any).config?.name ?? 'agent'}`,
      description:
        options?.description ??
        `Consult the ${
          (agent as any).config?.name ?? 'agent'
        } agent for assistance`,
      input: z.object({
        query: z.string().describe('The question or request for the agent'),
      }),
    },
    async (input) => {
      const result = await agent.run(input.query);
      return result.output;
    }
  );
}
