# Starling

A small mobile-first incremental PWA: collect energy, build an orbital fleet, research upgrades, and launch voyages for permanent stardust bonuses. No accounts, ads, analytics, backend, or production dependencies.

**Play:** https://apoc-.github.io/starling/

**Source:** https://github.com/Apoc-/starling

## Run

Requires Node.js 22+ and npm.

```sh
npm ci
npm test
npm run build
npm run preview
```

Open http://localhost:4173/starling/. This deliberate project subpath exercises GitHub Pages URL handling.

```sh
npx playwright install chromium
npm run test:e2e
npm run simulate
```

Set `AGENT_BROWSER_EXECUTABLE_PATH` to use an existing Chromium executable. `npm run check` runs unit tests, builds the app, and runs browser tests. The update tests temporarily modify `dist/`, restore it afterward, and run serially. `TEST_URL=https://YOUR-USER.github.io/starling/ npm run test:e2e` targets a deployed release; local A→B mutation tests are skipped there. All browser tests use isolated storage, never real player saves.

## Play

- Tap the star to collect energy; ten taps buy the first collector drone.
- Drones, arrays, and reactors generate energy automatically. Costs grow with each purchase.
- Focused pulse doubles tapping. Smart grid and Stellar resonance each double fleet output.
- At 10,000 **earned** energy in a voyage, launch again for stardust. Each stardust adds 25% to taps and fleet production. Preview the reset and confirm, or cancel.
- A voyage resets the fleet, so tap again to start automation. Lifetime energy and stardust survive.
- Read [ECONOMY.md](ECONOMY.md) for authoritative formulas, actual simulation assumptions/results, and known pacing limitations. This is a small proof of concept, not a claim of long-term game balance.

## Offline and saves

Visit once online to download the shell. After installation/caching, the complete game runs offline. The fleet earns at full rate for up to four hours away; catch-up is computed on return, not by a running background process. The first-ever visit requires a connection.

Progress is a validated version-one envelope in IndexedDB, separate from asset caches. State and checkpoint commit atomically; every successful write retains the previous committed save. Saves occur after actions and every five seconds while visible; OS termination can still lose unsaved foreground seconds. Export/import backups through the flight manual. Imports require confirmation, are bounded to 100 KB, and do not earn catch-up for their old timestamp. No version migrations exist yet: future/corrupt saves are rejected without overwrite.

A Web Lock allows only one writer tab; other tabs are read-only. Transactional revision checks provide a second protection. Unsupported locking or unavailable storage produces a visibly temporary session; export before leaving. Browser-data deletion, device loss, or eviction can erase local progress. No cloud sync or clock-tamper protection is promised.

The worker caches an atomic, content-digested shell. Updates wait for explicit acceptance, save before activation, and reload open controlled tabs. Old shell caches are intentionally retained for version-skew safety; the browser may reclaim them. This POC does not implement a long-term cache-pruning policy. A failed save prevents update activation.

## Install

- Android/Chromium: use the offered install button when available, or browser menu → Install app / Add to Home screen.
- iPhone/iPad: open in Safari → Share → Add to Home Screen.
- The manifest is scoped to the current repository path, with standalone mode and real 192/512px and maskable icons.

Actual installation on physical iOS/Android devices remains untested. Chromium responsive/offline tests are not device-installation proof.

## Publish on GitHub Pages

The repository name can be `starling` (all application asset URLs are relative). Publication requires an authenticated GitHub account with permission to create a public repository and push workflow files.

```sh
gh auth login
# Run from this project after committing the source:
gh repo create starling --public --source . --remote origin --push
# Use the actual OWNER/repository returned by GitHub:
gh api --method POST repos/OWNER/starling/pages -f build_type=workflow
```

Alternatively select **Settings → Pages → Source → GitHub Actions**. The included `.github/workflows/pages.yml` runs unit tests, a production build, and browser tests before uploading and deploying the `dist/` artifact. Read the workflow result and verify the actual Pages URL before considering a release published. Pushes to `main` redeploy it. Do not publish `node_modules`, local save files, or test artifacts.

## Implementation

- `src/engine.js`: pure deterministic economy and time rules.
- `src/storage.js`: transactional IndexedDB saves and bounded portable JSON.
- `src/app.js`: semantic DOM interface, lifecycle, single-writer coordination.
- `sw.js`: scoped offline shell and opt-in updates.
- `scripts/build.mjs`: dependency-free static build with a content-digested worker.
- `tests/`: engine/storage tests and full browser journeys.

See [VERIFICATION.md](VERIFICATION.md) for actual execution evidence and remaining boundaries.
