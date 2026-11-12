# Collapse Lab — Building Collapse Simulation

**Computer Graphics Term Project · Team B**

Collapse Lab is an interactive 3D simulation where you design a building and watch how it collapses.
Choose a building type, set the number of floors and the material of each structural part, then apply
an impact, explosion, earthquake or fire — anywhere on the building or anywhere inside it — and observe
how the failure spreads through the structure, piece by piece. Each run can be exported as an analysis
report.

```
Title screen  →  ① Choose a building type  →  ② Set floors and materials  →  ③ Run scenarios, observe and export reports
```

## Team

| Student ID | Name        |
| ---------- | ----------- |
| 202234859  | Kim Khann   |
| 202234948  | Hur Jihaeng |
| 202431880  | Choi Eunsoo |

## Key Features

- **Building configurator** — four building types (detached house with a gable roof, piloti residence with
  an open ground floor, apartment block with repeated balconies, L-shaped building), adjustable floor count,
  and per-part materials (columns & beams, walls, slabs, facade) from seven presets: reinforced concrete,
  steel, wood, brick, lightweight panel, standard window, glass curtain wall.
- **Part-based structure** — every column, beam, slab panel, wall panel and window is an independent
  object. Loads travel along an explicit path: **slab → beam → column → column below → ground**.
  A part stays up only while more than half of its supporters remain intact, and a stacked column that
  loses all lateral bracing topples, so a single failure can cascade through the building.
- **Physics-based collapse** — a part that loses support becomes a rigid body: it tumbles, collides and
  piles up as debris. **Falling parts damage what they hit** by impact energy (material, weight, hit
  location and direction), and **piled debris overloads the slabs below** against design-code capacity,
  so heavy concrete floors pancake while light timber floors mostly hold. Glass shatters on impact.
- **Four scenarios in real-world units** — impact (2 t wrecking ball, km/h), explosion (TNT kg),
  earthquake (magnitude + epicentral distance → peak ground acceleration and intensity) and fire
  (standard fire duration in minutes). In an earthquake the ground and building really shake, and a
  wall-less piloti ground floor fails first as a soft story.
- **Realistic rendering** — procedural material textures, window frames, environment reflections,
  lighting and shadows, cracks by damage and scorch marks by fire, dust and fire effects, and a street
  setting (roads, trees, cars, background buildings).
- **Observation tools** — orbit camera, facade toggle (frame view), section view by floor, part or
  position + radius targeting, pause, slow motion (0.25×–2×), reset, a one-click collapse demo, a live
  event record and a response record (collapse ratio and duration, damage by floor and by cause) with
  baseline pinning to compare designs.
- **Analysis reports** — generated in the browser with no server or database, exported as HTML (print to
  PDF) and CSV:
  1. **Simulation log analysis** — timeline, direct vs cascade failures, the members that triggered the
     largest cascades, order of floor collapse and the collapse curve.
  2. **Design comparison** — the current design and automatic alternatives under the same tests: the
     largest earthquake magnitude withstood, a reference earthquake and a 60-minute fire.
  3. **Key member map** — removes each column and wall of a chosen level one at a time and marks on the
     floor plan which members must not be removed.

## Proposal Feedback & Changes

| Feedback                                                                  | Change                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rendering many 3D objects with pure WebGL is difficult                    | Rendering moved to **Three.js**, with instanced rendering per material (900+ parts stay smooth)                    |
| Rule-based collapse is too simple; collisions and interactions are needed | **cannon-es** physics engine added — falling parts collide, damage each other by impact energy and pile up as load |

## Progress

| Stage                   | Scope                                                                                     | Status            |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| 0. Base                 | Project setup, data contracts, working end-to-end prototype of every module               | O (Nov 1)         |
| 1. Building & rendering | Realistic shapes per type, textures, lighting & shadows, surroundings                     | O (PR #1)         |
| 2. Simulation & physics | Weight-driven damage, earthquake shaking, real-world scenario units, reports, performance | O (PR #2, Nov 9)  |
| 3. Interface            | Title screen, UI design, results screen, design comparison                                | O (PR #3, Nov 11) |
| 4. Polish               | Final fixes, presentation and demo video                                                  | In progress       |

### Checklist

| Done | Item                                                                                                    |
| :--: | ------------------------------------------------------------------------------------------------------- |
|  O   | Vite + Three.js + cannon-es project setup                                                               |
|  O   | Title screen and three-step flow: type selection → configuration → simulation                           |
|  O   | Four building types with floor and material settings                                                    |
|  O   | Subdivided parts (2×2 slab panels, 2×2 wall panels) and the slab → beam → column load path              |
|  O   | Support-based cascading failure, lateral bracing of stacked columns, physics-based falling and settling |
|  O   | Part targeting and position + radius targeting with section view                                        |
|  O   | Realistic shapes: gable roof house, open ground-floor piloti, apartment balconies, L-shaped wings       |
|  O   | Material textures, lighting and shadows, cracks and scorch marks, dust and fire effects                 |
|  O   | Falling weight crushing the floors below (impact energy + piled debris load)                            |
|  O   | Ground-shaking earthquake with story-shear damage (soft-story piloti)                                   |
|  O   | Material values calibrated to real-world references                                                     |
|  O   | Scenario sizes in real-world units (km/h, TNT kg, magnitude + distance, minutes)                        |
|  O   | Results record: collapse duration, damage by floor and by cause, baseline comparison                    |
|  O   | Analysis reports: log analysis, design comparison, key member map (HTML / CSV / PDF)                    |
|  O   | Physics performance: glass shatter, idle physics skipping (demo at 5 floors or fewer)                   |
|      | Spreading fire (future work)                                                                            |
|      | Slabs that bend before breaking (future work)                                                           |
|      | Glass shard effect and camera shake during earthquakes                                                  |

## Tech Stack

|           |                                          |
| --------- | ---------------------------------------- |
| Rendering | Three.js 0.180 (WebGL)                   |
| Physics   | cannon-es 0.20                           |
| Language  | JavaScript (ES modules) with JSDoc types |
| Build     | Vite 6                                   |

## Project Structure

```
src/
├─ main.js        Wires all modules together
├─ core/          Data contracts, event bus, state store, fixed-step loop
├─ data/          Building types, materials, material looks & physics, state colors
├─ build/         Building generator — makeBuilding(spec) → parts
├─ render/        Three.js scene, instanced part meshes, effects
├─ sim/           Support, physics, impact model, scenarios, results, reports
└─ ui/            Title screen, screens, results panel, picking, camera, playback controls
scripts/          Headless benchmarks, comparisons and report generation
docs/
├─ CONTRACTS.md   Module interfaces and data formats
└─ HANDOFF.md     Stage-by-stage handoff notes
```

> This is an educational simplified model. It does not perform real structural analysis and must not be
> used to judge the safety of real buildings.
