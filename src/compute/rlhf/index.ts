/**
 * Edgework RLHF Module
 *
 * On-device reinforcement learning from human feedback.
 */

export { RewardModel } from './reward-model';
export { RLHFTrainer } from './trainer';
export { FederatedSync } from './federated-sync';
export {
  computeDeficit,
  trajectoryFromDeficit,
  convergenceRound,
  verifyMonotone,
  provePrivacy,
  trajectoriesIndistinguishable,
  checkTeleportationFeasibility,
  buildTeleportationDeficit,
  receiveTeleportation,
  causalSymmetry,
  deficitAtRound,
} from './statistical-teleportation';
export type {
  BuleyeanSpace,
  TeleportationDeficit,
  EntropyTrajectory,
  PrivacyProof,
  TeleportationFeasibility,
} from './statistical-teleportation';
