/**
 * Token Budget Manager
 *
 * Token counting, cost estimation, and rate limiting:
 * - Token counting for prompts and completions
 * - Cost estimation per model
 * - Budget enforcement
 * - Usage tracking and alerts
 */

/**
 * Token pricing (per 1000 tokens)
 */
export interface TokenPricing {
  /** Input token price per 1K tokens */
  inputPer1K: number;

  /** Output token price per 1K tokens */
  outputPer1K: number;

  /** Currency */
  currency: string;
}

/**
 * Model pricing configuration
 */
export interface ModelPricing {
  /** Model ID */
  modelId: string;

  /** Model display name */
  displayName: string;

  /** Token pricing */
  pricing: TokenPricing;

  /** Max context window */
  maxContextTokens: number;

  /** Max output tokens */
  maxOutputTokens: number;
}

/**
 * Usage record
 */
export interface UsageRecord {
  /** Timestamp */
  timestamp: number;

  /** Model used */
  modelId: string;

  /** Input tokens */
  inputTokens: number;

  /** Output tokens */
  outputTokens: number;

  /** Estimated cost */
  estimatedCost: number;

  /** Request ID */
  requestId?: string;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Budget period
 */
export type BudgetPeriod =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'unlimited';

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /** Budget period */
  period: BudgetPeriod;

  /** Maximum cost per period */
  maxCost?: number;

  /** Maximum tokens per period */
  maxTokens?: number;

  /** Maximum requests per period */
  maxRequests?: number;

  /** Alert threshold (0-1) */
  alertThreshold: number;

  /** Callback when alert threshold reached */
  onAlert?: (usage: BudgetUsage) => void;

  /** Callback when budget exceeded */
  onBudgetExceeded?: (usage: BudgetUsage) => void;
}

/**
 * Budget usage
 */
export interface BudgetUsage {
  /** Period start */
  periodStart: number;

  /** Period end */
  periodEnd: number;

  /** Total cost */
  totalCost: number;

  /** Total tokens */
  totalTokens: number;

  /** Total requests */
  totalRequests: number;

  /** Cost limit */
  costLimit?: number;

  /** Token limit */
  tokenLimit?: number;

  /** Request limit */
  requestLimit?: number;

  /** Cost usage percentage */
  costUsagePercent: number;

  /** Token usage percentage */
  tokenUsagePercent: number;

  /** Request usage percentage */
  requestUsagePercent: number;

  /** Is over budget */
  isOverBudget: boolean;

  /** Alert triggered */
  alertTriggered: boolean;
}

/**
 * Token budget manager configuration
 */
export interface TokenBudgetManagerConfig {
  /** Budget configuration */
  budget: BudgetConfig;

  /** Model pricing */
  modelPricing: ModelPricing[];

  /** Default model ID */
  defaultModelId?: string;

  /** Token estimator (characters to tokens ratio) */
  tokenEstimatorRatio: number;

  /** Maximum stored usage records */
  maxStoredRecords: number;

  /** Persist usage to storage */
  persistUsage: boolean;

  /** Storage key prefix */
  storageKeyPrefix: string;
}

/**
 * Default model pricing
 */
const DEFAULT_MODEL_PRICING: ModelPricing[] = [
  // Llama 3.2 (local - free)
  {
    modelId: 'llama-3.2-1b',
    displayName: 'Llama 3.2 1B',
    pricing: { inputPer1K: 0, outputPer1K: 0, currency: 'USD' },
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
  },
  {
    modelId: 'llama-3.2-3b',
    displayName: 'Llama 3.2 3B',
    pricing: { inputPer1K: 0, outputPer1K: 0, currency: 'USD' },
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
  },
  // Phi-3 (local - free)
  {
    modelId: 'phi-3-mini',
    displayName: 'Phi-3 Mini',
    pricing: { inputPer1K: 0, outputPer1K: 0, currency: 'USD' },
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
  },
  // Edge compute (subsidized pricing)
  {
    modelId: 'edge-7b',
    displayName: 'Edge 7B',
    pricing: { inputPer1K: 0.00005, outputPer1K: 0.0001, currency: 'USD' },
    maxContextTokens: 32768,
    maxOutputTokens: 4096,
  },
  // Cloud fallback (standard pricing)
  {
    modelId: 'cloud-70b',
    displayName: 'Cloud 70B',
    pricing: { inputPer1K: 0.0008, outputPer1K: 0.0024, currency: 'USD' },
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
  },
];

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TokenBudgetManagerConfig = {
  budget: {
    period: 'monthly',
    alertThreshold: 0.8,
  },
  modelPricing: DEFAULT_MODEL_PRICING,
  tokenEstimatorRatio: 4, // ~4 chars per token
  maxStoredRecords: 10000,
  persistUsage: true,
  storageKeyPrefix: 'edgework-budget-',
};

