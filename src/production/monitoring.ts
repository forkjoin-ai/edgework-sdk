/**
 * Production monitoring and logging system for Edgework Query
 * Provides real-time metrics, alerting, and comprehensive logging
 */

export interface Metrics {
  requests: RequestMetrics;
  performance: PerformanceMetrics;
  errors: ErrorMetrics;
  users: UserMetrics;
  system: SystemMetrics;
  ai: AIMetrics;
}

export interface RequestMetrics {
  total: number;
  success: number;
  failed: number;
  ratePerSecond: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface PerformanceMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
  activeConnections: number;
  queueSize: number;
  throughput: number;
}

export interface ErrorMetrics {
  total: number;
  rate: number;
  errorsByType: Record<string, number>;
  criticalErrors: number;
  recentErrors: Array<{
    timestamp: Date;
    type: string;
    message: string;
    userId?: string;
    requestId?: string;
  }>;
}

export interface UserMetrics {
  active: number;
  total: number;
  newUsers: number;
  retentionRate: number;
  averageRequestsPerUser: number;
  topUsers: Array<{
    userId: string;
    requests: number;
    tokens: number;
  }>;
}

export interface SystemMetrics {
  uptime: number;
  startTime: Date;
  version: string;
  environment: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
}

export interface AIMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageTokensPerRequest: number;
  totalTokens: number;
  modelUsage: Record<string, number>;
  costPerRequest: number;
  totalCost: number;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  requestId?: string;
  duration?: number;
  error?: Error;
}

export interface Alert {
  id: string;
  type:
    | 'error_rate'
    | 'response_time'
    | 'memory'
    | 'cpu'
    | 'rate_limit'
    | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export class MonitoringSystem {
  private metrics: Metrics;
  private logs: LogEntry[] = [];
  private alerts: Alert[] = [];
  private startTime: Date;
  private requestTimes: number[] = [];
  private activeRequests: Set<string> = new Set();
  private logRetentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    this.startTime = new Date();
    this.metrics = this.initializeMetrics();
    this.startPeriodicCleanup();
  }

  /**
   * Record request start
   */
  startRequest(requestId: string, userId?: string): void {
    this.activeRequests.add(requestId);
    this.metrics.requests.total++;

    this.log('info', 'Request started', {
      requestId,
      userId,
      activeRequests: this.activeRequests.size,
    });
  }

  /**
   * Record request completion
   */
  endRequest(
    requestId: string,
    success: boolean,
    duration: number,
    userId?: string,
    tokensUsed?: number
  ): void {
    this.activeRequests.delete(requestId);

    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.failed++;
    }

    // Track response times
    this.requestTimes.push(duration);
    if (this.requestTimes.length > 10000) {
      this.requestTimes = this.requestTimes.slice(-5000); // Keep last 5000
    }

    // Update performance metrics
    this.updatePerformanceMetrics();
    this.updateRequestMetrics();

    // Update AI metrics if tokens used
    if (tokensUsed) {
      this.metrics.ai.totalTokens += tokensUsed;
      this.metrics.ai.averageTokensPerRequest =
        this.metrics.ai.totalTokens / this.metrics.requests.total;
    }

