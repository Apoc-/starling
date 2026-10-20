# Starling economy contract and measured pacing

## Reproduce

```sh
node --test tests/engine.test.js
node scripts/simulate.mjs
```

The simulation emits JSON to stdout and does not write files. This document contains the captured report below, so no extra output artifact is needed. All 25 existing tests pass (0 failures); each engine slice and simulation behavior was first observed failing before implementation. No dependencies, test-only income grants, random seeds, or wall-clock timing are used.

## Contract

`src/engine.js` is the authoritative pure ES-module engine. `createState(now)` requires an explicit checkpoint in milliseconds and starts at zero resources, zero producers, no upgrades, zero stardust/voyages. Functions do not mutate input state; nested data may be structurally shared when unchanged. Failed purchases and ineligible voyages return the original state object.

| Producer ID | Name | Base energy cost | Energy/second | Price growth |
|---|---|---:|---:|---:|
| scout | Collector drone | 10 | 0.5 | 1.16 |
| array | Solar array | 80 | 4 | 1.16 |
| reactor | Fusion reactor | 900 | 35 | 1.16 |

- Producer quantity prices sum `ceil(baseCost * growth ** (owned + i))` separately per unit. Invalid quantities, counts above 10000, and quotes exceeding `MAX_VALUE` return `Infinity`; bulk purchases are all-or-nothing.
- `pulse` (Focused pulse, 60 energy) doubles taps; `conductor` (Smart grid, 400) doubles production; `resonance` (Stellar resonance, 2500) doubles production again. Upgrades are one-time purchases per run.
- Tap value: `(pulse ? 2 : 1) * (1 + 0.25 * stardust)`.
- Passive rate: sum of producer base rates times counts, multiplied by conductor, resonance, and `(1 + 0.25 * stardust)`.
- Tapping and advancing credit energy, runEarned, and lifetimeEarned independently, saturating each at `MAX_VALUE = 1e15`. Spending reduces energy only. JavaScript Number arithmetic is used; fractional precision decreases near the bound. Derived production can exceed the resource bound; credited resources cannot.
- `advance(state, now)` integrates constant current production over elapsed milliseconds with `OFFLINE_CAP_MS = 14400000` (four hours), at full efficiency. It moves the checkpoint to the complete supplied timestamp, discarding excess capped time so it cannot be claimed later. Equal/backwards timestamps do nothing and never reduce the checkpoint; invalid/nonfinite/out-of-bound timestamps do nothing. Call advance before a purchase or voyage if time must be settled at the old rate.
- Voyage preview: `floor(sqrt(runEarned / 10000))`. Zero is ineligible; otherwise launch resets energy, runEarned, producers, and upgrades; preserves checkpoint and lifetimeEarned; adds preview stardust and one voyage, saturating persistent counters at `1e15`.
- `validateState` requires exactly the eight state keys, finite numeric resource/checkpoint values in `[0, 1e15]`, stardust/voyages as integers in that range, exactly the three producer keys with integer counts in `[0, 10000]`, and a dense duplicate-free array of known upgrade IDs. It does not impose relationships between earning counters; schema validity is not proof of legitimate play. Save envelopes/metadata belong outside this exact state object. Purchases defensively reject malformed states; callers must validate imported state before other engine operations.

## Simulation assumptions

Every trajectory starts from `createState(0)` and runs 1800 one-second ticks. Each tick advances actual engine production, performs manual taps, and buys using the actual engine. Active play taps twice each second. Idle play taps twice per second only for the first five seconds (ten taps total), buying its first drone without a currency grant, then continues automatic purchase decisions without further tapping. Here "idle" means zero manual income after seeding, not a closed browser that somehow buys things.

Balanced policy reserves for the item with the lowest price per marginal energy/second; active tap income counts toward pulse value. Ties retain catalog order. It can deliberately wait instead of buying a currently affordable, less efficient item. The alternative buys its first drone, reserves for pulse, conductor, and resonance in that order, then uses balanced purchases. Neither policy is an optimal-play oracle.

