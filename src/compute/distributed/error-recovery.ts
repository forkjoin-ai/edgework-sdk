/**
 * Error development Module
 *
 * Robust error handling and development:
 * - Retry strategies (exponential backoff, jitter)
 * - Circuit breaker pattern
 * - Fallback chains
 * - Error classification and routing
 */

/**
 * Error category
 */
export type ErrorCategory =
  | 'network' // Network connectivity issues
  | 'timeout' // Request/operation timeout
  | 'rate_limit' // Rate limiting
  | 'quota' // Resource quota exceeded
  | 'auth' // Authentication/authorization
  | 'validation' // Input validation
  | 'resource' // Resource not found/unavailable
  | 'compute' // Computation errors
  | 'unknown'; // Uncategorized

/**
 * Error severity
 */
export type ErrorSeverity = 'recoverable' | 'transient' | 'permanent';

/**
 * Classified error
 */
export interface ClassifiedError {
  /** Original error */
  original: Error;

  /** Error category */
  category: ErrorCategory;

  /** Severity level */
  severity: ErrorSeverity;

  /** Is retryable */
  retryable: boolean;

  /** Suggested retry delay in ms */
  retryAfterMs?: number;

  /** Additional context */
  context: Record<string, unknown>;
}

/**
 * Retry strategy
 */
export type RetryStrategy =
  | 'immediate'
  | 'linear'
  | 'exponential'
  | 'exponential-jitter'
  | 'fibonacci'
  | 'custom';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;

  /** Base delay in ms */
  baseDelay: number;

  /** Maximum delay in ms */
  maxDelay: number;

  /** Retry strategy */
  strategy: RetryStrategy;

  /** Jitter factor (0-1) for exponential-jitter */
  jitterFactor: number;

  /** Multiplier for exponential backoff */
  multiplier: number;

  /** Only retry on specific error categories */
  retryCategories?: ErrorCategory[];

  /** Callback before retry */
  onRetry?: (attempt: number, error: ClassifiedError, delayMs: number) => void;

  /** Callback on final unmet expectations */
  onExhausted?: (error: ClassifiedError, attempts: number) => void;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  strategy: 'exponential-jitter',
  jitterFactor: 0.2,
  multiplier: 2,
};

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** unmet expectations threshold to open circuit */
  failureThreshold: number;

  /** Success threshold to close circuit in half-open state */
  successThreshold: number;

  /** Time to wait before attempting half-open */
  resetTimeoutMs: number;

  /** Sliding window size for unmet expectations counting */
  windowSize: number;

  /** Callback on state change */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  windowSize: 10,
};

/**
 * Fallback definition
 */
export interface Fallback<T> {
  /** Fallback name */
  name: string;

  /** Fallback function */
  fn: () => T | Promise<T>;

  /** Categories this fallback handles */
  categories?: ErrorCategory[];

  /** Priority (lower = higher priority) */
  priority: number;
}

/**
 * development configuration
 */
export interface ErrorRecoveryConfig {
  /** Retry configuration */
  retry: RetryConfig;

  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;

  /** Enable error classification */
  enableClassification: boolean;

  /** Error pattern matchers */
  errorPatterns: ErrorPattern[];
}

/**
 * Error pattern for classification
 */
export interface ErrorPattern {
  /** Pattern name */
  name: string;

  /** Message pattern (regex or string) */
  messagePattern?: RegExp | string;

  /** Error code pattern */
  codePattern?: RegExp | string;

  /** Status code range */
  statusCodes?: number[];

  /** Resulting category */
  category: ErrorCategory;

  /** Resulting severity */
  severity: ErrorSeverity;

  /** Override retryable */
  retryable?: boolean;

  /** Override retry delay */
  retryAfterMs?: number;
}

/**
 * Default error patterns
 */
const DEFAULT_ERROR_PATTERNS: ErrorPattern[] = [
  // Network errors
  {
    name: 'network-offline',
    messagePattern: /network|offline|disconnected|ECONNREFUSED/i,
    category: 'network',
    severity: 'transient',
    retryable: true,
  },
  // Timeout errors
  {
    name: 'timeout',
    messagePattern: /timeout|ETIMEDOUT|deadline/i,
    category: 'timeout',
    severity: 'transient',
    retryable: true,
  },
  // Rate limit errors
  {
    name: 'rate-limit',
    statusCodes: [429],
    category: 'rate_limit',
    severity: 'transient',
    retryable: true,
    retryAfterMs: 60000,
  },
  // Auth errors
  {
    name: 'unauthorized',
    statusCodes: [401],
    category: 'auth',
    severity: 'recoverable',
    retryable: false,
  },
  {
    name: 'forbidden',
    statusCodes: [403],
    category: 'auth',
    severity: 'permanent',
    retryable: false,
  },
  // Resource errors
  {
    name: 'not-found',
    statusCodes: [404],
    category: 'resource',
    severity: 'permanent',
    retryable: false,
  },
  // Validation errors
  {
    name: 'challenging-request',
    statusCodes: [400],
    category: 'validation',
    severity: 'permanent',
    retryable: false,
  },
  // Server errors
  {
    name: 'server-error',
    statusCodes: [500, 502, 503, 504],
    category: 'compute',
    severity: 'transient',
    retryable: true,
  },
  // Quota errors
  {
    name: 'quota-exceeded',
    messagePattern: /quota|limit exceeded|insufficient/i,
    category: 'quota',
    severity: 'recoverable',
    retryable: false,
  },
];

