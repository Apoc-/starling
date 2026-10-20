import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine.js';

test('catalog defines the fixed prices, rates, and upgrades', () => {
  assert.deepEqual(engine.PRODUCERS?.map(({description, ...item}) => item), [
    { id: 'scout', name: 'Collector drone', baseCost: 10, baseRate: 0.5, growth: 1.16 },
    { id: 'array', name: 'Solar array', baseCost: 80, baseRate: 4, growth: 1.16 },
    { id: 'reactor', name: 'Fusion reactor', baseCost: 900, baseRate: 35, growth: 1.16 },
  ]);
  assert.deepEqual(engine.UPGRADES?.map(({description, ...item}) => item), [
    { id: 'pulse', name: 'Focused pulse', cost: 60 },
    { id: 'conductor', name: 'Smart grid', cost: 400 },
    { id: 'resonance', name: 'Stellar resonance', cost: 2500 },
  ]);
  for (const item of [...engine.PRODUCERS, ...engine.UPGRADES]) {
    assert.equal(typeof item.description, 'string');
    assert.ok(item.description.length > 0);
  }
  assert.equal(engine.MAX_VALUE, 1e15);
  assert.equal(engine.OFFLINE_CAP_MS, 14400000);
});

test('tap credits all earning counters without mutating its input', () => {
  assert.equal(typeof engine.tapValue, 'function');
  const state = freeze(fresh());
  assert.equal(engine.tapValue(state), 1);
  const next = engine.tap(state);
  assert.equal(next.energy, 1);
  assert.equal(next.runEarned, 1);
  assert.equal(next.lifetimeEarned, 1);
  assert.equal(next.checkpoint, state.checkpoint);
  assert.equal(state.energy, 0);
  assert.notEqual(next, state);
});

test('pulse and stardust multiply tap value', () => {
  const state = freeze({ ...fresh(), upgrades: ['pulse'], stardust: 4 });
  assert.equal(engine.tapValue(state), 4);
  assert.equal(engine.tap(state).energy, 4);
  assert.equal(engine.tapValue({ ...state, upgrades: [] }), 2);
});

test('production sums producers and stacks passive multipliers', () => {
  assert.equal(typeof engine.production, 'function');
  assert.equal(engine.production(fresh()), 0);
  const state = freeze({ ...fresh(), producers: { scout: 2, array: 3, reactor: 1 },
    upgrades: ['conductor', 'resonance', 'pulse'], stardust: 4 });
  assert.equal(engine.production(state), 384);
  assert.equal(engine.production({ ...state, upgrades: [] }), 96);
  assert.equal(engine.production({ ...state, upgrades: ['conductor'] }), 192);
  assert.equal(engine.production({ ...state, upgrades: ['resonance'] }), 192);
});

test('bulk producer price sums individually rounded exponential prices', () => {
  assert.equal(typeof engine.producerCost, 'function');
  assert.equal(engine.producerCost(fresh(), 'scout'), 10);
  for (const item of engine.PRODUCERS) {
    for (const owned of [0, 1, 7, 25]) {
      const state = { ...fresh(), producers: { ...fresh().producers, [item.id]: owned } };
      for (const quantity of [1, 3, 10]) {
        const expected = Array.from({length: quantity}, (_, i) =>
          Math.ceil(item.baseCost * item.growth ** (owned + i))).reduce((a, b) => a + b, 0);
        assert.equal(engine.producerCost(state, item.id, quantity), expected);
      }
    }
  }
});

test('producer purchases have exact affordability and bulk equals sequential', () => {
  assert.equal(typeof engine.buyProducer, 'function');
  for (const {id} of engine.PRODUCERS) {
    const quote = engine.producerCost(fresh(), id, 10);
    const state = freeze({ ...fresh(), energy: quote, runEarned: quote, lifetimeEarned: quote });
    const bulk = engine.buyProducer(state, id, 10);
    let sequential = state;
    for (let i = 0; i < 10; i++) sequential = engine.buyProducer(sequential, id);
    assert.deepEqual(bulk, sequential);
    assert.equal(bulk.energy, 0);
    assert.equal(bulk.producers[id], 10);
    assert.equal(bulk.lifetimeEarned, quote);
    assert.equal(bulk.runEarned, quote);
    assert.equal(state.producers[id], 0);
    const short = freeze({ ...state, energy: quote - 0.01 });
    assert.equal(engine.buyProducer(short, id, 10), short);
  }
});

