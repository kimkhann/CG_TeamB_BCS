# Role B notes — Simulation and physics

Code: `src/sim/` (simulation, scenarios, reports) · `src/data/materialPhysics.js` (material values) · `scripts/` (headless checks)

## B-1. Weight-driven damage (impact damage + piled debris load)

The core response to the proposal feedback ("simple rules → interactions between objects").
Damage depends on **what material falls, how heavy it is, where it hits and from which direction**.

Code: `src/sim/impact.js` (formulas, pure functions) · `src/sim/simulation.js` (physics wiring)

### 1) Impact damage — energy comparison

Computed whenever a falling body **first touches** a standing part (cannon-es `collide` event).

| Step            | Formula                     | Meaning                                                                |
| --------------- | --------------------------- | ---------------------------------------------------------------------- |
| Impact energy   | E = ½ · m · vₙ²             | m: falling mass (t), vₙ: impact speed normal to the contact (m/s) → kJ |
| Absorbed energy | Eₐ = E · (1 − e²)           | e: restitution. e² bounces back, the rest deforms and breaks           |
| Target's share  | Eₜ = 0.5 · Eₐ               | both bodies deform, so each absorbs half                               |
| Energy capacity | U = σ²/(2E) · μ · solid · V | strain energy density (resilience) × ductility × solid ratio × volume  |
| hp loss         | Δhp = Eₜ · f / U            | f: location / direction factor                                         |

Example: an RC slab piece (2 × 0.25 × 2 m, 2.4 t) falling one story (3 m) onto the slab below: vₙ ≈ 7.7 m/s, E ≈ 71 kJ

| Falling slab → hit slab | mid-span            | edge |
| ----------------------- | ------------------- | ---- |
| RC → RC                 | 0.77 (heavy damage) | 0.33 |
| RC → timber             | 1.26 (breaks)       | 0.53 |
| timber → RC             | 0.19                | 0.08 |
| timber → timber         | 0.31                | 0.13 |

### 2) Location / direction factor f

For a simple beam under a point load P at position ξ (0–1), the maximum moment is M = P·L·ξ(1−ξ), largest at mid-span.
It is normalized as b(ξ) = 4ξ(1−ξ). Near supports shear governs instead of bending, so there is a floor value (0.4).

| Member                                    | Hit               | f                                                                  |
| ----------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| Beam                                      | any direction     | 0.4 + 0.6 · b(ξ_length)                                            |
| Slab · roof · wall · window · decor plate | out of plane      | 0.4 + 0.6 · b(ξ₁) · b(ξ₂)                                          |
| 〃                                        | in-plane glancing | 0.4                                                                |
| Column                                    | axial from above  | 0.35 — columns are designed for axial load                         |
| Column                                    | lateral           | 0.5 + 1.0 · b(ξ_height) — weak in bending, up to 1.5 at mid-height |

The contact point and direction are transformed into the part's local frame (inverse quaternion), so tilted gable roof pieces are handled correctly.

### 3) Piled debris load — compared with the design code

| Step             | Formula                                  |
| ---------------- | ---------------------------------------- |
| Dead load        | D = density · g · thickness (kN/m²)      |
| Design live load | L = 2.0 kN/m² (KDS 41 10 15 residential) |
| Collapse load    | q_u = γ · (1.2D + 1.6L), γ = 1.8         |
| Reserve capacity | C = (q_u − D) · plan area (kN)           |
| When overloaded  | Δhp/s = 2 · (W/C − 1)                    |

- Every horizontal member is assumed to be designed for the code load combination (1.2D + 1.6L), with actual collapse at γ times that load (strength reduction factor, material overstrength and margin combined).
- When debris settles (or rests almost still), the parts **directly below it** are recorded; debris on debris passes its weight on through the lower debris.
- Example: the reserve of a 2 × 2 m RC slab ≈ 50 kN (about 5 t), a timber slab ≈ 30 kN (about 3 t). About three upper-floor slab pieces are enough to break even an RC slab.

### Material values and sources