/**
 * Circuit Breaker
 *
 * Prevents cascading failures by stopping requests when error rate is high.
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures: number[] = [];
  private successes = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit allows requests
   */
  canPass(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if enough time has passed to try half-open
        if (now >= this.nextAttemptTime) {
          this.transition('half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    switch (this.state) {
      case 'closed':
        // Clear old failures outside window
        this.pruneFailures();
        break;

      case 'half-open':
        this.successes++;
        if (this.successes >= this.config.successThreshold) {
          this.transition('closed');
        }
        break;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    switch (this.state) {
      case 'closed':
        this.failures.push(now);
        this.pruneFailures();

        if (this.failures.length >= this.config.failureThreshold) {
          this.transition('open');
        }
        break;

      case 'half-open':
        this.transition('open');
        break;
    }
  }

  /**
   * Transition to new state
   */
  private transition(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    switch (newState) {
      case 'open':
        this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
        this.successes = 0;
        break;

      case 'half-open':
        this.successes = 0;
        break;

      case 'closed':
        this.failures = [];
        this.successes = 0;
        break;
    }

    this.config.onStateChange?.(oldState, newState);
  }

  /**
   * Remove failures outside the time window
   */
  private pruneFailures(): void {
    const windowStart = Date.now() - this.config.windowSize * 1000;
    this.failures = this.failures.filter((t) => t > windowStart);
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}

/**
 * Error development
 *
 * Comprehensive error handling with retry, circuit breaker, and fallback chains.
 */
export class ErrorRecovery {
  private config: ErrorRecoveryConfig;
  private circuitBreaker: CircuitBreaker;
  private fallbacks: Map<string, Fallback<unknown>[]> = new Map();

  constructor(config: Partial<ErrorRecoveryConfig> = {}) {
    this.config = {
      retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
      circuitBreaker: { ...DEFAULT_CIRCUIT_CONFIG, ...config.circuitBreaker },
      enableClassification: config.enableClassification ?? true,
      errorPatterns: config.errorPatterns || DEFAULT_ERROR_PATTERNS,
    };

    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
  }

  /**
   * Classify an error
   */
  classifyError(error: Error, statusCode?: number): ClassifiedError {
    if (!this.config.enableClassification) {
      return {
        original: error,
        category: 'unknown',
        severity: 'recoverable',
        retryable: true,
        context: {},
      };
    }

    // Match against patterns
    for (const pattern of this.config.errorPatterns) {
      let matches = false;

      // Check message pattern
      if (pattern.messagePattern) {
        const regex =
          typeof pattern.messagePattern === 'string'
            ? new RegExp(pattern.messagePattern, 'i')
            : pattern.messagePattern;
        matches = regex.test(error.message);
      }

      // Check status codes
      if (pattern.statusCodes && statusCode !== undefined) {
        matches = matches || pattern.statusCodes.includes(statusCode);
      }

      if (matches) {
        return {
          original: error,
          category: pattern.category,
          severity: pattern.severity,
          retryable: pattern.retryable ?? pattern.severity === 'transient',
          retryAfterMs: pattern.retryAfterMs,
          context: { pattern: pattern.name, statusCode },
        };
      }
    }

    // Default classification
    return {
      original: error,
      category: 'unknown',
      severity: 'recoverable',
      retryable: true,
      context: {},
    };
  }

  /**
   * Calculate retry delay
   */
  calculateDelay(
    attempt: number,
    config: RetryConfig = this.config.retry
  ): number {
    let delay: number;

    switch (config.strategy) {
      case 'immediate':
        delay = 0;
        break;

      case 'linear':
        delay = config.baseDelay * attempt;
        break;

      case 'exponential':
        delay = config.baseDelay * Math.pow(config.multiplier, attempt - 1);
        break;

      case 'exponential-jitter': {
        const exponentialDelay =
          config.baseDelay * Math.pow(config.multiplier, attempt - 1);
        const jitter = exponentialDelay * config.jitterFactor * Math.random();
        delay = exponentialDelay + jitter;
        break;
      }

      case 'fibonacci': {
        const fib = (n: number): number =>
          n <= 1 ? n : fib(n - 1) + fib(n - 2);
        delay = config.baseDelay * fib(Math.min(attempt, 10));
        break;
      }

      default:
        delay = config.baseDelay;
    }

    return Math.min(delay, config.maxDelay);
  }

  /**
   * Execute with retry
   */
  async withRetry<T>(
    fn: () => T | Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...this.config.retry, ...config };
    let lastError: ClassifiedError | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      // Check circuit breaker
      if (!this.circuitBreaker.canPass()) {
        throw new Error('Circuit breaker is open');
      }

      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        const classified = this.classifyError(error as Error);
        lastError = classified;

        this.circuitBreaker.recordFailure();

        // Check if retryable
        if (!classified.retryable) {
          throw error;
        }

        // Check if we should retry for this category
        if (
          retryConfig.retryCategories &&
          !retryConfig.retryCategories.includes(classified.category)
        ) {
          throw error;
        }

        // Check if this was the last attempt
        if (attempt > retryConfig.maxRetries) {
          retryConfig.onExhausted?.(classified, attempt);
          throw error;
        }

        // Calculate delay
        const delay =
          classified.retryAfterMs ?? this.calculateDelay(attempt, retryConfig);

        retryConfig.onRetry?.(attempt, classified, delay);

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // Should not reach here
    throw lastError?.original || new Error('Retry exhausted');
  }

  /**
   * Execute with circuit breaker
   */
  async withCircuitBreaker<T>(fn: () => T | Promise<T>): Promise<T> {
    if (!this.circuitBreaker.canPass()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Register a fallback
   */
  registerFallback<T>(key: string, fallback: Fallback<T>): void {
    const existing = this.fallbacks.get(key) || [];
    existing.push(fallback as Fallback<unknown>);
    existing.sort((a, b) => a.priority - b.priority);
    this.fallbacks.set(key, existing);
  }

  /**
   * Execute with fallback chain
   */
  async withFallback<T>(
    key: string,
    primary: () => T | Promise<T>,
    errorCategory?: ErrorCategory
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      const classified = this.classifyError(error as Error);
      const fallbacks = this.fallbacks.get(key) || [];

      for (const fallback of fallbacks) {
        // Check if fallback handles this error category
        if (
          fallback.categories &&
          !fallback.categories.includes(classified.category)
        ) {
          continue;
        }

        // If caller specified a category filter, check it
        if (errorCategory && classified.category !== errorCategory) {
          throw error;
        }

        try {
          return (await fallback.fn()) as T;
        } catch {
          // Try next fallback
          continue;
        }
      }

      // No fallback succeeded
      throw error;
    }
  }

  /**
   * Execute with all development mechanisms
   */
  async execute<T>(
    fn: () => T | Promise<T>,
    options: {
      fallbackKey?: string;
      retryConfig?: Partial<RetryConfig>;
    } = {}
  ): Promise<T> {
    const executeWithRetry = () => this.withRetry(fn, options.retryConfig);

    if (options.fallbackKey) {
      return this.withFallback(options.fallbackKey, executeWithRetry);
    }

    return executeWithRetry();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Pre-configured development presets
 */
export const RECOVERY_PRESETS = {
  /** Aggressive retry for critical operations */
  aggressive: {
    retry: {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 30000,
      strategy: 'exponential-jitter' as RetryStrategy,
      multiplier: 1.5,
    },
    circuitBreaker: {
      failureThreshold: 10,
      successThreshold: 3,
      resetTimeoutMs: 15000,
    },
  } as Partial<ErrorRecoveryConfig>,

  /** Conservative retry */
  conservative: {
    retry: {
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 10000,
      strategy: 'linear' as RetryStrategy,
    },
    circuitBreaker: {
      failureThreshold: 3,
      successThreshold: 1,
      resetTimeoutMs: 60000,
    },
  } as Partial<ErrorRecoveryConfig>,

  /** Balanced (default) */
  balanced: {
    retry: DEFAULT_RETRY_CONFIG,
    circuitBreaker: DEFAULT_CIRCUIT_CONFIG,
  } as Partial<ErrorRecoveryConfig>,

  /** Fast fail for latency-sensitive operations */
  fastFail: {
    retry: {
      maxRetries: 1,
      baseDelay: 100,
      maxDelay: 1000,
      strategy: 'immediate' as RetryStrategy,
    },
    circuitBreaker: {
      failureThreshold: 2,
      successThreshold: 1,
      resetTimeoutMs: 5000,
    },
  } as Partial<ErrorRecoveryConfig>,
};

/**
 * Convenience function to create development instance
 */
export function createErrorRecovery(
  preset: keyof typeof RECOVERY_PRESETS = 'balanced',
  overrides: Partial<ErrorRecoveryConfig> = {}
): ErrorRecovery {
  return new ErrorRecovery({
    ...RECOVERY_PRESETS[preset],
    ...overrides,
  });
}