test('invalid or overflowing producer quotes are unavailable and cannot spend', () => {
  const state = freeze({ ...fresh(), energy: engine.MAX_VALUE });
  for (const id of ['missing', '__proto__', null, 42]) {
    assert.equal(engine.producerCost(state, id), Infinity);
    assert.equal(engine.buyProducer(state, id), state);
  }
  for (const quantity of [0, -1, 0.5, NaN, Infinity, '2', null, 10001]) {
    assert.equal(engine.producerCost(state, 'scout', quantity), Infinity);
    assert.equal(engine.buyProducer(state, 'scout', quantity), state);
  }
  for (const owned of [225, 9999, 10000]) {
    const full = freeze({ ...state, producers: { scout: owned, array: 0, reactor: 0 } });
    assert.equal(engine.producerCost(full, 'scout', 2), Infinity);
    assert.equal(engine.buyProducer(full, 'scout', 2), full);
  }
  assert.equal(engine.producerCost(state, 'reactor', 10000), Infinity);
});

test('upgrade purchases spend once at exact price and leave failures unchanged', () => {
  assert.equal(typeof engine.buyUpgrade, 'function');
  for (const {id, cost} of engine.UPGRADES) {
    const state = freeze({ ...fresh(), energy: cost, runEarned: cost, lifetimeEarned: cost });
    const next = engine.buyUpgrade(state, id);
    assert.equal(next.energy, 0);
    assert.deepEqual(next.upgrades, [id]);
    assert.deepEqual(state.upgrades, []);
    assert.equal(next.runEarned, cost);
    assert.equal(next.lifetimeEarned, cost);
    const owned = freeze({ ...next, energy: 10000 });
    assert.equal(engine.buyUpgrade(owned, id), owned);
    const short = freeze({ ...state, energy: cost - 0.01 });
    assert.equal(engine.buyUpgrade(short, id), short);
  }
  const state = freeze(fresh());
  for (const id of ['missing', '__proto__', null, 1]) assert.equal(engine.buyUpgrade(state, id), state);
});

test('advance credits fractional constant production since its checkpoint', () => {
  assert.equal(typeof engine.advance, 'function');
  const state = freeze({ ...fresh(), producers: { scout: 3, array: 0, reactor: 0 } });
  const next = engine.advance(state, 2500);
  assert.equal(next.energy, 2.25);
  assert.equal(next.runEarned, 2.25);
  assert.equal(next.lifetimeEarned, 2.25);
  assert.equal(next.checkpoint, 2500);
  assert.equal(state.energy, 0);
  assert.equal(state.checkpoint, 1000);
  const split = engine.advance(engine.advance(state, 2000), 2500);
  assert.deepEqual(split, next);
});

test('backwards and repeated clock readings cannot debit or duplicate earnings', () => {
  const state = freeze({ ...fresh(), producers: { scout: 2, array: 0, reactor: 0 } });
  assert.deepEqual(engine.advance(state, 500), state);
  const next = engine.advance(state, 5000);
  assert.deepEqual(engine.advance(next, 5000), next);
  assert.deepEqual(engine.advance(next, 2000), next);
  assert.equal(engine.advance(engine.advance(next, 2000), 6000).energy, 5);
});

test('offline cap discards excess elapsed time and consumes the complete interval once', () => {
  const state = freeze({ ...fresh(0), producers: { scout: 2, array: 0, reactor: 0 } });
  const next = engine.advance(state, engine.OFFLINE_CAP_MS * 3);
  assert.equal(next.energy, 14400);
  assert.equal(next.runEarned, 14400);
  assert.equal(next.checkpoint, engine.OFFLINE_CAP_MS * 3);
  assert.deepEqual(engine.advance(next, next.checkpoint), next);
  assert.equal(engine.advance(next, next.checkpoint + 1000).energy, 14401);
  assert.equal(engine.advance(state, engine.OFFLINE_CAP_MS - 1).energy, 14399.999);
  const empty = engine.advance(fresh(0), 1234);
  assert.equal(empty.checkpoint, 1234);
  assert.equal(empty.energy, 0);
});

test('resource earnings saturate each counter independently at MAX_VALUE', () => {
  const max = engine.MAX_VALUE;
  const state = freeze({ ...fresh(), energy: max - 0.5, runEarned: max - 0.25,
    lifetimeEarned: max, producers: { scout: 2, array: 0, reactor: 0 } });
  for (const next of [engine.tap(state), engine.advance(state, 10000)]) {
    assert.equal(next.energy, max);
    assert.equal(next.runEarned, max);
    assert.equal(next.lifetimeEarned, max);
  }
  const high = freeze({ ...fresh(), stardust: max, upgrades: ['pulse', 'conductor', 'resonance'],
    producers: { scout: 10000, array: 10000, reactor: 10000 } });
  const next = engine.advance(high, engine.OFFLINE_CAP_MS);
  assert.equal(next.energy, max);
  assert.equal(next.runEarned, max);
  assert.equal(next.lifetimeEarned, max);
});