| Material                      | σ (MPa)          | E (GPa) | μ   | solid      | e    | Source                                                                     |
| ----------------------------- | ---------------- | ------- | --- | ---------- | ---- | -------------------------------------------------------------------------- |
| Reinforced concrete           | 24 (compressive) | 25.8    | 4   | 1          | 0.15 | fck 24 MPa (typical Korean residential), Ec = 8500·∛(fck+4) (KDS 14 20 10) |
| Steel                         | 275 (yield)      | 205     | 8   | 0.14       | 0.3  | SS275 (KDS 14 31 10), H-400×400 area ÷ outer box ≈ 0.14                    |
| Timber                        | 24 (bending)     | 11      | 1.5 | 0.6        | 0.4  | structural timber C24 (EN 338), assumed joist-floor solid ratio            |
| Brick masonry                 | 10 (compressive) | 7       | 1   | 1          | 0.15 | Em = 700·f'm (TMS 402 clay masonry)                                        |
| Light panel                   | 1                | 0.3     | 2   | 1          | 0.1  | sandwich panel equivalent — **estimate**                                   |
| Glass (window · curtain wall) | 45 (bending)     | 70      | 1   | 0.1 / 0.15 | 0.5  | float glass characteristic bending strength and modulus (EN 572)           |

- **Ductility μ and restitution e are assumptions chosen from typical literature ranges.** Materials that keep stretching after yield (steel) get large values; brittle ones (glass, masonry) get 1.
- Density, fragment count and fire resistance were calibrated in B-4 (below).

### Results (`scripts/compare-crush.mjs` — destroy every column of an upper floor so the floors above fall)

| Building                                | Material        | Collapsed parts | Lower floors damaged / collapsed | Floors lost |
| --------------------------------------- | --------------- | --------------- | -------------------------------- | ----------- |
| Piloti 5F (4th-floor columns destroyed) | RC              | 93%             | 272 / 283                        | 5           |
|                                         | steel + RC slab | 74%             | 213 / 283                        | 2           |
|                                         | timber          | 45%             | 64 / 283                         | 1           |
| House 3F (3rd-floor columns destroyed)  | RC              | 58%             | 103 / 170                        | 3           |
|                                         | steel + RC slab | 48%             | 78 / 170                         | 1           |
|                                         | timber          | 39%             | 54 / 170                         | 1           |

Heavy RC floors falling cause a **pancake collapse** of the floors below; light timber floors mostly leave the lower floors standing.

### Also changed

