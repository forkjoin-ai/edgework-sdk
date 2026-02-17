/**
 * Authentication and authorization management for Edgework Query
 * Handles API keys, user authentication, and access control
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'readonly';
  apiKey: string;
  createdAt: Date;
  lastActive: Date;
  usage: UserUsage;
  limits: UserLimits;
}

export interface UserUsage {
  totalRequests: number;
  totalTokens: number;
  requestsThisMonth: number;
  tokensThisMonth: number;
  requestsToday: number;
  tokensToday: number;
  lastRequestTime: Date;
}

export interface UserLimits {
  requestsPerDay: number;
  tokensPerDay: number;
  requestsPerMonth: number;
  tokensPerMonth: number;
  maxConcurrency: number;
  maxFileSize: number; // bytes
  allowedModels: string[];
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
  rateLimitStatus?: RateLimitStatus;
}

export interface RateLimitStatus {
  remaining: number;
  resetTime: Date;
  limit: number;
  window: 'day' | 'month';
}

export class AuthManager {
  private users: Map<string, User> = new Map();
  private rateLimitTracker: Map<string, RateLimitTracker> = new Map();
  private sessionStore: Map<string, SessionData> = new Map();

  constructor() {
    this.initializeDefaultUsers();
  }

  /**
   * Authenticate user with API key
   */
  async authenticate(apiKey: string): Promise<AuthResult> {
    // Find user by API key
    const user = Array.from(this.users.values()).find(
      (u) => u.apiKey === apiKey
    );

    if (!user) {
      return {
        success: false,
        error: 'Invalid API key',
      };
    }

    // Check rate limits
    const rateLimitStatus = this.checkRateLimits(user);
    if (rateLimitStatus.remaining <= 0) {
      return {
        success: false,
        error: `Rate limit exceeded. Resets at ${rateLimitStatus.resetTime.toISOString()}`,
        rateLimitStatus,
      };
    }

    // Update user activity
    user.lastActive = new Date();
    user.usage.lastRequestTime = new Date();

    return {
      success: true,
      user,
      rateLimitStatus,
    };
  }

  /**
   * Create new user
   */
  async createUser(userData: {
    email: string;
    name: string;
    role: 'admin' | 'user' | 'readonly';
    limits?: Partial<UserLimits>;
  }): Promise<User> {
    const userId = this.generateUserId();
    const apiKey = this.generateApiKey();

    const defaultLimits: UserLimits = {
      requestsPerDay: 1000,
      tokensPerDay: 100000,
      requestsPerMonth: 30000,
      tokensPerMonth: 3000000,
      maxConcurrency: 4,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedModels: [
        'edgework-universal',
        'edgework-text2sql',
        'edgework-sql2text',
      ],
    };

    const user: User = {
      id: userId,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      apiKey,
      createdAt: new Date(),
      lastActive: new Date(),
      usage: {
        totalRequests: 0,
        totalTokens: 0,
        requestsThisMonth: 0,
        tokensThisMonth: 0,
        requestsToday: 0,
        tokensToday: 0,
        lastRequestTime: new Date(),
      },
      limits: { ...defaultLimits, ...userData.limits },
    };

    this.users.set(userId, user);
    this.rateLimitTracker.set(userId, new RateLimitTracker());

    return user;
  }

  /**
   * Update user usage after request
   */
  recordUsage(userId: string, tokensUsed: number): void {
    const user = this.users.get(userId);
    const tracker = this.rateLimitTracker.get(userId);

    if (!user || !tracker) return;

    // Update user usage
    user.usage.totalRequests++;
    user.usage.totalTokens += tokensUsed;
    user.usage.requestsToday++;
    user.usage.tokensToday += tokensUsed;
    user.usage.requestsThisMonth++;
    user.usage.tokensThisMonth += tokensUsed;

    // Update rate limit tracker
    tracker.recordRequest(tokensUsed);
  }

  /**
   * Check rate limits for user
   */
  checkRateLimits(user: User): RateLimitStatus {
    const tracker = this.rateLimitTracker.get(user.id);
    if (!tracker) {
      return {
        remaining: user.limits.requestsPerDay,
        resetTime: this.getEndOfDay(),
        limit: user.limits.requestsPerDay,
        window: 'day',
      };
    }

    // Check daily limits
    const dailyRemaining =
      user.limits.requestsPerDay - user.usage.requestsToday;
    if (dailyRemaining <= 0) {
      return {
        remaining: 0,
        resetTime: this.getEndOfDay(),
        limit: user.limits.requestsPerDay,
        window: 'day',
      };
    }

    // Check monthly limits
    const monthlyRemaining =
      user.limits.requestsPerMonth - user.usage.requestsThisMonth;
    if (monthlyRemaining <= 0) {
      return {
        remaining: 0,
        resetTime: this.getEndOfMonth(),
        limit: user.limits.requestsPerMonth,
        window: 'month',
      };
    }

    return {
      remaining: Math.min(dailyRemaining, monthlyRemaining),
      resetTime: this.getEndOfDay(),
      limit: user.limits.requestsPerDay,
      window: 'day',
    };
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /**
   * Get all users (admin only)
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Update user limits
   */
  updateUserLimits(userId: string, limits: Partial<UserLimits>): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.limits = { ...user.limits, ...limits };
    return true;
  }

  /**
   * Delete user
   */
  deleteUser(userId: string): boolean {
    const deleted = this.users.delete(userId);
    if (deleted) {
      this.rateLimitTracker.delete(userId);
    }
    return deleted;
  }

  /**
   * Reset daily usage counters
   */
  resetDailyUsage(): void {
    for (const user of this.users.values()) {
      user.usage.requestsToday = 0;
      user.usage.tokensToday = 0;
    }
  }

  /**
   * Reset monthly usage counters
   */
  resetMonthlyUsage(): void {
    for (const user of this.users.values()) {
      user.usage.requestsThisMonth = 0;
      user.usage.tokensThisMonth = 0;
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    totalUsers: number;
    totalRequests: number;
    totalTokens: number;
    activeUsers: number;
    topUsers: Array<{ user: User; requests: number; tokens: number }>;
  } {
    const users = Array.from(this.users.values());
    const activeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const activeUsers = users.filter(
      (user) => user.lastActive > activeThreshold
    );

    const topUsers = users
      .map((user) => ({
        user,
        requests: user.usage.totalRequests,
        tokens: user.usage.totalTokens,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      totalUsers: users.length,
      totalRequests: users.reduce(
        (sum, user) => sum + user.usage.totalRequests,
        0
      ),
      totalTokens: users.reduce((sum, user) => sum + user.usage.totalTokens, 0),
      activeUsers: activeUsers.length,
      topUsers,
    };
  }

  /**
   * Initialize default users
   */
  private initializeDefaultUsers(): void {
    // Create admin user
    this.createUser({
      email: 'admin@edgework.ai',
      name: 'Edgework Admin',
      role: 'admin',
      limits: {
        requestsPerDay: 10000,
        tokensPerDay: 1000000,
        requestsPerMonth: 300000,
        tokensPerMonth: 30000000,
        maxConcurrency: 20,
        maxFileSize: 1024 * 1024 * 1024, // 1GB
        allowedModels: [
          'edgework-text2sql',
          'edgework-sql2text',
          'edgework-universal',
          'edgework-advanced',
        ],
      },
    });

    // Create demo user
    this.createUser({
      email: 'demo@edgework.ai',
      name: 'Demo User',
      role: 'user',
      limits: {
        requestsPerDay: 500,
        tokensPerDay: 50000,
        requestsPerMonth: 15000,
        tokensPerMonth: 1500000,
        maxConcurrency: 2,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedModels: ['edgework-universal', 'edgework-text2sql'],
      },
    });
  }

  /**
   * Generate unique user ID
   */
  private generateUserId(): string {
    return (
      'user_' +
      Math.random().toString(36).substr(2, 9) +
      Date.now().toString(36)
    );
  }

  /**
   * Generate secure API key
   */
  private generateApiKey(): string {
    const prefix = 'edgework_';
    const randomPart = Math.random().toString(36).substr(2, 16);
    const timestamp = Date.now().toString(36);
    return prefix + randomPart + timestamp;
  }

  /**
   * Get end of day
   */
  private getEndOfDay(): Date {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  }

  /**
   * Get end of month
   */
  private getEndOfMonth(): Date {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    return endOfMonth;
  }
}

/**
 * Rate limit tracker for individual users
 */
class RateLimitTracker {
  private requests: Array<{ timestamp: Date; tokens: number }> = [];

  recordRequest(tokens: number): void {
    this.requests.push({
      timestamp: new Date(),
      tokens,
    });

    // Clean old requests (older than 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.requests = this.requests.filter((req) => req.timestamp > cutoff);
  }

  getRequestsInPeriod(hours: number): number {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.requests.filter((req) => req.timestamp > cutoff).length;
  }

  getTokensInPeriod(hours: number): number {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.requests
      .filter((req) => req.timestamp > cutoff)
      .reduce((sum, req) => sum + req.tokens, 0);
  }
}

/**
 * Session data for interactive mode
 */
interface SessionData {
  userId: string;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
  data: Record<string, any>;
}

/**
 * Global auth manager instance
 */
export const authManager = new AuthManager();
