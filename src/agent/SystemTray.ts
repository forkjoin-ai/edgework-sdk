/**
 * System Tray Integration - Multi-platform support
 * eslint-disable luxury-ui/no-emojis
 */

import type { SystemTrayOptions } from './types';
import type { AgentManager } from './AgentManager';

export interface SystemTrayMenuOption {
  label: string;
  action: () => void | Promise<void>;
  accelerator?: string;
  type?: 'typical' | 'separator' | 'submenu';
}

/**
 * Base system tray abstraction
 */
export abstract class SystemTray {
  protected agentManager: any;
  protected logger: any;

  constructor(agentManager: any) {
    this.agentManager = agentManager;
    this.logger = this.createLogger();
  }

  protected createLogger() {
    return {
      debug: (msg: string, data?: any) =>
        console.debug(`[SystemTray] ${msg}`, data),
      info: (msg: string, data?: any) =>
        console.info(`[SystemTray] ${msg}`, data),
      error: (msg: string, data?: any) =>
        console.error(`[SystemTray] ${msg}`, data),
    };
  }

  abstract show(): Promise<void>;
  abstract hide(): Promise<void>;
  abstract setStatus(status: string): Promise<void>;
  abstract updateStats(): Promise<void>;
}

/**
 * macOS system tray (Cocoa/SwiftUI)
 */
export class MacOSSystemTray extends SystemTray {
  private windowShown = false;

  async show(): Promise<void> {
    try {
      // Implementation note: implementation, this would use node-macos-native or similar
      // Current behavior: we'll use a placeholder that logs intentions
      this.logger.info('macOS tray icon shown');
      this.windowShown = true;
    } catch (error) {
      this.logger.error('Failed to show tray', { error });
      throw error;
    }
  }

  async hide(): Promise<void> {
    this.windowShown = false;
    this.logger.info('macOS tray icon hidden');
  }

  async setStatus(status: string): Promise<void> {
    this.logger.debug('Status updated', { status });
    // Would update menu bar title
  }

  async updateStats(): Promise<void> {
    const stats = this.agentManager.getStats();
    const status = `$${stats.estimatedEarnings.toFixed(2)} | Settings: ${
      stats.tasksCompleted
    } tasks`;
    await this.setStatus(status);
  }

  private getMenuItems(): SystemTrayMenuOption[] {
    return [
      {
        label: 'Status',
        action: () => this.showStatus(),
      },
      {
        label: 'separator',
        type: 'separator',
        action: () => {
          return undefined;
        },
      },
      {
        label: 'Start',
        action: () => this.agentManager.start(),
      },
      {
        label: 'Stop',
        action: () => this.agentManager.stop(),
      },
      {
        label: 'separator',
        type: 'separator',
        action: () => {
          return undefined;
        },
      },
      {
        label: 'Settings',
        action: () => this.showSettings(),
      },
      {
        label: 'Quit',
        action: () => process.exit(0),
        accelerator: 'Cmd+Q',
      },
    ];
  }

  private showStatus(): void {
    const stats = this.agentManager.getStats();
    console.log('\nEdgework Agent Status');
    console.log('========================');
    console.log(`Tasks Completed: ${stats.tasksCompleted}`);
    console.log(`Compute Time: ${(stats.totalComputeTime / 60).toFixed(2)}m`);
    console.log(`Estimated Earnings: $${stats.estimatedEarnings.toFixed(2)}`);
    console.log(`Active Tasks: ${stats.activeTaskCount}`);
    console.log(`Uptime: ${(stats.uptime / 60000).toFixed(2)}m\n`);
  }

  private showSettings(): void {
    const config = this.agentManager.getConfig();
    console.log('\nAgent Settings');
    console.log('==================');
    console.log(`Gateway: ${config.gateway.name}`);
    console.log(`Region: ${config.gateway.region}`);
    console.log(
      `CPU Allocation: ${(config.compute.cpuAllocation * 100).toFixed(0)}%`
    );
    console.log(`Memory: ${config.compute.memoryMB}MB\n`);
  }
}

/**
 * Windows system tray (Windows API)
 */
export class WindowsSystemTray extends SystemTray {
  private windowShown = false;

  async show(): Promise<void> {
    try {
      this.logger.info('Windows tray icon shown');
      this.windowShown = true;
    } catch (error) {
      this.logger.error('Failed to show tray', { error });
      throw error;
    }
  }

  async hide(): Promise<void> {
    this.windowShown = false;
    this.logger.info('Windows tray icon hidden');
  }

  async setStatus(status: string): Promise<void> {
    this.logger.debug('Status updated', { status });
    // Would update tooltip
  }

  async updateStats(): Promise<void> {
    const stats = this.agentManager.getStats();
    const tooltip = [
      `Edgework Agent`,
      `Earnings: $${stats.estimatedEarnings.toFixed(2)}`,
      `Tasks: ${stats.tasksCompleted}`,
      `Uptime: ${(stats.uptime / 60000).toFixed(0)}m`,
    ].join('\n');
    await this.setStatus(tooltip);
  }

  private getMenuItems(): SystemTrayMenuOption[] {
    return [
      {
        label: 'Show Status',
        action: () => this.showStatus(),
      },
      {
        label: 'Start',
        action: () => this.agentManager.start(),
      },
      {
        label: 'Stop',
        action: () => this.agentManager.stop(),
      },
      {
        label: 'Settings',
        action: () => this.showSettings(),
      },
      {
        label: 'Exit',
        action: () => process.exit(0),
      },
    ];
  }

  private showStatus(): void {
    const stats = this.agentManager.getStats();
    console.log('\nEdgework Agent Status');
    console.log('========================');
    console.log(`Tasks Completed: ${stats.tasksCompleted}`);
    console.log(`Earnings: $${stats.estimatedEarnings.toFixed(2)}`);
    console.log(`Uptime: ${(stats.uptime / 60000).toFixed(0)} minutes\n`);
  }

  private showSettings(): void {
    const config = this.agentManager.getConfig();
    console.log('\nSettings');
    console.log(`Gateway: ${config.gateway.name}`);
    console.log(`CPU: ${(config.compute.cpuAllocation * 100).toFixed(0)}%\n`);
  }
}

/**
 * Linux system tray (xdg-desktop-portal / GTK)
 */
export class LinuxSystemTray extends SystemTray {
  private windowShown = false;

  async show(): Promise<void> {
    try {
      this.logger.info('Linux tray icon shown');
      this.windowShown = true;
    } catch (error) {
      this.logger.error('Failed to show tray', { error });
      throw error;
    }
  }

  async hide(): Promise<void> {
    this.windowShown = false;
    this.logger.info('Linux tray icon hidden');
  }

  async setStatus(status: string): Promise<void> {
    this.logger.debug('Status updated', { status });
  }

  async updateStats(): Promise<void> {
    const stats = this.agentManager.getStats();
    const status = `Edgework: $${stats.estimatedEarnings.toFixed(2)}`;
    await this.setStatus(status);
  }
}

/**
 * Factory for creating platform-specific system tray
 */
export function createSystemTray(options: any): SystemTray {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return new MacOSSystemTray(options.agentManager);
    case 'win32':
      return new WindowsSystemTray(options.agentManager);
    case 'linux':
      return new LinuxSystemTray(options.agentManager);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
