# Stage C — Proposal-style interface and results handoff

Date: 2026-11-11 (Asia/Seoul)

## Scope of this revision

The implementation changes are limited to:

- `src/ui/screens/welcomeScreen.js`
- `src/ui/screens/simulateScreen.js`
- `src/styles/ui.css`

This report is stored under `src/ui/`. No A, B, shared application, dependency or Git files are changed by this revision.

## Delivered behavior

- The initial screen uses a compact Collapse Lab wordmark, a single-line application title, a live building view and a bottom workflow strip. The proposal informs only the navy/ice-blue/coral palette; its three-line title and slide framing are intentionally replaced with an application entry composition. An explicit Start simulation button enters the existing selection flow.
- Selection, configuration, scenario controls and the observation column use the same restrained palette. Layouts retain independent scrolling and a compact mobile arrangement.
- Scenario sizes continue to come from B's `SCALES`, `formatValue` and `describeScenario`. No range, physical unit or calculation changes are introduced.
- Results display collapse duration, per-floor structural damage and scenario/collision/debris damage shares through the existing results contract.
- The report area has a clear section divider and generation action. B's public report generation and HTML/CSV download APIs remain intact.
- English interface and generated reports are retained, following the language decision in the previous chat.

## Validation

- All 37 existing tests passed, including the UI integration checks for selection/configuration, scenario execution, results, baseline pinning, stale report export invalidation and cleanup.
- Vite production build passed. The existing bundle-size warning remains.
- Headless Edge rendered the actual WebGL start, selection, simulation, report section and 390 x 844 mobile cover. Screenshots were inspected. The browser emitted no page errors during this workflow.
- The browser workflow entered the simulator, pinned a baseline and generated the current-run log report successfully.
- The three report generators produced standalone HTML and CSV files: piloti 3F log analysis, house 1F design comparison and house 1F key-member map.
- Matching-condition design comparison on house 1F showed a 60-minute fire collapse ratio of 39.6% for the current timber/brick design, 0% for the RC alternative and 80.2% for steel/panel. These are outputs of the educational model, not structural safety ratings. The example verifies that changing material settings produces distinct outputs under the same test.

## Earlier changes outside C: audit

The repository's initial clone and current HEAD are `631c088b3279509e7fe5f306009860035d0a1944`. The previous chat changed the following nine B files, and they still match that previous deployment:

- `src/sim/reports/designComparison.js`
- `src/sim/reports/index.js`
- `src/sim/reports/keyMembers.js`
- `src/sim/reports/logAnalysis.js`
- `src/sim/reports/reportHtml.js`
- `src/sim/scenarioScale.js`
- `src/sim/scenarios/explosion.js`
- `src/sim/tests/reports.test.js`
- `src/sim/tests/scenarios.test.js`

The previous deployment also changed `index.html` and added `docs/C_NOTES.md`. Most changes were English presentation strings/styles and associated assertions. The explosion change renamed a self-shadowing local variable from `power` to `impulse` to fix a ReferenceError.

Therefore B is NOT identical to the initial pull/clone. A files remain identical to that baseline. This revision preserves the existing B changes; it neither reverts nor adds to them. Original pre-deployment backups are available outside the repository in `c-ui-original-backup/` in the task workspace. Any rollback should be coordinated with B because removing the explosion fix restores the error.

## Presentation sequence

1. Open the app and choose Start simulation.
2. Select a building and specify floor count and materials. Use five floors or fewer for the demo.
3. Enter the simulator and run a scenario. Earthquake needs no selected target; other scenarios need a member or area.
4. Observe collapse duration, floor damage and damage causes in Response record.
5. Pin a baseline, change the specification and repeat the same scenario parameters.
6. Generate a report and save HTML/CSV, or open the HTML for PDF printing.

## Limits

- Baseline pinning stores result/specification information but does not automatically enforce equal scenario parameters. Use identical manual settings, or the automated design comparison report.
- Actual native download dialogs and final PDF pagination were not verified in this revision. HTML/CSV generation and the report controls were verified.
- An eight-floor apartment collapse is still expensive. The educational model does not implement finite-element analysis, slab bending or seismic torsion.
- No commit, push, fetch or pull was performed. All work is local.
