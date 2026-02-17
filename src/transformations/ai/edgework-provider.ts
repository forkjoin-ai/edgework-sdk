/**
 * Edgework AI Provider - THE DEFAULT AND ONLY PROVIDER
 * All AI requests go through Edgework's own AI gateway
 */

export interface EdgeworkModel {
  id: string;
  name: string;
  type: 'text-generation' | 'code-generation' | 'multimodal';
  contextWindow: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  recommendedFor: string[];
}

export interface ModelCapabilities {
  sqlGeneration: boolean;
  textSummarization: boolean;
  dataAnalysis: boolean;
  codeGeneration: boolean;
  statisticalAnalysis: boolean;
  visualization: boolean;
}

export interface ModelPricing {
  inputPrice: number;
  outputPrice: number;
  currency: string;
  unit: 'tokens';
}

export interface EdgeworkRequest {
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

export interface EdgeworkResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  processingTime: number;
  finishReason: 'stop' | 'length' | 'content_filter';
}

export class EdgeworkProvider {
  private models: Map<string, EdgeworkModel> = new Map();
  private apiKey: string | undefined;
  private gatewayUrl: string;

  constructor() {
    this.gatewayUrl =
      process.env.EDGEWORK_AI_GATEWAY_URL || 'https://gateway.edgework.ai';
    this.initializeModels();
  }

  /**
   * Initialize Edgework models
   */
  private initializeModels(): void {
    // Text-to-SQL Model
    this.models.set('edgework-text2sql', {
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
    });

    // SQL-to-Text Model
    this.models.set('edgework-sql2text', {
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
    });

    // Universal Model
    this.models.set('edgework-universal', {
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
    });

    // Advanced Analytics Model
    this.models.set('edgework-advanced', {
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
    });
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get API key
   */
  getApiKey(): string | undefined {
    return this.apiKey || process.env.EDGEWORK_API_KEY;
  }

  /**
   * Get all models
   */
  getModels(): EdgeworkModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): EdgeworkModel | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get best model for task
   */
  getBestModel(
    task: string,
    options: {
      preferSpeed?: boolean;
      maxCost?: number;
    } = {}
  ): EdgeworkModel | undefined {
    const { preferSpeed, maxCost } = options;

    // Get models recommended for this task
    let candidates = Array.from(this.models.values()).filter((m) =>
      m.recommendedFor.includes(task)
    );

    // If no specific models for task, use universal model
    if (candidates.length === 0) {
      candidates = Array.from(this.models.values()).filter((m) =>
        m.recommendedFor.includes('general-purpose')
      );
    }

    // Filter by cost if specified
    if (maxCost !== undefined) {
      candidates = candidates.filter(
        (m) => m.pricing.inputPrice + m.pricing.outputPrice <= maxCost
      );
    }

    // Sort by preference
    candidates.sort((a, b) => {
      if (preferSpeed) {
        // Prefer models with lower context windows (generally faster)
        return a.contextWindow - b.contextWindow;
      } else {
        // Prefer higher quality models (advanced analytics)
        if (a.id.includes('advanced') && !b.id.includes('advanced')) return -1;
        if (b.id.includes('advanced') && !a.id.includes('advanced')) return 1;
        return b.pricing.inputPrice - a.pricing.inputPrice;
      }
    });

    return candidates[0];
  }

  /**
   * Make AI request through Edgework gateway
   */
  async makeRequest(request: EdgeworkRequest): Promise<EdgeworkResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error(
        'Edgework API key not found. Set EDGEWORK_API_KEY environment variable or use setApiKey()'
      );
    }

    const response = await fetch(`${this.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Edgework-Provider': 'edgework',
        'X-Edgework-Model': request.model,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 4000,
        stream: false,
        functions: request.functions,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Edgework AI Gateway error: ${response.status} ${response.statusText}`
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
      processingTime: Date.now() - startTime,
      finishReason: data.choices[0].finish_reason,
    };
  }

  /**
   * Get cost estimate for request
   */
  estimateCost(request: EdgeworkRequest): number {
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
   * Get provider statistics
   */
  getStats(): {
    totalModels: number;
    supportedCapabilities: string[];
    averageCostPerToken: number;
    gatewayUrl: string;
    hasApiKey: boolean;
  } {
    const models = this.getModels();

    return {
      totalModels: models.length,
      supportedCapabilities: [
        'textGeneration',
        'codeGeneration',
        'embeddings',
        'multimodal',
        'streaming',
        'functionCalling',
        'imageGeneration',
      ],
      averageCostPerToken:
        models.reduce(
          (sum, m) => sum + m.pricing.inputPrice + m.pricing.outputPrice,
          0
        ) / models.length,
      gatewayUrl: this.gatewayUrl,
      hasApiKey: !!this.getApiKey(),
    };
  }

  /**
   * Test connection to Edgework gateway
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.gatewayUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Global Edgework provider instance
 */
export const edgeworkProvider = new EdgeworkProvider();