The main 30-minute trajectory banks prestige without resetting. First voyage below means **first eligibility**, not an automatically launched voyage. A separate branch replays to that exact checkpoint, launches via the engine, verifies reset invariants, then measures tapping-based restart. Another independent branch leaves each 30-minute save away for eight hours, applies four hours of catch-up, and repeats the same checkpoint to check idempotency. No background purchases occur during that return branch.

## Measured results

All milestone times are seconds from initial creation; "Not reached" means not reached within the 1800-second horizon.

| Mode | Buying policy | First automation | First upgrade | First voyage eligibility | Final energy/second |
|---|---|---:|---:|---:|---:|
| active | balanced | 5 | 144 | 181 | 7918 |
| active | upgrades-first | 5 | 29 | 676 | 7460 |
| idle | balanced | 5 | 297 | 335 | 7778 |
| idle | upgrades-first | 5 | 125 | Not reached | 1 |

### Target assessment and concerns

- Assumed first automation target: 5–10 seconds. All four scenarios reach it at 5 seconds.
- Assumed new-upgrade target: under 120 seconds. Only active/upgrades-first meets it (29 seconds). Balanced active takes 144 seconds; balanced idle 297; upgrades-first idle 125. The contract is unchanged; these are reported misses, not tuned away.
- Assumed first-voyage target: 300–900 seconds. Active balanced reaches eligibility too early (181 seconds); active upgrades-first (676) and idle balanced (335) meet it; idle upgrades-first does not reach it within 30 minutes.
- Prioritizing upgrades can be costly: idle upgrades-first spends on a tap upgrade after manual tapping has stopped and then waits with one drone; its 30-minute passive rate is only 1 energy/second. Balanced policy skips pulse entirely for idle play.
- Prestige resets every producer. In all eligible branches, one hour of completely hands-off play after launch earns **zero** energy. Restart needs interaction: two taps/second restore a drone in 4 seconds with the first stardust. The UI should explain this reset consequence.
- All four eight-hour returns credited exactly four hours of production and repeated catch-up credited nothing again. This verifies same-save checkpoint behavior, not cross-tab conflict resolution or resistance to deliberate clock/save manipulation.
- This headless simulation verifies the contract and pacing only. UI/browser usability, fun, save transactions, multi-tab coordination, and service-worker behavior belong to parent integration and are not claimed here.

## Captured simulation JSON