/**
 * Token Budget Manager
 *
 * Manages token usage, costs, and budgets.
 */
export class TokenBudgetManager {
  private config: TokenBudgetManagerConfig;
  private usageRecords: UsageRecord[] = [];
  private periodUsage: BudgetUsage;
  private alertTriggered = false;

  constructor(config: Partial<TokenBudgetManagerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      budget: { ...DEFAULT_CONFIG.budget, ...config.budget },
      modelPricing: config.modelPricing || DEFAULT_MODEL_PRICING,
    };

    this.periodUsage = this.initializePeriodUsage();

    // Load persisted usage
    if (this.config.persistUsage && typeof localStorage !== 'undefined') {
      this.loadPersistedUsage();
    }
  }

  /**
   * Initialize period usage
   */
  private initializePeriodUsage(): BudgetUsage {
    const { start, end } = this.getPeriodBounds();

    return {
      periodStart: start,
      periodEnd: end,
      totalCost: 0,
      totalTokens: 0,
      totalRequests: 0,
      costLimit: this.config.budget.maxCost,
      tokenLimit: this.config.budget.maxTokens,
      requestLimit: this.config.budget.maxRequests,
      costUsagePercent: 0,
      tokenUsagePercent: 0,
      requestUsagePercent: 0,
      isOverBudget: false,
      alertTriggered: false,
    };
  }

  /**
   * Get period bounds
   */
  private getPeriodBounds(): { start: number; end: number } {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (this.config.budget.period) {
      case 'hourly':
        start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          0,
          0,
          0
        );
        end = new Date(start.getTime() + 60 * 60 * 1000);
        break;

      case 'daily':
        start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        );
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        break;

      case 'weekly': {
        const dayOfWeek = now.getDay();
        start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - dayOfWeek,
          0,
          0,
          0,
          0
        );
        end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      }

      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        break;

      case 'unlimited':
      default:
        start = new Date(0);
        end = new Date(8640000000000000); // Max date
        break;
    }

    return { start: start.getTime(), end: end.getTime() };
  }

  /**
   * Estimate tokens from text
   */
  estimateTokens(text: string): number {
    // Simple estimation based on character count
    // More accurate would be to use actual tokenizer
    return Math.ceil(text.length / this.config.tokenEstimatorRatio);
  }

  /**
   * Get model pricing
   */
  getModelPricing(modelId: string): ModelPricing | undefined {
    return this.config.modelPricing.find((p) => p.modelId === modelId);
  }

  /**
   * Calculate cost
   */
  calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = this.getModelPricing(modelId);
    if (!pricing) return 0;

    const inputCost = (inputTokens / 1000) * pricing.pricing.inputPer1K;
    const outputCost = (outputTokens / 1000) * pricing.pricing.outputPer1K;

    return inputCost + outputCost;
  }

  /**
   * Estimate cost before request
   */
  estimateCost(
    modelId: string,
    prompt: string,
    maxOutputTokens?: number
  ): {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    maxCost: number;
  } {
    const pricing = this.getModelPricing(modelId);
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = maxOutputTokens || pricing?.maxOutputTokens || 1024;

    const estimatedOutputTokens = Math.min(
      outputTokens,
      Math.ceil(outputTokens * 0.5)
    ); // Estimate 50% usage
    const maxCost = this.calculateCost(modelId, inputTokens, outputTokens);
    const estimatedCost = this.calculateCost(
      modelId,
      inputTokens,
      estimatedOutputTokens
    );

    return {
      inputTokens,
      outputTokens: estimatedOutputTokens,
      estimatedCost,
      maxCost,
    };
  }

  /**
   * Check if request is within budget
   */
  checkBudget(
    modelId: string,
    prompt: string,
    maxOutputTokens?: number
  ): {
    allowed: boolean;
    reason?: string;
    remainingBudget: BudgetUsage;
  } {
    // Check if period has changed
    this.checkPeriodReset();

    const estimate = this.estimateCost(modelId, prompt, maxOutputTokens);
    const usage = this.periodUsage;

    // Check cost limit
    if (usage.costLimit !== undefined) {
      if (usage.totalCost + estimate.maxCost > usage.costLimit) {
        return {
          allowed: false,
          reason: `Cost budget exceeded: ${usage.totalCost.toFixed(
            4
          )} + ${estimate.maxCost.toFixed(4)} > ${usage.costLimit.toFixed(4)}`,
          remainingBudget: usage,
        };
      }
    }

    // Check token limit
    if (usage.tokenLimit !== undefined) {
      const totalTokens = estimate.inputTokens + estimate.outputTokens;
      if (usage.totalTokens + totalTokens > usage.tokenLimit) {
        return {
          allowed: false,
          reason: `Token budget exceeded: ${usage.totalTokens} + ${totalTokens} > ${usage.tokenLimit}`,
          remainingBudget: usage,
        };
      }
    }

    // Check request limit
    if (usage.requestLimit !== undefined) {
      if (usage.totalRequests + 1 > usage.requestLimit) {
        return {
          allowed: false,
          reason: `Request budget exceeded: ${usage.totalRequests} + 1 > ${usage.requestLimit}`,
          remainingBudget: usage,
        };
      }
    }

    return { allowed: true, remainingBudget: usage };
  }

  /**
   * Record usage
   */
  recordUsage(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    requestId?: string,
    metadata?: Record<string, unknown>
  ): UsageRecord {
    // Check if period has changed
    this.checkPeriodReset();

    const cost = this.calculateCost(modelId, inputTokens, outputTokens);
    const totalTokens = inputTokens + outputTokens;

    const record: UsageRecord = {
      timestamp: Date.now(),
      modelId,
      inputTokens,
      outputTokens,
      estimatedCost: cost,
      requestId,
      metadata,
    };

    // Store record
    this.usageRecords.push(record);
    if (this.usageRecords.length > this.config.maxStoredRecords) {
      this.usageRecords = this.usageRecords.slice(
        -this.config.maxStoredRecords
      );
    }

    // Update period usage
    this.periodUsage.totalCost += cost;
    this.periodUsage.totalTokens += totalTokens;
    this.periodUsage.totalRequests += 1;

    // Update percentages
    this.updateUsagePercentages();

    // Check alerts
    this.checkAlerts();

    // Persist
    if (this.config.persistUsage) {
      this.persistUsage();
    }

    return record;
  }

  /**
   * Update usage percentages
   */
  private updateUsagePercentages(): void {
    const usage = this.periodUsage;

    usage.costUsagePercent = usage.costLimit
      ? (usage.totalCost / usage.costLimit) * 100
      : 0;

    usage.tokenUsagePercent = usage.tokenLimit
      ? (usage.totalTokens / usage.tokenLimit) * 100
      : 0;

    usage.requestUsagePercent = usage.requestLimit
      ? (usage.totalRequests / usage.requestLimit) * 100
      : 0;

    usage.isOverBudget =
      usage.costUsagePercent > 100 ||
      usage.tokenUsagePercent > 100 ||
      usage.requestUsagePercent > 100;
  }

  /**
   * Check for budget alerts
   */
  private checkAlerts(): void {
    const usage = this.periodUsage;
    const threshold = this.config.budget.alertThreshold * 100;

    const shouldAlert =
      usage.costUsagePercent >= threshold ||
      usage.tokenUsagePercent >= threshold ||
      usage.requestUsagePercent >= threshold;

    if (shouldAlert && !this.alertTriggered) {
      this.alertTriggered = true;
      usage.alertTriggered = true;
      this.config.budget.onAlert?.(usage);
    }

    if (usage.isOverBudget) {
      this.config.budget.onBudgetExceeded?.(usage);
    }
  }

  /**
   * Check if period has reset
   */
  private checkPeriodReset(): void {
    const now = Date.now();
    if (now >= this.periodUsage.periodEnd) {
      this.periodUsage = this.initializePeriodUsage();
      this.alertTriggered = false;

      // Filter records to current period
      this.usageRecords = this.usageRecords.filter(
        (r) => r.timestamp >= this.periodUsage.periodStart
      );
    }
  }

  /**
   * Get current usage
   */
  getCurrentUsage(): BudgetUsage {
    this.checkPeriodReset();
    return { ...this.periodUsage };
  }

  /**
   * Get usage history
   */
  getUsageHistory(limit?: number): UsageRecord[] {
    const records = [...this.usageRecords];
    if (limit) {
      return records.slice(-limit);
    }
    return records;
  }

  /**
   * Get usage by model
   */
  getUsageByModel(): Map<
    string,
    { tokens: number; cost: number; requests: number }
  > {
    this.checkPeriodReset();

    const byModel = new Map<
      string,
      { tokens: number; cost: number; requests: number }
    >();

    for (const record of this.usageRecords) {
      if (record.timestamp < this.periodUsage.periodStart) continue;

      const existing = byModel.get(record.modelId) || {
        tokens: 0,
        cost: 0,
        requests: 0,
      };
      existing.tokens += record.inputTokens + record.outputTokens;
      existing.cost += record.estimatedCost;
      existing.requests += 1;
      byModel.set(record.modelId, existing);
    }

    return byModel;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): {
    cost: number | null;
    tokens: number | null;
    requests: number | null;
  } {
    this.checkPeriodReset();
    const usage = this.periodUsage;

    return {
      cost: usage.costLimit
        ? Math.max(0, usage.costLimit - usage.totalCost)
        : null,
      tokens: usage.tokenLimit
        ? Math.max(0, usage.tokenLimit - usage.totalTokens)
        : null,
      requests: usage.requestLimit
        ? Math.max(0, usage.requestLimit - usage.totalRequests)
        : null,
    };
  }

  /**
   * Set budget limits
   */
  setBudgetLimits(limits: {
    maxCost?: number;
    maxTokens?: number;
    maxRequests?: number;
  }): void {
    if (limits.maxCost !== undefined) {
      this.config.budget.maxCost = limits.maxCost;
      this.periodUsage.costLimit = limits.maxCost;
    }
    if (limits.maxTokens !== undefined) {
      this.config.budget.maxTokens = limits.maxTokens;
      this.periodUsage.tokenLimit = limits.maxTokens;
    }
    if (limits.maxRequests !== undefined) {
      this.config.budget.maxRequests = limits.maxRequests;
      this.periodUsage.requestLimit = limits.maxRequests;
    }

    this.updateUsagePercentages();
    this.checkAlerts();

    if (this.config.persistUsage) {
      this.persistUsage();
    }
  }

  /**
   * Add model pricing
   */
  addModelPricing(pricing: ModelPricing): void {
    const existing = this.config.modelPricing.findIndex(
      (p) => p.modelId === pricing.modelId
    );
    if (existing >= 0) {
      this.config.modelPricing[existing] = pricing;
    } else {
      this.config.modelPricing.push(pricing);
    }
  }

  /**
   * Persist usage to storage
   */
  private persistUsage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const data = {
        periodUsage: this.periodUsage,
        usageRecords: this.usageRecords.slice(-1000), // Keep last 1000
      };

      localStorage.setItem(
        `${this.config.storageKeyPrefix}usage`,
        JSON.stringify(data)
      );
    } catch {
      // Storage full or unavailable
    }
  }

  /**
   * Load persisted usage
   */
  private loadPersistedUsage(): void {
    try {
      const data = localStorage.getItem(`${this.config.storageKeyPrefix}usage`);
      if (!data) return;

      const parsed = JSON.parse(data);

      // Check if period is still valid
      const { start, end } = this.getPeriodBounds();
      if (
        parsed.periodUsage.periodStart === start &&
        parsed.periodUsage.periodEnd === end
      ) {
        this.periodUsage = parsed.periodUsage;
        this.usageRecords = parsed.usageRecords || [];
      }
    } catch {
      // Invalid or missing data
    }
  }

  /**
   * Reset usage
   */
  resetUsage(): void {
    this.periodUsage = this.initializePeriodUsage();
    this.usageRecords = [];
    this.alertTriggered = false;

    if (this.config.persistUsage && typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${this.config.storageKeyPrefix}usage`);
    }
  }
}

/**
 * Pre-configured budget presets
 */
export const BUDGET_PRESETS = {
  /** Free tier */
  free: {
    budget: {
      period: 'monthly' as BudgetPeriod,
      maxCost: 0,
      maxTokens: 100000,
      maxRequests: 1000,
      alertThreshold: 0.8,
    },
  } as Partial<TokenBudgetManagerConfig>,

  /** Basic tier */
  basic: {
    budget: {
      period: 'monthly' as BudgetPeriod,
      maxCost: 5,
      maxTokens: 1000000,
      maxRequests: 10000,
      alertThreshold: 0.8,
    },
  } as Partial<TokenBudgetManagerConfig>,

  /** Pro tier */
  pro: {
    budget: {
      period: 'monthly' as BudgetPeriod,
      maxCost: 50,
      maxTokens: 10000000,
      maxRequests: 100000,
      alertThreshold: 0.9,
    },
  } as Partial<TokenBudgetManagerConfig>,

  /** Enterprise - unlimited */
  enterprise: {
    budget: {
      period: 'unlimited' as BudgetPeriod,
      alertThreshold: 0.95,
    },
  } as Partial<TokenBudgetManagerConfig>,

  /** Development - tracking only */
  development: {
    budget: {
      period: 'daily' as BudgetPeriod,
      alertThreshold: 0.5,
    },
  } as Partial<TokenBudgetManagerConfig>,
};

/**
 * Create a token budget manager with preset
 */
export function createTokenBudgetManager(
  preset: keyof typeof BUDGET_PRESETS = 'basic',
  overrides: Partial<TokenBudgetManagerConfig> = {}
): TokenBudgetManager {
  return new TokenBudgetManager({
    ...BUDGET_PRESETS[preset],
    ...overrides,
  });
}
