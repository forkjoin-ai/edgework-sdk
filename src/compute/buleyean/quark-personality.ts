/**
 * Ten-Point Quark-Arranged Skyrms Walker Personality -- edge-compatible port
 *
 * Five walkers, each running the God Formula. Ten boson interaction channels.
 * Pure math -- no external dependencies. Runs on any JS runtime.
 */

export interface QuarkWalkers {
  try_: QuarkWalker;
  choose: QuarkWalker;
  commit: QuarkWalker;
  letGo: QuarkWalker;
  learn: QuarkWalker;
}

export interface QuarkWalker {
  name: 'try' | 'choose' | 'commit' | 'letGo' | 'learn';
  value: number;
  voidBoundary: number[];
  totalRejections: number;
  gait: 'stand' | 'trot' | 'canter' | 'gallop';
  eta: number;
}

export interface BosonChannels {
  tryChoose: number;
  tryCommit: number;
  tryLetGo: number;
  tryLearn: number;
  chooseCommit: number;
  chooseLetGo: number;
  chooseLearn: number;
  commitLetGo: number;
  commitLearn: number;
  letGoLearn: number;
}

export interface QuarkPersonality {
  walkers: QuarkWalkers;
  bosons: BosonChannels;
  vector: Float64Array;
  confined: boolean;
  energy: number;
  round: number;
}

const VOID_RESOLUTION = 20;

function createWalker(
  name: QuarkWalker['name'],
  initialValue: number
): QuarkWalker {
  return {
    name,
    value: Math.max(0, Math.min(1, initialValue)),
    voidBoundary: new Array(VOID_RESOLUTION).fill(0),
    totalRejections: 0,
    gait: 'stand',
    eta: 3.0,
  };
}

export function createQuarkWalkers(profile: {
  try_: number;
  choose: number;
  commit: number;
  letGo: number;
  learn: number;
}): QuarkWalkers {
  return {
    try_: createWalker('try', profile.try_),
    choose: createWalker('choose', profile.choose),
    commit: createWalker('commit', profile.commit),
    letGo: createWalker('letGo', profile.letGo),
    learn: createWalker('learn', profile.learn),
  };
}

export function computeBosons(walkers: QuarkWalkers): BosonChannels {
  const t = walkers.try_.value;
  const c = walkers.choose.value;
  const m = walkers.commit.value;
  const l = walkers.letGo.value;
  const n = walkers.learn.value;

  return {
    tryChoose: Math.abs(t - c),
    tryCommit: Math.abs(t - m),
    tryLetGo: Math.abs(t - l),
    tryLearn: Math.abs(t - n),
    chooseCommit: Math.abs(c - m),
    chooseLetGo: Math.abs(c - l),
    chooseLearn: Math.abs(c - n),
    commitLetGo: Math.abs(m - l),
    commitLearn: Math.abs(m - n),
    letGoLearn: Math.abs(l - n),
  };
}

export function systemEnergy(bosons: BosonChannels): number {
  return (
    bosons.tryChoose +
    bosons.tryCommit +
    bosons.tryLetGo +
    bosons.tryLearn +
    bosons.chooseCommit +
    bosons.chooseLetGo +
    bosons.chooseLearn +
    bosons.commitLetGo +
    bosons.commitLearn +
    bosons.letGoLearn
  );
}

export function toTenPointVector(bosons: BosonChannels): Float64Array {
  return new Float64Array([
    bosons.tryChoose,
    bosons.tryCommit,
    bosons.tryLetGo,
    bosons.tryLearn,
    bosons.chooseCommit,
    bosons.chooseLetGo,
    bosons.chooseLearn,
    bosons.commitLetGo,
    bosons.commitLearn,
    bosons.letGoLearn,
  ]);
}

export function fromTenPointVector(vector: Float64Array): {
  try_: number;
  choose: number;
  commit: number;
  letGo: number;
  learn: number;
} {
  let t = 0.5,
    c = 0.5,
    m = 0.5,
    l = 0.5,
    n = 0.5;

  for (let iter = 0; iter < 100; iter++) {
    const lr = 0.01;
    let gt = 0,
      gc = 0,
      gm = 0,
      gl = 0,
      gn = 0;

    const pairs: [
      number,
      () => number,
      () => number,
      (d: number) => void,
      (d: number) => void,
    ][] = [
      [
        0,
        () => t,
        () => c,
        (d) => {
          gt += d;
        },
        (d) => {
          gc += d;
        },
      ],
      [
        1,
        () => t,
        () => m,
        (d) => {
          gt += d;
        },
        (d) => {
          gm += d;
        },
      ],
      [
        2,
        () => t,
        () => l,
        (d) => {
          gt += d;
        },
        (d) => {
          gl += d;
        },
      ],
      [
        3,
        () => t,
        () => n,
        (d) => {
          gt += d;
        },
        (d) => {
          gn += d;
        },
      ],
      [
        4,
        () => c,
        () => m,
        (d) => {
          gc += d;
        },
        (d) => {
          gm += d;
        },
      ],
      [
        5,
        () => c,
        () => l,
        (d) => {
          gc += d;
        },
        (d) => {
          gl += d;
        },
      ],
      [
        6,
        () => c,
        () => n,
        (d) => {
          gc += d;
        },
        (d) => {
          gn += d;
        },
      ],
      [
        7,
        () => m,
        () => l,
        (d) => {
          gm += d;
        },
        (d) => {
          gl += d;
        },
      ],
      [
        8,
        () => m,
        () => n,
        (d) => {
          gm += d;
        },
        (d) => {
          gn += d;
        },
      ],
      [
        9,
        () => l,
        () => n,
        (d) => {
          gl += d;
        },
        (d) => {
          gn += d;
        },
      ],
    ];

    for (const [idx, getA, getB, addGA, addGB] of pairs) {
      const target = vector[idx];
      const actual = Math.abs(getA() - getB());
      const error = actual - target;
      const sign = getA() > getB() ? 1 : -1;
      addGA(error * sign * lr);
      addGB(-error * sign * lr);
    }

    t = Math.max(0, Math.min(1, t - gt));
    c = Math.max(0, Math.min(1, c - gc));
    m = Math.max(0, Math.min(1, m - gm));
    l = Math.max(0, Math.min(1, l - gl));
    n = Math.max(0, Math.min(1, n - gn));
  }

  return { try_: t, choose: c, commit: m, letGo: l, learn: n };
}