    this.log('info', 'Request completed', {
      requestId,
      userId,
      success,
      duration,
      tokensUsed,
      activeRequests: this.activeRequests.size,
    });
  }

  /**
   * Record error
   */
  recordError(
    error: Error,
    context?: Record<string, unknown>,
    userId?: string,
    requestId?: string
  ): void {
    this.metrics.errors.total++;
    this.metrics.errors.recentErrors.push({
      timestamp: new Date(),
      type: error.constructor.name,
      message: error.message,
      userId,
      requestId,
    });

    // Keep only recent errors
    if (this.metrics.errors.recentErrors.length > 1000) {
      this.metrics.errors.recentErrors =
        this.metrics.errors.recentErrors.slice(-500);
    }

    // Update error type counts
    const errorType = error.constructor.name;
    this.metrics.errors.errorsByType[errorType] =
      (this.metrics.errors.errorsByType[errorType] || 0) + 1;

    // Check for critical errors
    if (this.isCriticalError(error)) {
      this.metrics.errors.criticalErrors++;
      this.createAlert(
        'custom',
        'critical',
        `Critical error: ${error.message}`,
        {
          errorType,
          userId,
          requestId,
        }
      );
    }

    this.log('error', error.message, {
      ...context,
      error: error.name,
      stack: error.stack,
      userId,
      requestId,
    });
  }

  /**
   * Record AI model usage
   */
  recordAIUsage(
    model: string,
    tokensUsed: number,
    cost: number,
    success: boolean
  ): void {
    this.metrics.ai.totalRequests++;

    if (success) {
      this.metrics.ai.successfulRequests++;
    } else {
      this.metrics.ai.failedRequests++;
    }

    this.metrics.ai.totalCost += cost;
    this.metrics.ai.costPerRequest =
      this.metrics.ai.totalCost / this.metrics.ai.totalRequests;

    this.metrics.ai.modelUsage[model] =
      (this.metrics.ai.modelUsage[model] || 0) + 1;

    this.log('info', 'AI request completed', {
      model,
      tokensUsed,
      cost,
      success,
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics {
    this.updatePerformanceMetrics();
    this.updateRequestMetrics();
    this.updateErrorMetrics();
    return { ...this.metrics };
  }

  /**
   * Get logs with filtering
   */
  getLogs(
    options: {
      level?: LogEntry['level'];
      userId?: string;
      requestId?: string;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    } = {}
  ): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (options.level) {
      filteredLogs = filteredLogs.filter((log) => log.level === options.level);
    }

    if (options.userId) {
      filteredLogs = filteredLogs.filter(
        (log) => log.userId === options.userId
      );
    }

    if (options.requestId) {
      filteredLogs = filteredLogs.filter(
        (log) => log.requestId === options.requestId
      );
    }

    if (options.startTime) {
      filteredLogs = filteredLogs.filter(
        (log) => log.timestamp >= options.startTime!
      );
    }

    if (options.endTime) {
      filteredLogs = filteredLogs.filter(
        (log) => log.timestamp <= options.endTime!
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return options.limit ? filteredLogs.slice(0, options.limit) : filteredLogs;
  }

  /**
   * Get active alerts
   */
  getAlerts(includeResolved = false): Alert[] {
    return this.alerts.filter((alert) => includeResolved || !alert.resolved);
  }

  /**
   * Create alert
   */
  createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    metadata?: Record<string, unknown>
  ): Alert {
    const alert: Alert = {
      id: this.generateAlertId(),
      type,
      severity,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata,
    };

    this.alerts.push(alert);

    this.log('warn', `Alert created: ${message}`, {
      alertId: alert.id,
      type,
      severity,
      metadata,
    });

    return alert;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();

      this.log('info', `Alert resolved: ${alert.message}`, {
        alertId,
        resolvedAt: alert.resolvedAt,
      });

      return true;
    }
    return false;
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    uptime: number;
    version: string;
  } {
    const checks = {
      memory: this.metrics.performance.memoryUsage.percentage < 90,
      cpu: this.metrics.performance.cpuUsage < 80,
      errorRate: this.getErrorRate() < 0.05, // 5%
      responseTime: this.metrics.requests.p95ResponseTime < 5000, // 5 seconds
      activeConnections: this.metrics.performance.activeConnections < 1000,
    };

    const failedChecks = Object.values(checks).filter((check) => !check).length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (failedChecks === 0) {
      status = 'healthy';
    } else if (failedChecks <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    this.metrics.system.health = status;

    return {
      status,
      checks,
      uptime: Date.now() - this.startTime.getTime(),
      version: this.metrics.system.version,
    };
  }

  /**
   * Log message
   */
  private log(
    level: LogEntry['level'],
    message: string,
    context?: Record<string, unknown>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
    };

    this.logs.push(logEntry);

    // Keep logs within retention period
    const cutoff = new Date(Date.now() - this.logRetentionPeriod);
    this.logs = this.logs.filter((log) => log.timestamp > cutoff);

    // Output to console (in production, this would go to a logging service)
    const timestamp = logEntry.timestamp.toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.log(
      `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`
    );
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): Metrics {
    return {
      requests: {
        total: 0,
        success: 0,
        failed: 0,
        ratePerSecond: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
      },
      performance: {
        memoryUsage: { used: 0, total: 0, percentage: 0 },
        cpuUsage: 0,
        activeConnections: 0,
        queueSize: 0,
        throughput: 0,
      },
      errors: {
        total: 0,
        rate: 0,
        errorsByType: {},
        criticalErrors: 0,
        recentErrors: [],
      },
      users: {
        active: 0,
        total: 0,
        newUsers: 0,
        retentionRate: 0,
        averageRequestsPerUser: 0,
        topUsers: [],
      },
      system: {
        uptime: 0,
        startTime: this.startTime,
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        health: 'healthy',
      },
      ai: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageTokensPerRequest: 0,
        totalTokens: 0,
        modelUsage: {},
        costPerRequest: 0,
        totalCost: 0,
      },
    };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    const memUsage = process.memoryUsage();
    this.metrics.performance.memoryUsage = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
    };

    this.metrics.performance.cpuUsage = process.cpuUsage().user / 1000000; // Convert to seconds
    this.metrics.performance.activeConnections = this.activeRequests.size;
  }

  /**
   * Update request metrics
   */
  private updateRequestMetrics(): void {
    if (this.requestTimes.length === 0) return;

    const sorted = [...this.requestTimes].sort((a, b) => a - b);
    this.metrics.requests.averageResponseTime =
      this.requestTimes.reduce((sum, time) => sum + time, 0) /
      this.requestTimes.length;

    this.metrics.requests.p95ResponseTime =
      sorted[Math.floor(sorted.length * 0.95)];
    this.metrics.requests.p99ResponseTime =
      sorted[Math.floor(sorted.length * 0.99)];

    // Calculate requests per second (last minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.logs.filter(
      (log) =>
        log.message.includes('Request completed') &&
        log.timestamp.getTime() > oneMinuteAgo
    );
    this.metrics.requests.ratePerSecond = recentRequests.length / 60;
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(): void {
    const totalRequests = this.metrics.requests.total;
    if (totalRequests > 0) {
      this.metrics.errors.rate = this.metrics.errors.total / totalRequests;
    }
  }

  /**
   * Get error rate
   */
  private getErrorRate(): number {
    return this.metrics.requests.total > 0
      ? this.metrics.requests.failed / this.metrics.requests.total
      : 0;
  }

  /**
   * Check if error is critical
   */
  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      'OutOfMemoryError',
      'TypeError',
      'ReferenceError',
      'SyntaxError',
    ];
    return criticalErrors.includes(error.constructor.name);
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return (
      'alert_' + Date.now().toString(36) + Math.random().toString(36).substr(2)
    );
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      // Clean old logs
      const cutoff = new Date(Date.now() - this.logRetentionPeriod);
      this.logs = this.logs.filter((log) => log.timestamp > cutoff);

      // Clean old resolved alerts
      const alertCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      this.alerts = this.alerts.filter(
        (alert) => !alert.resolved || alert.resolvedAt! > alertCutoff
      );

      // Update system metrics
      this.metrics.system.uptime = Date.now() - this.startTime.getTime();
    }, 60000); // Run every minute
  }
}

/**
 * Global monitoring instance
 */
export const monitoring = new MonitoringSystem();