test('voyage preview uses run earnings thresholds rather than spendable energy', () => {
  assert.equal(typeof engine.previewVoyage, 'function');
  for (const [runEarned, expected] of [[0, 0], [9999.99, 0], [10000, 1], [39999, 1], [40000, 2], [90000, 3]]) {
    assert.equal(engine.previewVoyage(freeze({ ...fresh(), energy: 0, runEarned })), expected);
  }
});

test('voyage reset preserves lifetime and checkpoint while awarding persistent stardust', () => {
  assert.equal(typeof engine.launchVoyage, 'function');
  const ineligible = freeze({ ...fresh(), runEarned: 9999 });
  assert.equal(engine.launchVoyage(ineligible), ineligible);
  const state = freeze({ ...fresh(123456), energy: 777, runEarned: 40000, lifetimeEarned: 123456,
    producers: { scout: 10, array: 3, reactor: 2 }, upgrades: ['pulse', 'conductor'], stardust: 3, voyages: 2 });
  const next = engine.launchVoyage(state);
  assert.deepEqual(next, { ...fresh(123456), lifetimeEarned: 123456, stardust: 5, voyages: 3 });
  assert.equal(state.energy, 777);
  assert.equal(engine.launchVoyage(next), next);
  assert.equal(engine.tapValue(next), 2.25);
});

test('voyage persistent counters saturate without overflowing their valid bounds', () => {
  const state = freeze({ ...fresh(), runEarned: engine.MAX_VALUE, lifetimeEarned: engine.MAX_VALUE,
    stardust: engine.MAX_VALUE - 1, voyages: engine.MAX_VALUE });
  const next = engine.launchVoyage(state);
  assert.equal(next.stardust, engine.MAX_VALUE);
  assert.equal(next.voyages, engine.MAX_VALUE);
});

test('save validation strictly bounds numeric scalars without coercion', () => {
  assert.equal(typeof engine.validateState, 'function');
  assert.equal(engine.validateState(fresh()), true);
  for (const field of ['energy', 'runEarned', 'lifetimeEarned', 'checkpoint', 'stardust', 'voyages']) {
    for (const value of [0, engine.MAX_VALUE]) assert.equal(engine.validateState({ ...fresh(), [field]: value }), true);
    for (const value of [-1, engine.MAX_VALUE + 1, NaN, Infinity, -Infinity, '0', null, undefined, true]) {
      assert.equal(engine.validateState({ ...fresh(), [field]: value }), false, `${field}=${String(value)}`);
    }
  }
  for (const field of ['stardust', 'voyages']) assert.equal(engine.validateState({ ...fresh(), [field]: 0.5 }), false);
  assert.equal(engine.validateState({ ...fresh(), energy: 0.5, checkpoint: 0.5 }), true);
});

test('save validation rejects malformed roots and requires own schema fields', () => {
  for (const state of [null, undefined, 0, 'save', [], {}, Object.create(fresh()),
    { ...fresh(), extra: true }]) assert.equal(engine.validateState(state), false);
  for (const key of Object.keys(fresh())) {
    const state = fresh();
    delete state[key];
    assert.equal(engine.validateState(state), false, `missing ${key}`);
  }
});

test('producer save schema requires exactly known bounded integer counts', () => {
  for (const producers of [null, [], {}, {scout: 0, array: 0},
    {scout: 0, array: 0, reactor: 0, extra: 0},
    Object.create({scout: 0, array: 0, reactor: 0})]) {
    assert.equal(engine.validateState({ ...fresh(), producers }), false);
  }
  for (const {id} of engine.PRODUCERS) {
    for (const value of [-1, 0.5, 10001, NaN, Infinity, '0', undefined]) {
      assert.equal(engine.validateState({ ...fresh(), producers: { ...fresh().producers, [id]: value } }), false);
    }
    for (const value of [0, 10000]) {
      assert.equal(engine.validateState({ ...fresh(), producers: { ...fresh().producers, [id]: value } }), true);
    }
  }
});

test('upgrade save schema requires a dense duplicate-free list of known IDs', () => {
  for (const upgrades of [null, {}, 'pulse', ['missing'], ['pulse', 'pulse'], [1], [undefined], new Array(1)]) {
    assert.equal(engine.validateState({ ...fresh(), upgrades }), false);
  }
  for (const upgrades of [[], ['pulse'], ['resonance', 'pulse', 'conductor']]) {
    assert.equal(engine.validateState(freeze({ ...fresh(), upgrades })), true);
  }
});

