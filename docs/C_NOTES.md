# Stage C / Local UI handoff

## Delivered

- Title screen with project identity and an explicit entry button. `?screen=select`, `configure` and `simulate` still bypass it for development.
- Four building selection cards, a material schedule, and an architectural notebook visual style. The live Three.js model remains visible during setup.
- Separate observation column: collapse ratio, elapsed time, collapse duration, members/floors lost, first structural failure, per-floor damage and all three damage causes.
- Session-only baseline pinning. Pin a result, edit the specification, then repeat the same scenario and compare the percentage-point change. The baseline clears on reload.
- English UI, scenario explanations, report findings, chart labels, CSV headers and generated member labels. The builder's Korean labels are translated at presentation boundaries; its data is unchanged.
- English printable report styling, A4 print margins and repeated table headers. HTML/CSV remain standalone, local downloads.
- Responsive layout and camera fitting, keyboard focus styling, and reduced-motion support for automatic orbit.
- Reset cancels queued demonstration timers and clears pending grouped log entries. Changing report type/floor invalidates stale exports; report settings are locked during analysis. A report finishing after navigation no longer changes the new screen's playback state.

## Scope

C owns `src/ui/` and `src/styles/ui.css`. English output additionally requires presentation-only changes in `src/sim/scenarioScale.js`, the five report presentation modules, `index.html`, and corresponding text assertions in the two B test files. Full scenario validation also exposed an existing `ReferenceError` in `src/sim/scenarios/explosion.js`: a local `power` variable shadowed the blast factor in its own initializer. That local variable is now `impulse`, preserving the formula. A regression test exercises the falling-member impulse path. No physics formula, simulation parameters, shared store contract, builder, renderer, dependencies or Git metadata was changed.

The English dictionary is `src/ui/english.js`; reports use the same dictionary. New result UI reads the existing public `SimResults` contract. There is no new store screen or event.

## Verification

```sh
npm run build
node --test
node scripts/make-report.mjs log piloti 3 1
node scripts/make-report.mjs compare house 1 1
node scripts/make-report.mjs keymembers house 1 1
```

- Existing 34 tests plus two DOM-fixture integration tests and one explosion regression test pass (37 total).
- DOM tests cover title entry, all building types, configuration changes, target/run wiring, result fields, baseline pin/clear, report generation, stale download invalidation and result-panel cleanup.
- Actual headless generation checked for all three report types, including English HTML and CSV output.
- All four scenarios ran on all four building types (16 runs); their log HTML/CSV output has no Korean text, `NaN`, or `undefined`. Floor result counts and normalized damage-cause shares were checked.
- Production build passes; Vite retains its existing large-bundle warning.
- **Visual browser QA is still outstanding.** The local browser connection and native app-control permission were unavailable during this session. DOM tests verify behavior, not rendering, WebGL appearance, responsive screenshots, real browser downloads or print pagination.

## Presentation sequence

1. Open the app and choose **Enter the lab**.
2. Choose **Piloti residence**, use at most five floors, and open the experiment.
3. Choose **Earthquake**, set the desired magnitude and epicentral distance, then run. No target is needed.
4. Watch **Response record** and the damage bars. Pin the baseline after motion settles.
5. Edit the materials, repeat the exact same scenario, and compare the response.
6. Generate **Simulation log analysis**. Download HTML/CSV or use **Open / Print PDF**.

The reports retain their educational-model limitations. A full eight-floor apartment collapse remains expensive; this C change does not alter the physics model or its performance limits. UI baseline comparison does not automatically enforce identical scenario parameters; use the design comparison report for automated matching tests.

## Local-only delivery

No GitHub access, fetch, pull, commit or push was performed. Original changed files are backed up outside the repository in the task workspace before copying the finished changes to the user's project.
