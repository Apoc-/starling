import {
  PRODUCERS, UPGRADES, createState, advance, tap, tapValue, production,
  producerCost, buyProducer, buyUpgrade, previewVoyage, launchVoyage,
} from '../src/engine.js';

function choosePurchase(state, mode, strategy) {
  const producers = PRODUCERS.map(item => ({
    type: 'producer', id: item.id, cost: producerCost(state, item.id),
    gain: production({ ...state, producers: { ...state.producers, [item.id]: state.producers[item.id] + 1 } }) - production(state),
  }));
  const upgrades = UPGRADES.filter(item => !state.upgrades.includes(item.id)).map(item => ({
    type: 'upgrade', id: item.id, cost: item.cost,
    gain: item.id === 'pulse' ? (mode === 'active' ? 2 * tapValue(state) : 0) : production(state),
  }));
  if (production(state) === 0) return producers[0];
  if (strategy === 'upgrades-first' && upgrades.length) return upgrades[0];
  return [...producers, ...upgrades].filter(item => item.gain > 0 && Number.isFinite(item.cost))
    .sort((a, b) => a.cost / a.gain - b.cost / b.gain)[0];
}

export function simulateScenario({ mode = 'active', strategy = 'balanced', seconds = 1800 } = {}) {
  let state = createState(0);
  let manualTaps = 0;
  let firstAutomationSeconds = null;
  let firstUpgradeSeconds = null;
  let firstVoyageSeconds = null;
  const purchases = [];
  for (let second = 1; second <= seconds; second++) {
    state = advance(state, second * 1000);
    if (mode === 'active' || manualTaps < 10) {
      state = tap(tap(state));
      manualTaps += 2;
    }
    while (true) {
      const target = choosePurchase(state, mode, strategy);
      if (!target || target.cost > state.energy) break;
      state = target.type === 'producer' ? buyProducer(state, target.id) : buyUpgrade(state, target.id);
      purchases.push({ second, type: target.type, id: target.id, cost: target.cost });
      if (target.type === 'producer') firstAutomationSeconds ??= second;
      else firstUpgradeSeconds ??= second;
    }
    if (previewVoyage(state) > 0) firstVoyageSeconds ??= second;
  }
  return { mode, strategy, seconds, manualTaps, firstAutomationSeconds,
    firstUpgradeSeconds, firstVoyageSeconds, purchases, final: state };
}

export function runSimulations() {
  const scenarios = [];
  for (const mode of ['active', 'idle']) {
    for (const strategy of ['balanced', 'upgrades-first']) {
      const result = simulateScenario({ mode, strategy });
      const { purchases, ...summary } = result;
      const returned = advance(result.final, result.final.checkpoint + 28800000);
      const repeated = advance(returned, returned.checkpoint);
      let prestige = null;
      if (result.firstVoyageSeconds !== null) {
        const eligible = simulateScenario({ mode, strategy, seconds: result.firstVoyageSeconds }).final;
        const reset = launchVoyage(eligible);
        let restart = reset;
        let restartActiveAutomationSeconds = null;
        for (let second = 1; second <= 60; second++) {
          restart = tap(tap(advance(restart, reset.checkpoint + second * 1000)));
          const bought = buyProducer(restart, 'scout');
          if (bought !== restart) {
            restartActiveAutomationSeconds = second;
            break;
          }
        }
        prestige = {
          stardustAward: reset.stardust - eligible.stardust,
          checkpointPreserved: reset.checkpoint === eligible.checkpoint,
          lifetimePreserved: reset.lifetimeEarned === eligible.lifetimeEarned,
          passiveEnergyAfterOneHour: advance(reset, reset.checkpoint + 3600000).energy,
          restartActiveAutomationSeconds,
        };
      }
      scenarios.push({ ...summary, productionPerSecond: production(result.final),
        purchaseCount: purchases.length,
        firstTierSeconds: Object.fromEntries(PRODUCERS.map(item => [item.id,
          purchases.find(purchase => purchase.id === item.id)?.second ?? null])),
        upgradeSeconds: Object.fromEntries(UPGRADES.map(item => [item.id,
          purchases.find(purchase => purchase.id === item.id)?.second ?? null])),
        returning: { elapsedSeconds: 28800, creditedSeconds: 14400,
          award: returned.energy - result.final.energy,
          idempotent: JSON.stringify(repeated) === JSON.stringify(returned) }, prestige,
      });
    }
  }
  return { model: 'Starling actual engine, deterministic one-second ticks',
    assumptions: { horizonSeconds: 1800, activeTapsPerSecond: 2, idleSeedTaps: 10,
      tickOrder: 'advance, tap, purchase', prestigePolicy: 'bank until horizon; branch at first eligibility',
      balanced: 'save for lowest cost per marginal energy/second, including active tap income',
      alternative: 'first drone, then reserve for pulse, conductor, resonance, then balanced',
      random: false }, scenarios };
}

// No file writes: stdout can be redirected by the caller.
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  console.log(JSON.stringify(runSimulations(), null, 2));
}