test('invalid elapsed-time readings leave state unchanged rather than corrupting it', () => {
  const state = freeze({ ...fresh(), producers: { scout: 1, array: 0, reactor: 0 } });
  for (const now of [NaN, Infinity, -Infinity, '2000', null, undefined, -1, engine.MAX_VALUE + 1]) {
    assert.equal(engine.advance(state, now), state);
  }
});

test('purchases reject malformed state rather than spending through invalid balances', () => {
  for (const state of [null, {}, { ...fresh(), energy: NaN }, { ...fresh(), energy: Infinity },
    { ...fresh(), producers: { scout: -1, array: 0, reactor: 0 } },
    { ...fresh(), producers: { scout: '0', array: 0, reactor: 0 } }]) {
    assert.equal(engine.producerCost(state, 'scout'), Infinity);
    assert.equal(engine.buyProducer(state, 'scout'), state);
    assert.equal(engine.buyUpgrade(state, 'pulse'), state);
  }
});

test('simulation earns its first drone through real one-second ticks and taps', async () => {
  const simulation = await import('../scripts/simulate.mjs');
  assert.equal(typeof simulation.simulateScenario, 'function');
  for (const mode of ['active', 'idle']) {
    const report = simulation.simulateScenario({ mode, strategy: 'balanced', seconds: 10 });
    assert.equal(report.firstAutomationSeconds, 5);
    assert.equal(report.final.producers.scout, 1);
    assert.equal(report.manualTaps, mode === 'active' ? 20 : 10);
    assert.equal(report.final.energy, mode === 'active' ? 12.5 : 2.5);
    assert.equal(report.final.checkpoint, 10000);
    assert.equal(engine.validateState(report.final), true);
  }
});

test('simulation compares deterministic real purchase priorities over thirty minutes', async () => {
  const { simulateScenario } = await import('../scripts/simulate.mjs');
  const a = simulateScenario({ mode: 'active', strategy: 'balanced' });
  const b = simulateScenario({ mode: 'active', strategy: 'upgrades-first' });
  assert.ok(a.purchases?.length > 3);
  assert.ok(a.firstUpgradeSeconds > a.firstAutomationSeconds);
  assert.ok(a.firstVoyageSeconds > 0);
  assert.equal(a.final.voyages, 0, 'main trajectory banks prestige rather than resetting');
  assert.notDeepEqual(a.purchases, b.purchases);
  assert.equal(b.purchases[1].id, 'pulse');
  assert.equal(b.purchases[2].id, 'conductor');
  assert.equal(b.purchases[3].id, 'resonance');
  assert.deepEqual(a, simulateScenario({ mode: 'active', strategy: 'balanced' }));
  assert.equal(engine.validateState(a.final), true);
  assert.equal(engine.validateState(b.final), true);
});

test('report exercises all scenarios, return catch-up, and real post-voyage restart', async () => {
  const simulation = await import('../scripts/simulate.mjs');
  assert.equal(typeof simulation.runSimulations, 'function');
  const report = simulation.runSimulations();
  assert.equal(report.scenarios.length, 4);
  assert.deepEqual(new Set(report.scenarios.map(s => `${s.mode}/${s.strategy}`)),
    new Set(['active/balanced', 'idle/balanced', 'active/upgrades-first', 'idle/upgrades-first']));
  for (const scenario of report.scenarios) {
    assert.equal(scenario.seconds, 1800);
    assert.equal(scenario.returning.idempotent, true);
    assert.equal(scenario.returning.elapsedSeconds, 28800);
    assert.equal(scenario.returning.creditedSeconds, 14400);
    assert.equal(scenario.returning.award, scenario.productionPerSecond * 14400);
    if (scenario.firstVoyageSeconds !== null) {
      assert.ok(scenario.prestige.stardustAward >= 1);
      assert.equal(scenario.prestige.passiveEnergyAfterOneHour, 0);
      assert.ok(scenario.prestige.restartActiveAutomationSeconds <= 5);
      assert.equal(scenario.prestige.checkpointPreserved, true);
      assert.equal(scenario.prestige.lifetimePreserved, true);
    } else assert.equal(scenario.prestige, null);
  }
});

const fresh = (now = 1000) => engine.createState(now);
const freeze = state => {
  Object.freeze(state.producers);
  Object.freeze(state.upgrades);
  return Object.freeze(state);
};

test('initial state has the exact pristine save contract', () => {
  assert.equal(typeof engine.createState, 'function');
  assert.deepEqual(fresh(), {
    energy: 0, runEarned: 0, lifetimeEarned: 0,
    producers: { scout: 0, array: 0, reactor: 0 }, upgrades: [],
    stardust: 0, voyages: 0, checkpoint: 1000,
  });
  assert.notEqual(fresh().producers, fresh().producers);
});
