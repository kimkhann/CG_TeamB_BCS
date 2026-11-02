# Collapse Lab — Building Collapse Simulation

**Computer Graphics Term Project · Team B**

Collapse Lab is an interactive 3D simulation where you design a building and watch how it collapses.
Choose a building type, set the number of floors and the material of each structural part, then apply
an impact, explosion, earthquake or fire — anywhere on the building or anywhere inside it — and observe
how the failure spreads through the structure, piece by piece.

```
① Choose a building type  →  ② Set floors and materials  →  ③ Run collapse scenarios and observe
```

## Team

| Student ID | Name |
|---|---|
| 202234859 | Kim Khann |
| 202234948 | Hur Jihaeng |
| 202431880 | Choi Eunsoo |

## Key Features

- **Building configurator** — four building types (detached house, piloti villa, apartment, L-shaped
  building), adjustable floor count, and per-part materials (columns & beams, walls, slabs, facade)
  chosen from seven presets: reinforced concrete, steel, wood, brick, lightweight panel, standard window,
  glass curtain wall.
- **Part-based structure** — every column, beam, slab panel, wall panel and window is an independent
  object. Loads travel along an explicit path: **slab → beam → column → column below → ground**.
  A part stays up only while more than half of the parts supporting it remain intact, so a single failure
  can cascade realistically through the building.
- **Physics-based collapse** — once a part loses support it becomes a rigid body in the physics engine,
  so falling parts tumble, collide with each other and with the standing structure, and pile up as debris.
  Destroyed parts break into fragments whose count depends on the material.
- **Four collapse scenarios** — impact, explosion, earthquake and fire. Materials differ in weight,
  strength and fire resistance, so the same scenario produces different results for different materials.
- **Flexible targeting** — target a single part by clicking it, or target a **position and radius**
  anywhere inside the building. A section view hides the floors above so you can place an explosion
  inside an intact building.
- **Observation tools** — orbit camera, facade toggle (frame view), section view by floor, pause,
  slow motion (0.25×–2×), reset, keyboard shortcuts, a one-click collapse demo, a live event log,
  a state color legend and a results summary.

## Proposal Feedback & Changes

| Feedback | Change |
|---|---|
| Rendering many 3D objects with pure WebGL is difficult | Rendering moved to **Three.js**, with instanced rendering per material (900+ parts stay smooth) |
| Rule-based collapse is too simple; collisions and interactions are needed | **cannon-es** physics engine added — falling parts collide, interact and pile up |

## Current Progress

| Stage | Scope | Status |
|---|---|---|
| 0. Base | Project setup, data contracts, working end-to-end prototype of every module | O (Nov 1) |
| 1. Building & rendering | Realistic shapes per type, textures, lighting & shadows | Nov 2–3 |
| 2. Simulation & physics | Bending slabs, weight-based crushing, earthquake shaking, fire, performance | Nov 4–5 |
| 3. Interface | UI design, results screen, material comparison | Nov 5–6 |
| 4. Polish | Dust, debris and fire effects, damage shader, bug fixes, demo video | Nov 7–8 |

### Checklist

| Done | Item |
|:---:|---|
| O | Vite + Three.js + cannon-es project setup |
| O | Three-step flow: type selection → configuration → simulation |
| O | Four building types (shared grid-frame generator) with floor and material settings |
| O | Subdivided parts (2×2 slab panels, 2×2 wall panels) and the slab → beam → column load path |
| O | Support-based cascading failure and physics-based falling, collision and settling |
| O | Impact, explosion, earthquake and fire scenarios (simplified versions) |
| O | Part targeting and position + radius targeting with section view |
| O | Facade toggle, column quick-select, collapse demo, event log, legend, results, shortcuts |
| O | Instanced rendering per material |
| | Realistic shapes: gable roof house, open ground-floor piloti, apartment details, L-shaped wing |
| | Material textures, improved lighting and shadows |
| | Slabs that bend before breaking (physics constraints) |
| | Falling weight crushing the floors below |
| | Ground-shaking earthquake, spreading fire, tuned material differences |
| | Physics performance for tall buildings |
| | Polished UI, results screen and side-by-side material comparison |
| | Dust, debris and fire effects, damage shader |

## Tech Stack

| | |
|---|---|
| Rendering | Three.js 0.180 (WebGL) |
| Physics | cannon-es 0.20 |
| Language | JavaScript (ES modules) with JSDoc types |
| Build | Vite 6 |

## Project Structure

```
src/
├─ main.js        Wires all modules together
├─ core/          Data contracts, event bus, state store, fixed-step loop
├─ data/          Building types, materials, material looks & physics, state colors
├─ build/         Building generator — makeBuilding(spec) → parts
├─ render/        Three.js scene, instanced part meshes, effects
├─ sim/           Structural support, physics, scenarios, results
└─ ui/            Screens, picking, camera, playback controls
docs/
└─ CONTRACTS.md   Module interfaces and data formats
```

> This is an educational simplified model. It does not perform real structural analysis and must not be
> used to judge the safety of real buildings.
