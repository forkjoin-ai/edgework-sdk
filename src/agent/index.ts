/**
 * Edgework Agent Development Kit - Main Exports
 */

// Types
export * from './types';

// Classes
export { WalletManager } from './WalletManager';
export { GatewayConnector } from './GatewayConnector';
export { AgentManager } from './AgentManager';
export { ComputeNode } from './ComputeNode';
export { TokenSpendingManager } from './TokenSpendingManager';
export {
  SystemTray,
  MacOSSystemTray,
  WindowsSystemTray,
  LinuxSystemTray,
  createSystemTray,
} from './SystemTray';
// Setup wizard
export { runSetupWizard, completeSetup } from './setup';
