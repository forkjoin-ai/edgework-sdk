# Edgework RLHF

On-device Reinforcement Learning from Human Feedback logic.

## Purpose

Enables decentralized model improvement by collecting feedback and training LoRA adapters directly on the user's device. Supports federated synchronization of gradients.

## Key Files

- **RLHFTrainer** (`trainer.ts`): Main class for managing on-device training loops.
- **RewardModel** (`reward-model.ts`): Client-side reward modeling.
- **FederatedSync** (`federated-sync.ts`): Logic for syncing gradients/adapters with a central server (optional).

## Usage

```typescript
import { RLHFTrainer } from './trainer';

const trainer = new RLHFTrainer({
    storage,
    modelId: 'cyrano-360m'
});

await trainer.recordFeedback({
    messageHash: '...',
    feedback: 1.0 // Positive
});
```

Last Updated: 2026-01-31