/**
 * [B · Simulation] Physical properties per material
 *
 * Keys must match the material ids in data/ids.js.
 *
 * ── Relative values for scenarios (since the base stage) ───────────
 * density        density (t/m³, per part box volume) — part mass = density × volume
 * strength       strength multiplier — explosion damage is divided by this
 * fireResistance fire resistance (0–1) — higher survives fire longer
 * fragments      number of fragments when the part fails
 * friction       friction coefficient
 *
 * ── Measured values for the impact / debris / earthquake models (sim/impact.js) ──
 * sigma        strength σ (MPa)    — concrete/masonry: compressive, steel: yield, timber/glass: bending
 * modulus      elastic modulus E (GPa)
 * ductility    ductility μ         — energy absorbed after the elastic limit until failure (assumed)
 * solid        solid ratio         — share of the part box filled with material (H-section, timber joists, glass thickness)
 * shearColumn  story shear one column resists ÷ the column box's plan area (MPa) — flexural yield 2·Mp / h
 * shearWall    equivalent wall shear strength (MPa, per wall box plan area) — story shear capacity (sim/scenarios/earthquake.js)
 * restitution  restitution e       — e² of the impact energy bounces back, the rest is absorbed
 *
 * ── Real-world calibration (B-4) ─────────────────────────────────
 * density        = real material density × solid (per box volume, so multiply by the filled share)
 * fireResistance = 1 − 10 min / fire rating  → fire damage rate is inversely proportional to the rating (0 at ≤ 10 min)
 * fragments      = failure mode: steel bends rather than splitting (1), masonry scatters brick by brick (4)
 * strength values (strength, sigma, ...) are unchanged
 *
 * Sources: the "Material values" table in src/sim/B_NOTES.md.
 */

export const materialPhysics = {
  // Concrete fck 24 MPa, Ec = 8500·∛(fck+4) ≈ 25.8 GPa (KDS 14 20 10), μ = 4 with rebar
  // density 24 kN/m³ (KDS 41 10 15) · 3 h fire rating (main structure with cover) · breaks into chunks held by rebar (3)
  rc: {
    density: 2.4,
    strength: 1.0,
    fireResistance: 0.94,
    fragments: 3,
    friction: 0.6,
    sigma: 24,
    modulus: 25.8,
    ductility: 4,
    solid: 1,
    shearColumn: 0.7,
    shearWall: 1.8,
    restitution: 0.15,
  },
  // SS275 fy 275 MPa, E 205 GPa (KDS 14 31 10), ductility μ = 8, H-400×400 area / outer box ≈ 0.14
  // density 7.85 × 0.14 ≈ 1.1 · unprotected steel reaches the critical temperature (~550 °C) in ~20 min · bends, does not split (1)
  steel: {
    density: 1.1,
    strength: 1.4,
    fireResistance: 0.5,
    fragments: 1,
    friction: 0.4,
    sigma: 275,
    modulus: 205,
    ductility: 8,
    solid: 0.14,
    shearColumn: 4.6,
    shearWall: 4.6,
    restitution: 0.3,
  },
  // Structural timber C24: bending 24 MPa, E 11 GPa (EN 338), nearly brittle μ = 1.5, joist floor solid ratio 0.6
  // density C24 mean 0.42 × 0.6 ≈ 0.25 · light timber frame ~30 min (charring 0.65–0.8 mm/min, EN 1995-1-2) · splits at joints (2)
  wood: {
    density: 0.25,
    strength: 0.5,
    fireResistance: 0.67,
    fragments: 2,
    friction: 0.7,
    sigma: 24,
    modulus: 11,
    ductility: 1.5,
    solid: 0.6,
    shearColumn: 0.05,
    shearWall: 0.06,
    restitution: 0.4,
  },
  // Clay brick masonry: f'm 10 MPa, Em = 700·f'm = 7 GPa (TMS 402), brittle μ = 1
  // density ~19 kN/m³ · 190 mm masonry wall ~2 h · scatters brick by brick (4)
  brick: {
    density: 1.9,
    strength: 0.6,
    fireResistance: 0.92,
    fragments: 4,
    friction: 0.7,
    sigma: 10,
    modulus: 7,
    ductility: 1,
    solid: 1,
    shearColumn: 0.1,
    shearWall: 0.2,
    restitution: 0.15,
  },
  // Sandwich panel (thin steel skins + insulation core) equivalent — an estimate, not a code value
  // density ~20 kg/m² with core ÷ 0.2 m wall = 0.1 · non-rated sandwich panel under 10 min
  panel: {
    density: 0.1,
    strength: 0.3,
    fireResistance: 0.0,
    fragments: 2,
    friction: 0.5,
    sigma: 1,
    modulus: 0.3,
    ductility: 2,
    solid: 1,
    shearColumn: 0.05,
    shearWall: 0.05,
    restitution: 0.1,
  },
  // Float glass: characteristic bending strength 45 MPa, E 70 GPa (EN 572), brittle μ = 1, glass thickness ratio 0.1
  // density 2.5 × 0.1 = 0.25 · ordinary glass breaks within minutes to ~12 min in a fire · shatters instead of fragmenting (B-3)
  window: {
    density: 0.25,
    strength: 0.2,
    fireResistance: 0.17,
    fragments: 1,
    friction: 0.3,
    sigma: 45,
    modulus: 70,
    ductility: 1,
    solid: 0.1,
    shearColumn: 0,
    shearWall: 0,
    restitution: 0.5,
  },
  // Curtain wall insulated / laminated glass: same glass, thickness ratio 0.15
  // density 2.5 × 0.15 ≈ 0.38 · same fire behavior as float glass
  curtain: {
    density: 0.38,
    strength: 0.2,
    fireResistance: 0.17,
    fragments: 1,
    friction: 0.3,
    sigma: 45,
    modulus: 70,
    ductility: 1,
    solid: 0.15,
    shearColumn: 0,
    shearWall: 0,
    restitution: 0.5,
  },
};
