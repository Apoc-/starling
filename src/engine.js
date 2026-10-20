export const MAX_VALUE = 1e15;
export const OFFLINE_CAP_MS = 14400000;

export const PRODUCERS = Object.freeze([
  { id: 'scout', name: 'Collector drone', description: 'Gather 0.5 energy per second.', baseCost: 10, baseRate: 0.5, growth: 1.16 },
  { id: 'array', name: 'Solar array', description: 'Harvest 4 energy per second.', baseCost: 80, baseRate: 4, growth: 1.16 },
  { id: 'reactor', name: 'Fusion reactor', description: 'Generate 35 energy per second.', baseCost: 900, baseRate: 35, growth: 1.16 },
].map(Object.freeze));

export const UPGRADES = Object.freeze([
  { id: 'pulse', name: 'Focused pulse', description: 'Double energy from each tap.', cost: 60 },
  { id: 'conductor', name: 'Smart grid', description: 'Double all passive production.', cost: 400 },
  { id: 'resonance', name: 'Stellar resonance', description: 'Double all passive production again.', cost: 2500 },
].map(Object.freeze));

export function tapValue(state) {
  return (state.upgrades.includes('pulse') ? 2 : 1) * (1 + 0.25 * state.stardust);
}

export function production(state) {
  const base = PRODUCERS.reduce((sum, item) => sum + item.baseRate * state.producers[item.id], 0);
  return base * (state.upgrades.includes('conductor') ? 2 : 1)
    * (state.upgrades.includes('resonance') ? 2 : 1) * (1 + 0.25 * state.stardust);
}

export function producerCost(state, id, quantity = 1) {
  const item = PRODUCERS.find(item => item.id === id);
  if (!validateState(state) || !item || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000
      || state.producers[id] + quantity > 10000) return Infinity;
  let total = 0;
  for (let i = 0; i < quantity; i += 1) {
    total += Math.ceil(item.baseCost * item.growth ** (state.producers[id] + i));
    if (!Number.isFinite(total) || total > MAX_VALUE) return Infinity;
  }
  return total;
}

export function buyProducer(state, id, quantity = 1) {
  const cost = producerCost(state, id, quantity);
  if (!Number.isFinite(cost) || state.energy < cost) return state;
  return { ...state, energy: state.energy - cost,
    producers: { ...state.producers, [id]: state.producers[id] + quantity } };
}

export function buyUpgrade(state, id) {
  const item = UPGRADES.find(item => item.id === id);
  if (!validateState(state) || !item || state.upgrades.includes(id) || state.energy < item.cost) return state;
  return { ...state, energy: state.energy - item.cost, upgrades: [...state.upgrades, id] };
}

export function advance(state, now) {
  if (!bounded(now) || now <= state.checkpoint) return state;
  const amount = production(state) * Math.min(now - state.checkpoint, OFFLINE_CAP_MS) / 1000;
  return { ...state, energy: Math.min(MAX_VALUE, state.energy + amount), runEarned: Math.min(MAX_VALUE, state.runEarned + amount),
    lifetimeEarned: Math.min(MAX_VALUE, state.lifetimeEarned + amount), checkpoint: now };
}

export function previewVoyage(state) {
  return Math.floor(Math.sqrt(state.runEarned / 10000));
}

export function launchVoyage(state) {
  const reward = previewVoyage(state);
  if (reward === 0) return state;
  return { ...createState(state.checkpoint), lifetimeEarned: state.lifetimeEarned,
    stardust: Math.min(MAX_VALUE, state.stardust + reward), voyages: Math.min(MAX_VALUE, state.voyages + 1) };
}

export function tap(state) {
  const amount = tapValue(state);
  return { ...state, energy: Math.min(MAX_VALUE, state.energy + amount), runEarned: Math.min(MAX_VALUE, state.runEarned + amount),
    lifetimeEarned: Math.min(MAX_VALUE, state.lifetimeEarned + amount) };
}

const bounded = (value, max = MAX_VALUE) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

const exactKeys = (object, keys) => object !== null && typeof object === 'object'
  && !Array.isArray(object) && Reflect.ownKeys(object).length === keys.length
  && keys.every(key => Object.hasOwn(object, key));

export function validateState(state) {
  if (!exactKeys(state, ['energy', 'runEarned', 'lifetimeEarned', 'producers', 'upgrades',
    'stardust', 'voyages', 'checkpoint'])) return false;
  return ['energy', 'runEarned', 'lifetimeEarned', 'checkpoint', 'stardust', 'voyages']
    .every(key => bounded(state[key]))
    && Number.isInteger(state.stardust) && Number.isInteger(state.voyages)
    && exactKeys(state.producers, PRODUCERS.map(item => item.id))
    && PRODUCERS.every(item => bounded(state.producers[item.id], 10000)
      && Number.isInteger(state.producers[item.id]))
    && Array.isArray(state.upgrades) && state.upgrades.length <= UPGRADES.length
    && new Set(state.upgrades).size === state.upgrades.length
    && [...state.upgrades].every(id => UPGRADES.some(item => item.id === id));
}

export function createState(now) {
  return {
    energy: 0, runEarned: 0, lifetimeEarned: 0,
    producers: { scout: 0, array: 0, reactor: 0 }, upgrades: [],
    stardust: 0, voyages: 0, checkpoint: now,
  };
}