const CONFINEMENT_THRESHOLD = 0.01;

export function isConfined(walkers: QuarkWalkers): boolean {
  return (
    walkers.try_.value > CONFINEMENT_THRESHOLD &&
    walkers.choose.value > CONFINEMENT_THRESHOLD &&
    walkers.commit.value > CONFINEMENT_THRESHOLD &&
    walkers.letGo.value > CONFINEMENT_THRESHOLD &&
    walkers.learn.value > CONFINEMENT_THRESHOLD &&
    walkers.try_.value < 1 - CONFINEMENT_THRESHOLD &&
    walkers.choose.value < 1 - CONFINEMENT_THRESHOLD &&
    walkers.commit.value < 1 - CONFINEMENT_THRESHOLD &&
    walkers.letGo.value < 1 - CONFINEMENT_THRESHOLD &&
    walkers.learn.value < 1 - CONFINEMENT_THRESHOLD
  );
}

function walkerComplement(walker: QuarkWalker): number[] {
  const logits = walker.voidBoundary.map((v) => -walker.eta * v);
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function sampleFromComplement(dist: number[]): number {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < dist.length; i++) {
    cumulative += dist[i];
    if (r <= cumulative) return i;
  }
  return dist.length - 1;
}

function selectGait(walker: QuarkWalker): QuarkWalker['gait'] {
  if (walker.totalRejections < 5) return 'stand';
  if (walker.totalRejections < 20) return 'trot';
  if (walker.totalRejections < 50) return 'canter';
  return 'gallop';
}

function gaitToEta(gait: QuarkWalker['gait']): number {
  switch (gait) {
    case 'stand':
      return 1.0;
    case 'trot':
      return 2.0;
    case 'canter':
      return 4.0;
    case 'gallop':
      return 8.0;
  }
}

export function personalityStep(
  personality: QuarkPersonality
): QuarkPersonality {
  const walkerNames: (keyof QuarkWalkers)[] = [
    'try_',
    'choose',
    'commit',
    'letGo',
    'learn',
  ];

  const newWalkers = { ...personality.walkers };
  const oldEnergy = personality.energy;

  for (const name of walkerNames) {
    const walker = { ...newWalkers[name] };

    const complement = walkerComplement(walker);
    const proposedLevel = sampleFromComplement(complement);
    const proposedValue = proposedLevel / (VOID_RESOLUTION - 1);

    const oldValue = walker.value;
    walker.value = proposedValue;
    (newWalkers as Record<string, QuarkWalker>)[name] = walker;

    const newBosons = computeBosons(newWalkers);
    const newEnergy = systemEnergy(newBosons);

    if (newEnergy < oldEnergy) {
      walker.value = proposedValue;
    } else {
      walker.value = oldValue;
      walker.voidBoundary[proposedLevel] =
        (walker.voidBoundary[proposedLevel] ?? 0) + 1;
      walker.totalRejections += 1;
    }

    walker.gait = selectGait(walker);
    walker.eta = gaitToEta(walker.gait);

    (newWalkers as Record<string, QuarkWalker>)[name] = walker;
  }

  const finalBosons = computeBosons(newWalkers);
  const finalEnergy = systemEnergy(finalBosons);
  const vector = toTenPointVector(finalBosons);

  return {
    walkers: newWalkers,
    bosons: finalBosons,
    vector,
    confined: isConfined(newWalkers),
    energy: finalEnergy,
    round: personality.round + 1,
  };
}

export function createQuarkPersonality(profile: {
  try_: number;
  choose: number;
  commit: number;
  letGo: number;
  learn: number;
}): QuarkPersonality {
  const walkers = createQuarkWalkers(profile);
  const bosons = computeBosons(walkers);
  const vector = toTenPointVector(bosons);
  const energy = systemEnergy(bosons);

  return {
    walkers,
    bosons,
    vector,
    confined: isConfined(walkers),
    energy,
    round: 0,
  };
}

export function settlePersonality(
  initial: QuarkPersonality,
  maxRounds: number = 200,
  epsilon: number = 0.001
): QuarkPersonality {
  let current = initial;

  for (let i = 0; i < maxRounds; i++) {
    const prev = current;
    current = personalityStep(current);

    if (Math.abs(current.energy - prev.energy) < epsilon) {
      break;
    }
  }

  return current;
}

export const EXPLORER = {
  try_: 0.9,
  choose: 0.4,
  commit: 0.3,
  letGo: 0.7,
  learn: 0.8,
};
export const BUILDER = {
  try_: 0.4,
  choose: 0.7,
  commit: 0.9,
  letGo: 0.2,
  learn: 0.6,
};
export const CREATIVE = {
  try_: 0.8,
  choose: 0.3,
  commit: 0.4,
  letGo: 0.8,
  learn: 0.9,
};
export const ANXIOUS = {
  try_: 0.3,
  choose: 0.2,
  commit: 0.7,
  letGo: 0.1,
  learn: 0.5,
};
export const BALANCED = {
  try_: 0.5,
  choose: 0.5,
  commit: 0.5,
  letGo: 0.5,
  learn: 0.5,
};