```json
{
  "model": "Starling actual engine, deterministic one-second ticks",
  "assumptions": {
    "horizonSeconds": 1800,
    "activeTapsPerSecond": 2,
    "idleSeedTaps": 10,
    "tickOrder": "advance, tap, purchase",
    "prestigePolicy": "bank until horizon; branch at first eligibility",
    "balanced": "save for lowest cost per marginal energy/second, including active tap income",
    "alternative": "first drone, then reserve for pulse, conductor, resonance, then balanced",
    "random": false
  },
  "scenarios": [
    {
      "mode": "active",
      "strategy": "balanced",
      "seconds": 1800,
      "manualTaps": 3600,
      "firstAutomationSeconds": 5,
      "firstUpgradeSeconds": 144,
      "firstVoyageSeconds": 181,
      "final": {
        "energy": 126888,
        "runEarned": 10611579,
        "lifetimeEarned": 10611579,
        "producers": {
          "scout": 51,
          "array": 51,
          "reactor": 50
        },
        "upgrades": [
          "conductor",
          "resonance",
          "pulse"
        ],
        "stardust": 0,
        "voyages": 0,
        "checkpoint": 1800000
      },
      "productionPerSecond": 7918,
      "purchaseCount": 155,
      "firstTierSeconds": {
        "scout": 5,
        "array": 37,
        "reactor": 135
      },
      "upgradeSeconds": {
        "pulse": 197,
        "conductor": 144,
        "resonance": 171
      },
      "returning": {
        "elapsedSeconds": 28800,
        "creditedSeconds": 14400,
        "award": 114019200,
        "idempotent": true
      },
      "prestige": {
        "stardustAward": 1,
        "checkpointPreserved": true,
        "lifetimePreserved": true,
        "passiveEnergyAfterOneHour": 0,
        "restartActiveAutomationSeconds": 4
      }
    },
    {
      "mode": "active",
      "strategy": "upgrades-first",
      "seconds": 1800,
      "manualTaps": 3600,
      "firstAutomationSeconds": 5,
      "firstUpgradeSeconds": 29,
      "firstVoyageSeconds": 676,
      "final": {
        "energy": 9777.5,
        "runEarned": 6825066.5,
        "lifetimeEarned": 6825066.5,
        "producers": {
          "scout": 48,
          "array": 49,
          "reactor": 47
        },
        "upgrades": [
          "pulse",
          "conductor",
          "resonance"
        ],
        "stardust": 0,
        "voyages": 0,
        "checkpoint": 1800000
      },
      "productionPerSecond": 7460,
      "purchaseCount": 147,
      "firstTierSeconds": {
        "scout": 5,
        "array": 632,
        "reactor": 660
      },
      "upgradeSeconds": {
        "pulse": 29,
        "conductor": 118,
        "resonance": 618
      },
      "returning": {
        "elapsedSeconds": 28800,
        "creditedSeconds": 14400,
        "award": 107424000,
        "idempotent": true
      },
      "prestige": {
        "stardustAward": 1,
        "checkpointPreserved": true,
        "lifetimePreserved": true,
        "passiveEnergyAfterOneHour": 0,
        "restartActiveAutomationSeconds": 4
      }
    },
    {
      "mode": "idle",
      "strategy": "balanced",
      "seconds": 1800,
      "manualTaps": 10,
      "firstAutomationSeconds": 5,
      "firstUpgradeSeconds": 297,
      "firstVoyageSeconds": 335,
      "final": {
        "energy": 214646.5,
        "runEarned": 9403041.5,
        "lifetimeEarned": 9403041.5,
        "producers": {
          "scout": 51,
          "array": 51,
          "reactor": 49
        },
        "upgrades": [
          "conductor",
          "resonance"
        ],
        "stardust": 0,
        "voyages": 0,
        "checkpoint": 1800000
      },
      "productionPerSecond": 7778,
      "purchaseCount": 153,
      "firstTierSeconds": {
        "scout": 5,
        "array": 165,
        "reactor": 288
      },
      "upgradeSeconds": {
        "pulse": null,
        "conductor": 297,
        "resonance": 325
      },
      "returning": {
        "elapsedSeconds": 28800,
        "creditedSeconds": 14400,
        "award": 112003200,
        "idempotent": true
      },
      "prestige": {
        "stardustAward": 1,
        "checkpointPreserved": true,
        "lifetimePreserved": true,
        "passiveEnergyAfterOneHour": 0,
        "restartActiveAutomationSeconds": 4
      }
    },
    {
      "mode": "idle",
      "strategy": "upgrades-first",
      "seconds": 1800,
      "manualTaps": 10,
      "firstAutomationSeconds": 5,
      "firstUpgradeSeconds": 125,
      "firstVoyageSeconds": null,
      "final": {
        "energy": 875,
        "runEarned": 1345,
        "lifetimeEarned": 1345,
        "producers": {
          "scout": 1,
          "array": 0,
          "reactor": 0
        },
        "upgrades": [
          "pulse",
          "conductor"
        ],
        "stardust": 0,
        "voyages": 0,
        "checkpoint": 1800000
      },
      "productionPerSecond": 1,
      "purchaseCount": 3,
      "firstTierSeconds": {
        "scout": 5,
        "array": null,
        "reactor": null
      },
      "upgradeSeconds": {
        "pulse": 125,
        "conductor": 925,
        "resonance": null
      },
      "returning": {
        "elapsedSeconds": 28800,
        "creditedSeconds": 14400,
        "award": 14400,
        "idempotent": true
      },
      "prestige": null
    }
  ]
}
```
