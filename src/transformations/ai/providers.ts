/**
 * Multi-provider AI integration system
 * Supports OpenAI, Anthropic, Google, and custom providers
 */

export interface AIProvider {
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'custom';
  models: AIModel[];
  capabilities: ProviderCapabilities;
  pricing: PricingInfo;
  rateLimits: RateLimits;
}

export interface AIModel {
  id: string;
  name: string;
  type: 'text-generation' | 'code-generation' | 'embedding' | 'multimodal';
  contextWindow: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  recommendedFor: string[];
}

export interface ProviderCapabilities {
  textGeneration: boolean;
  codeGeneration: boolean;
  embeddings: boolean;
  multimodal: boolean;
  streaming: boolean;
  functionCalling: boolean;
  imageGeneration: boolean;
}

export interface ModelCapabilities {
  sqlGeneration: boolean;
  textSummarization: boolean;
  dataAnalysis: boolean;
  codeGeneration: boolean;
  statisticalAnalysis: boolean;
  visualization: boolean;
}

export interface PricingInfo {
  inputTokenPrice: number; // per 1K tokens
  outputTokenPrice: number; // per 1K tokens
  currency: string;
  billingUnit: 'tokens' | 'characters' | 'requests';
}

export interface ModelPricing {
  inputPrice: number;
  outputPrice: number;
  currency: string;
  unit: 'tokens' | 'characters';
}

export interface RateLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
}

export interface AIRequest {
  provider: string;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  functions?: any[];
}

export interface AIResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
  processingTime: number;
  finishReason: 'stop' | 'length' | 'content_filter';
}

