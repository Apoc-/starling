# Verification record

## Executed

- `npm run check`: PASS. 43 engine/storage unit tests and 15 Chromium browser tests, zero failures or skips; production build succeeds.
- `npm run simulate`: PASS. Four deterministic actual-engine trajectories (active/idle × balanced/upgrades-first), plus return/prestige branches. Detailed results and pacing misses are preserved in ECONOMY.md; raw JSON is generated as `artifacts/economy.json` during verification.
- Browser: Chromium 145.0.7632.6, headless Linux, isolated per-test storage, actual production-like origin `http://localhost:4173/starling/`.
- Static production shell: 11 files, 54,072 bytes. No remote scripts, fonts, or production package dependencies.
- Final source shell digest: `1a5d210bd269303a` (after independently reviewed safety remediation). The build hashes source assets to produce the cache identity.
- Independent review: PASS after remediation. Initial review found one high-impact update race; the reviewed fix and two new regressions address it and the unsupported-lock startup write. No remaining security concerns or logic errors were reported. Final reviewer suggested additional delayed-activation/failure-path tests; the fix agent exercised those paths with standalone browser probes.
- Source scan: no literal credentials, shell-injection patterns, eval/exec, or unsafe deserialization found in staged additions.

## Browser checks passed

- Normal opening through real controls: ten taps, exact first-drone affordability, buy, owned count, passive rate, committed save, reload persistence.
- Manifest start URL/scope and all declared icon URLs load under the repository subpath.
- Actual worker activation/control followed by offline reload, offline gameplay, and closing/reopening the page offline in the same browser context.
- Missing asset is not replaced with app HTML.
- Backup export and confirmed import round-trip; cancel import preserves the current station.
- Malformed, oversized, future-schema, negative-value, and script-bearing imports are rejected without replacing progress or executing content.
- Tap upgrade, production upgrade, and solar-array interaction; authoritative exported state used for exact resource checks.
- Voyage preview, cancel, confirm, exact resource/reset invariants, permanent bonus, and reload persistence.
- Two tabs: second tab is read-only; active tab's newer balance survives ownership handoff by closing/reloading.
- Unavailable IndexedDB: visibly temporary but playable/exportable session, no false saved message.
- Quota failure at the write boundary: previous commit retained, current in-memory progress exportable, explicit unsaved warning.
- A future on-device schema remains untouched and blocks destructive gameplay writes.
- Real persisted returning fixture with fixed browser time: eight hours away credits four hours, repeated reload does not credit again, backwards clock preserves checkpoint and balance.
- No horizontal overflow at 320×568, 844×390, or 1440×1000; keyboard Enter activates the focused core action; reduced-motion preference exercised.
- Real local version A→B update: B installed and waited while A remained usable; accepting saved the known four-energy station, reloaded the old second tab, preserved the save, and then reloaded B offline.
- An actual failed pre-update save prevents worker activation.
- Independent review found and reproduced a spectator-tab update bypass; regression now verifies a read-only tab cannot activate an update while the writer has exportable unsaved progress.
- Unsupported Web Locks mode makes no initial or subsequent save writes; the temporary session remains playable/exportable.

## Unit boundaries passed

- Exact affordability, insufficient-funds/no-op, per-unit rounding, bulk/sequential purchase equivalence, all multipliers, finite resource saturation, malformed producer/state inputs.
- Clock equality/backwards/nonfinite anomalies, cap boundary, repeated catch-up, prestige preview/reset/persistence invariants.
- IDB atomic current/backup rotation, two-handle revision race, invalid/future/corrupt preservation, closed/blocked/denied connections, revision exhaustion, aborted/write/quota rollback, portable bounded JSON.

Storage failure/abort unit tests use fake-indexeddb. Browser quota/denial tests inject failures at the actual page's persistence boundary; they do not reproduce physical low-storage conditions or OS process termination.

## Visual evidence inspected

Actual captured screenshots were visually inspected for layout and clipping:
- `artifacts/mobile-opening.png` (390px portrait, full page).
- `artifacts/desktop.png` (1440px desktop).
- `artifacts/real-time-opening.png` (fresh 120-second emulated-touch session).
- Additional captures: `artifacts/mobile-midgame.png`, `artifacts/update-B-offline.png`.

No obvious clipping/overlap in inspected layouts; the fixed mobile navigation deliberately overlays the viewport bottom, with footer clearance for scrolling. No formal accessibility conformance audit or real-device performance claim is made.

## Not exercised / limitations

- Physical Android/iOS installation, Safari/WebKit/Firefox gameplay, standalone OS relaunch/eviction, low-storage device behavior, screen-reader usability: NOT EXERCISED; no such devices/browsers were available.
- Migration: NOT APPLICABLE to this initial v1 schema; future versions are deliberately rejected, not silently downgraded.
- Browser-user storage deletion recovery: only exported portable backups can recover it; no cloud sync.
- Full first-minutes real-time opening: PASS via `node scripts/play-opening.mjs`, using fresh storage and actual emulated touch controls (no imported progress or clock acceleration). Over 120.087 seconds: 199 taps; first drone at 5.574s, tap upgrade at 33.795s, solar array at 54.919s, production upgrade at 106.385s. Final rate 9 energy/sec, saved on device, zero page errors. Later pacing remains simulation-based, and midgame fixtures are explicitly imported test saves. No retention/fun claim.
- Pacing is proof-of-concept quality: upgrade-first idle choices can stall; efficient active play reaches first-voyage eligibility earlier than the original assumption.
- Old app-shell cache pruning is deferred. Caches are retained to avoid deleting assets needed by old clients.
## GitHub Pages release

- Live HTTPS app: https://apoc-.github.io/starling/
- Public source: https://github.com/Apoc-/starling
- GitHub Actions build/deploy: PASS, https://github.com/Apoc-/starling/actions/runs/39399721113, deploying game revision `cc98f51dbe7bbdb4c9cf5570ffcfa460ba1512a1`.
- `TEST_URL=https://apoc-.github.io/starling/ npm run test:e2e`: PASS, 12 browser tests; three local deployment-mutation tests deliberately skipped against the public site. Those same three passed locally as part of the 15-test production-build suite.
- Live tests cover real HTTPS worker control and offline reload/reopen/gameplay, touch input, buying/persistence, upgrades/voyages/backups, save failures, clock catch-up, multiple tabs, and responsive layouts.
- Pages configuration read back: workflow build, public site, HTTPS enforced.
- Earlier publishing blockage was a configuration lookup error, not missing credentials: the shell's HOME differed from the location of existing GitHub CLI configuration. Existing authorization was used; no additional user login was needed.

Physical-device installation and non-Chromium gaps listed above remain unverified.