- Decor parts (windows, railings, gable end walls, rooftop structures) get static bodies from the start so they can be damaged by impacts
- Settled debris that is lightly woken by a neighbor stays "settled" until it moves faster than 1 m/s (prevents wake ↔ sleep churn); settled debris gets high damping
- Strong impacts (≥ 5 kJ) trigger A's dust effect (`IMPACT kind:'collision'`), at most 8 per second
- `results.js`: failed slabs also count toward "floors lost" (A's handed-over limitation #3)
- Updated A's `optimization.test.js` test 2 for the new wake rule

## B-2. Fixes handed over by A

- Fragment placement and distance checks ignored rotation on tilted parts (gable roofs) → now quaternion-aware (`toWorld` · `toLocal` · `distanceToBox` in `impact.js`)
- The final damage of a fire or earthquake on its last step was not fed into the support check → `updateSupports()` always runs on steps with ongoing effects

## B-3. Glass shatter (performance)

- Glass (`window` · `curtain` materials: windows, curtain wall, balcony glass) **shatters immediately without rigid bodies** (`failed`) when it loses support or its hp reaches 0
- Real glass panes break into small pieces rather than falling as large sheets, so this also looks right, and glass (15–20% of a building's parts) drops out of the physics
- Shattering emits `IMPACT kind:'glass'` (at most 16 per second). A renderer that does not know `glass` falls back to dust

| Benchmark (`npm run bench`) | B-1                             | after B-3 + B-4            |
| --------------------------- | ------------------------------- | -------------------------- |
| Piloti 5F                   | avg 24.7 ms/step · worst 111 ms | **10.0 ms** · worst 75 ms  |
| Apartment 8F                | avg 58.5 ms/step · worst 318 ms | **43.9 ms** · worst 194 ms |

A full apartment 8F collapse is still heavy (the loop guard keeps the screen responsive by slowing playback). Demos are recommended at 5 floors or fewer.

## B-4. Material calibration (real-world references)

Strength values (σ, E, strength) are unchanged; only **density, fragment count and fire resistance** were corrected.

| Material      | Density (t/m³, per box) | Fire resistance | Fragments | Source                                                                                             |
| ------------- | ----------------------- | --------------- | --------- | -------------------------------------------------------------------------------------------------- |
| RC            | 2.4                     | 0.94            | 3         | 24 kN/m³ (KDS 41 10 15), 3 h rating for main structure, chunks held by rebar                       |
| Steel         | 1.6 → **1.1**           | 0.4 → **0.5**   | 2 → **1** | 7.85 × solid ratio 0.14, unprotected steel reaches ~550 °C in ~20 min, bends rather than splitting |
| Timber        | 0.6 → **0.25**          | 0.1 → **0.67**  | 2         | C24 mean 0.42 × 0.6, light timber frame ~30 min (charring 0.65–0.8 mm/min, EN 1995-1-2)            |
| Brick masonry | 1.9                     | 0.8 → **0.92**  | 4         | ~19 kN/m³, 190 mm masonry wall ~2 h, scatters brick by brick                                       |
| Light panel   | 0.3 → **0.1**           | 0.3 → **0**     | 2         | ~20 kg/m² with core ÷ 0.2 m wall, non-rated panel under 10 min                                     |
| Glass         | 0.8 → **0.25 / 0.38**   | 0.3 → **0.17**  | 1         | 2.5 × thickness ratio, ordinary glass breaks within ~12 min in a fire                              |

- **Density = real density × solid ratio**: values are per part box volume, so the empty space in H-sections and joist floors is removed (consistent with `solid` in the impact model)
- **Fire resistance = 1 − 10 min / fire rating**: fire damage ∝ (1 − fireResistance), so the damage rate is inversely proportional to the fire rating

## B-5. Earthquake — the ground really shakes

Code: `src/sim/scenarios/earthquake.js`

### Shaking

- During the quake (8 s: 1 s ramp-up → 4 s peak → 3 s decay) standing parts become **KINEMATIC bodies** and move with the ground
- Offset u(h) = d_g(t) · (1 + 1.5 · h / H) — first-mode sway growing with height; the waveform is a sum of 1.6 Hz and 0.9 Hz sine waves
- The ground plane is also KINEMATIC, so debris on the ground is shaken by friction. A swaying part that starts falling keeps its velocity
- Afterwards standing parts return to their original position as static bodies
- The visible ground offset is 0.12 m at 0.5 g — **larger than reality (a few cm) so it can be seen**. Damage is computed separately from acceleration
- Touching KINEMATIC parts skip collision checks with each other (collision groups), so shaking stays cheap (apartment 8F ≈ 2.5 ms/step)

### Damage — equivalent static method (simplified from KDS 41 17 00)

| Step                  | Formula                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| Ground acceleration   | a_g(t) = PGA · envelope · waveform (PGA from magnitude and distance, B-8)         |
| Building acceleration | S_a = 2.5 · a_g (short-period plateau of the design spectrum)                     |
| Base shear            | V = M · S_a                                                                       |
| Story force           | F_i = V · m_i h_i / Σ m_j h_j (story mass × height)                               |
| Story shear           | V*i = Σ*{j≥i} F_j                                                                 |
| Story capacity        | C_i = Σ τ · A · (member height / story height) · √(2μ − 1) · hp                   |
| hp loss               | Δhp/s = 1.5 · (V_i / C_i − 1) when the story shear ratio exceeds 1                |
| Glass                 | above a story shear ratio of 0.5, story drift breaks that story's glass at random |

- τ: columns use **flexural yield** 2·Mp/h ÷ area (`shearColumn`), walls use **shear strength** (`shearWall`). Walls resist only along their length
- √(2μ − 1): ductility-based force reduction (Newmark–Hall, short period), using the same μ as the impact model
- Capacity drops with hp, so a damaged story fails faster

| Material      | shearColumn (MPa) | shearWall (MPa) | Source                                                                                   |
| ------------- | ----------------- | --------------- | ---------------------------------------------------------------------------------------- |
| RC            | 0.7               | 1.8             | 400 × 400 column Mn ≈ 150 kN·m (fck 24, fy 400) / wall Vc + Vs (KDS 14 20 22, ρh 0.0025) |
| Steel         | 4.6               | 4.6             | H-400×400 SS275 Mp ≈ 1,010 kN·m                                                          |
| Timber        | 0.05              | 0.06            | light timber shear wall 10–15 kN/m — **estimate**                                        |
| Brick masonry | 0.1               | 0.2             | unreinforced masonry bed-joint shear 0.1–0.3 MPa                                         |
| Light panel   | 0.05              | 0.05            | **estimate**                                                                             |

- The **wall-less piloti ground floor has about one third of the story capacity** of the floors above, so its columns break first and the floors above drop (the same pattern as the piloti damage in the 2017 Pohang earthquake)
- Wall-heavy RC apartments (wall-type structures) hold well, unreinforced brick houses collapse badly, and steel frames hold thanks to light panels

## B-6. New result fields

Three fields added to `SimResults` (`results.js`, contract in `docs/CONTRACTS.md` section 4):

- `collapseTime`: seconds from scenario start to the last **structural** collapse, `null` if none
- `floorDamage`: per-floor damage `[{ floor, ratio }]` — average hp loss of the floor's structural parts (collapsed parts count as 1)
- `damageByCause`: `{ scenario, collision, debris }` (sums to 1) — direct scenario damage · falling-part impacts · piled debris weight

## B-7. Review fixes

### Free-standing column towers — lateral bracing check

- Symptom: after an explosion in a 2-story house, **corner columns from floors 1 and 2 stayed standing as 5.5 m towers** with every beam and slab gone
- Cause: the support rule only asked "is it supported from below?", so an upper column stood as long as the column below was alive
- Fix (`isLaterallyStable` in `structure.js`): a **column standing on another column** topples when it loses both its top end (beams/slabs it supports) and its lower joint (beams/slabs the column below supports) — nothing holds it sideways (a column free at both ends has an unbounded buckling length). It is tilted as it detaches so it does not balance on top
- A ground-floor column is fixed to its foundation, so it may stand alone (common at real collapse sites)

### Physics-based impact scenario

- Before: an arbitrary rule removing `0.3 + 0.7 × intensity` hp → impossible to explain as a real impact
- Now: **a 2 t wrecking ball** hits at the chosen speed; damage uses the same energy model as falling parts (B-1)
  - Vertical members are hit from the side, horizontal ones from above, at the middle. Area targets scale the energy by (1 − distance/radius)

## B-8. Scenario sizes in real-world units

The 0–1 intensity slider is replaced by a **real-world value with its own unit and range** per scenario (`sim/scenarioScale.js`, contract in `docs/CONTRACTS.md` section 3).

| Scenario   | Value                             | Range (default)                | How the simulation uses it                                                                                  |
| ---------- | --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Impact     | 2 t wrecking ball speed           | 5–60 km/h (30)                 | impact energy ½mv² → B-1 energy model                                                                       |
| Explosion  | TNT equivalent                    | 0.1–100 kg, log scale (1)      | damage radius R = 7 · W^(1/3) m (~20 kPa overpressure, Kingery–Bulmash), damage factor (R − 2) / 6          |
| Earthquake | magnitude M + epicentral distance | M 1.0–9.0 (6.0), 1–100 km (10) | PGA: log₁₀ PGA = −1.02 + 0.249M − log₁₀ r − 0.00255 r, r = √(d² + 7.3²) (Joyner & Boore, 1981) → B-5 damage |
| Fire       | standard fire (ISO 834) duration  | 5–180 min (30)                 | damage = duration / part fire rating (no strength multiplier)                                               |

- Magnitude alone does not determine shaking (the same magnitude is weaker farther away), so the earthquake also takes the **epicentral distance**
  - e.g. M 6.0 at 10 km → 0.22 g (MMI VII, Korean design earthquake level), M 6.5 at 10 km → 0.30 g, M 7.0 at 30 km → 0.14 g
  - Piloti 5F (default materials): holds at M 6.0 · 10 km, **collapses at M 6.5 · 10 km**
  - The attenuation relation was fitted on M 5.0–7.7; outside that range (especially M ≤ 4) it is extrapolated and may overestimate, which the UI states
- Fire: "a part fails once it burns longer than its fire rating" now holds directly (unprotected steel ~20 min, light timber 30 min, masonry 2 h, RC 3 h)
- Without `value`, the old `intensity` (0–1) is converted, so the floor collapse demo and `compare-*.mjs` scripts still work
- Explosion damage magnitude is still the base-stage rule; only the radius follows the TNT amount

## B-9. Three reports

Choose one in the **보고서 (Reports)** panel at the bottom of the simulation screen, build it and download it. Everything is computed in the browser — no server or database.

| Report                          | What it does                                                                                                                                                                                                                                | Time (5 floors) |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| ① Simulation log analysis       | From the current simulation's event history: timeline, collapse causes (direct vs cascade), cascade ratio, parts that triggered the largest cascades, order of floor collapse, collapse curve and peak rate                                 | instant         |
| ② Design alternative comparison | Current building + automatic alternatives (other material sets, ground-floor walls for a piloti) under the same tests: max magnitude withstood (10 km, binary search), per-floor and per-cause damage at M 6.5, 60-minute ground-floor fire | ~1–2 min        |
| ③ Key member map                | Removes each column and wall of the chosen floor one at a time; grades by progressive collapse (alternate path method, GSA 15%) and seismic contribution; draws the grades on a floor plan                                                  | ~1 min          |

- Output: a self-contained `.html` report (charts and plan included, print → PDF) + raw `.csv` (with a BOM so Korean text opens correctly in Excel)
- Headless: `node scripts/make-report.mjs <log|compare|keymembers> [type] [floors] [floor]`
- Simulation additions: `sim.getHistory()` (event history and 0.5 s samples), `sim.removeParts(ids)`; each `detached` event records the parts that failed just before it as `trigger`
- Report simulations use a fixed seed, so the same conditions give the same result
- The on-screen simulation pauses while a report is computed
- Report text and UI strings stay in Korean (user-facing); code, comments and docs are in English

### What the results show (examples)

- Piloti 5F comparison: current M 6.3 · RC frame M 6.9 · steel + panel ≥ M 9.0 · timber + brick ≤ M 4.0 · ground-floor wall retrofit M 6.4 (small effect because the added walls are brick)
- Apartment 5F, ground floor: 11 middle and edge columns are critical (losing any one spreads slab collapse), corner A1 is caution, walls are rated caution / safe by seismic contribution

## Known limitations (to state as-is in the presentation)

- An educational, simplified model — not a structural analysis (no finite elements or stress distribution)
- Members do not bend or dent; damage accumulates only as hp. Slab bending is future work
- One impact touching several parts is computed per contact
- Earthquake damage is a story-level equivalent static approximation — no time-history analysis or torsion (plan irregularity). Results switch fairly sharply between "holds" and "full collapse" because a lost story drops everything above via the support rule
- Walls carry no vertical load in this model (the frame does), so the key member map rates walls by seismic contribution only
- Falling RC slabs break their surroundings strongly, so in buildings with few bays (like the piloti) every ground-floor column comes out "critical"

## How to verify

```sh
node --test src/build/tests/*.js src/render/tests/*.js src/sim/tests/*.js
node scripts/compare-crush.mjs piloti 5 4
node scripts/compare-quake.mjs piloti 5 1
node scripts/make-report.mjs compare piloti 5
npm run bench -- piloti 5
```