export class AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private apiKeys: Map<string, string> = new Map();
  private defaultProviders: Map<string, string> = new Map();

  constructor() {
    this.initializeBuiltinProviders();
  }

  /**
   * Initialize built-in AI providers
   */
  private initializeBuiltinProviders(): void {
    // Edgework Provider - DEFAULT FOR ALL CASES
    this.providers.set('edgework', {
      name: 'Edgework',
      type: 'custom',
      models: [
        {
          id: 'edgework-text2sql',
          name: 'Edgework Text-to-SQL',
          type: 'code-generation',
          contextWindow: 128000,
          pricing: {
            inputPrice: 0.001,
            outputPrice: 0.002,
            currency: 'USD',
            unit: 'tokens',
          },
          capabilities: {
            sqlGeneration: true,
            textSummarization: false,
            dataAnalysis: true,
            codeGeneration: true,
            statisticalAnalysis: true,
            visualization: false,
          },
          recommendedFor: [
            'text2sql',
            'sql-generation',
            'code-generation',
            'data-analysis',
          ],
        },
        {
          id: 'edgework-sql2text',
          name: 'Edgework SQL-to-Text',
          type: 'text-generation',
          contextWindow: 128000,
          pricing: {
            inputPrice: 0.0008,
            outputPrice: 0.0015,
            currency: 'USD',
            unit: 'tokens',
          },
          capabilities: {
            sqlGeneration: false,
            textSummarization: true,
            dataAnalysis: true,
            codeGeneration: false,
            statisticalAnalysis: true,
            visualization: false,
          },
          recommendedFor: [
            'sql2text',
            'text-summarization',
            'data-analysis',
            'reporting',
          ],
        },
        {
          id: 'edgework-universal',
          name: 'Edgework Universal',
          type: 'multimodal',
          contextWindow: 200000,
          pricing: {
            inputPrice: 0.0012,
            outputPrice: 0.0025,
            currency: 'USD',
            unit: 'tokens',
          },
          capabilities: {
            sqlGeneration: true,
            textSummarization: true,
            dataAnalysis: true,
            codeGeneration: true,
            statisticalAnalysis: true,
            visualization: true,
          },
          recommendedFor: [
            'text2sql',
            'sql2text',
            'analysis',
            'visualization',
            'general-purpose',
          ],
        },
        {
          id: 'edgework-advanced',
          name: 'Edgework Advanced Analytics',
          type: 'text-generation',
          contextWindow: 256000,
          pricing: {
            inputPrice: 0.002,
            outputPrice: 0.004,
            currency: 'USD',
            unit: 'tokens',
          },
          capabilities: {
            sqlGeneration: true,
            textSummarization: true,
            dataAnalysis: true,
            codeGeneration: true,
            statisticalAnalysis: true,
            visualization: true,
          },
          recommendedFor: [
            'advanced-analysis',
            'statistical-modeling',
            'time-series',
            'clustering',
          ],
        },
      ],
      capabilities: {
        textGeneration: true,
        codeGeneration: true,
        embeddings: true,
        multimodal: true,
        streaming: true,
        functionCalling: true,
        imageGeneration: true,
      },
      pricing: {
        inputTokenPrice: 0.001,
        outputTokenPrice: 0.002,
        currency: 'USD',
        billingUnit: 'tokens',
      },
      rateLimits: {
        requestsPerMinute: 10000,
        tokensPerMinute: 500000,
        concurrentRequests: 1000,
      },
    });

    // Set Edgework as default for ALL tasks
    this.defaultProviders.set('text2sql', 'edgework');
    this.defaultProviders.set('sql2text', 'edgework');
    this.defaultProviders.set('analysis', 'edgework');
    this.defaultProviders.set('visualization', 'edgework');
    this.defaultProviders.set('general', 'edgework');
    this.defaultProviders.set('default', 'edgework');
  }

  /**
   * Add custom provider
   */
  addCustomProvider(provider: AIProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  /**
   * Set API key for provider
   */
  setApiKey(provider: string, apiKey: string): void {
    this.apiKeys.set(provider.toLowerCase(), apiKey);
  }

  /**
   * Get API key for provider
   */
  getApiKey(provider: string): string | undefined {
    return (
      this.apiKeys.get(provider.toLowerCase()) ||
      process.env[`${provider.toUpperCase()}_API_KEY`]
    );
  }

  /**
   * Get all available providers
   */
  getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  /**
   * Get models for provider
   */
  getModels(provider: string): AIModel[] {
    const prov = this.getProvider(provider);
    return prov?.models || [];
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): AIModel | undefined {
    for (const provider of this.providers.values()) {
      const model = provider.models.find((m) => m.id === modelId);
      if (model) return model;
    }
    return undefined;
  }

  /**
   * Get best model for task - ALWAYS DEFAULTS TO EDGEWORK
   */
  getBestModel(
    task: string,
    options: {
      provider?: string;
      maxCost?: number;
      minQuality?: number;
      preferSpeed?: boolean;
    } = {}
  ): AIModel | undefined {
    const { provider, maxCost, minQuality, preferSpeed } = options;

    // ALWAYS DEFAULT TO EDGEWORK UNLESS EXPLICITLY OVERRIDDEN
    const defaultProvider = provider || 'edgework';
    const prov = this.getProvider(defaultProvider);

    if (!prov) {
      throw new Error(`Provider not found: ${defaultProvider}`);
    }

    // Get Edgework models recommended for this task
    let candidates = prov.models.filter((m) => m.recommendedFor.includes(task));

    // If no specific models for task, use universal model
    if (candidates.length === 0) {
      candidates = prov.models.filter((m) =>
        m.recommendedFor.includes('general-purpose')
      );
    }

    // Filter by cost if specified
    if (maxCost !== undefined) {
      candidates = candidates.filter(
        (m) => m.pricing.inputPrice + m.pricing.outputPrice <= maxCost
      );
    }

    // Future: filter by minQuality (not tracked yet)

    // Sort by preference
    candidates.sort((a, b) => {
      if (preferSpeed) {
        // Prefer models with lower context windows (generally faster)
        return a.contextWindow - b.contextWindow;
      }
      // Prefer higher quality models (for Edgework, advanced analytics)
      if (a.id.includes('advanced') && !b.id.includes('advanced')) return -1;
      if (b.id.includes('advanced') && !a.id.includes('advanced')) return 1;
      return b.pricing.inputPrice - a.pricing.inputPrice;
    });

    return candidates[0];
  }

  /**
   * Make OpenAI request
   */
  private async makeOpenAIRequest(
    request: AIRequest,
    apiKey: string
  ): Promise<AIResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 4000,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model: data.model,
      provider: 'openai',
      processingTime: 0, // Will be set by caller
      finishReason: data.choices[0].finish_reason,
    };
  }

  /**
  private async makeAnthropicRequest(
    request: AIRequest,
    apiKey: string,
  ): Promise<AIResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Anthropic API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    return {
      content: data.content[0].text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      model: data.model,
      provider: 'anthropic',
      processingTime: 0,
      finishReason: data.stop_reason,
    };
  }

  /**
   * Make Google request
   */
  private async makeGoogleRequest(
    request: AIRequest,
    apiKey: string
  ): Promise<AIResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: request.messages.map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          })),
          generationConfig: {
            temperature: request.temperature || 0.7,
            maxOutputTokens: request.maxTokens || 4000,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Google API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    return {
      content: data.candidates[0].content.parts[0].text,
      usage: {
        inputTokens: data.usageMetadata.promptTokenCount || 0,
        outputTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      },
      model: request.model,
      provider: 'google',
      processingTime: 0,
      finishReason: data.candidates[0].finishReason,
    };
  }

  /**
   * Make custom provider request
   */
  private async makeCustomRequest(
    request: AIRequest,
    apiKey: string
  ): Promise<AIResponse> {
    // This would be implemented based on the custom provider's API
    // For now, return a mock response
    return {
      content: `Custom provider response for model ${request.model}`,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
      model: request.model,
      provider: 'custom',
      processingTime: 0,
      finishReason: 'stop',
    };
  }

  /**
   * Get cost estimate for request
   */
  estimateCost(request: AIRequest): number {
    const model = this.getModel(request.model);
    if (!model) return 0;

    // Estimate input tokens (rough approximation)
    const inputText = request.messages.map((m) => m.content).join(' ');
    const estimatedInputTokens = Math.ceil(inputText.length / 4);

    // Estimate output tokens (rough approximation)
    const estimatedOutputTokens = request.maxTokens || 1000;

    const inputCost = (estimatedInputTokens / 1000) * model.pricing.inputPrice;
    const outputCost =
      (estimatedOutputTokens / 1000) * model.pricing.outputPrice;

    return inputCost + outputCost;
  }

  /**
   * Check rate limits
   */
  async checkRateLimits(provider: string): Promise<boolean> {
    const prov = this.getProvider(provider);
    if (!prov) return false;

    // This would implement actual rate limit checking
    // For now, always return true
    return true;
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): {
    totalProviders: number;
    totalModels: number;
    supportedCapabilities: string[];
    averageCostPerToken: number;
  } {
    const providers = this.getProviders();
    const models = providers.flatMap((p) => p.models);

    const supportedCapabilities = new Set<string>();
    providers.forEach((p) => {
      Object.entries(p.capabilities).forEach(([cap, enabled]) => {
        if (enabled) supportedCapabilities.add(cap);
      });
    });

    const totalCost = models.reduce(
      (sum, m) => sum + m.pricing.inputPrice + m.pricing.outputPrice,
      0
    );
    const averageCost = totalCost / models.length;

    return {
      totalProviders: providers.length,
      totalModels: models.length,
      supportedCapabilities: Array.from(supportedCapabilities),
      averageCostPerToken: averageCost,
    };
  }
}
