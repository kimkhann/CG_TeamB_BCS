/**
 * [B · Simulation] Scenario sizes in real-world units — each scenario has its own range and unit
 *
 *   impact      2 t wrecking ball impact speed     5–60 km/h
 *   explosion   TNT equivalent                    0.1–100 kg (log scale)
 *   earthquake  magnitude M                       1.0–9.0  + epicentral distance 1–100 km
 *   fire        standard fire (ISO 834) duration  5–180 min
 *
 * The UI (C) builds its slider from SCALES and sends { value, distanceKm } with SCENARIO_RUN.
 * Without value (old format) the 0–1 intensity is converted with fromIntensity.
 *
 * ── Formulas and sources ──────────────────────────────────────
 *   impact      E = ½ m v²  (damage from the impact energy model in sim/impact.js)
 *   explosion   damage radius R = 7 · W^(1/3) m — scaled distance Z ≈ 7 m/kg^(1/3) gives ~20 kPa overpressure
 *          (Kingery–Bulmash curves; heavy damage to walls and windows)
 *   earthquake  peak ground acceleration  log₁₀ PGA(g) = −1.02 + 0.249 M − log₁₀ r − 0.00255 r,  r = √(d² + 7.3²)
 *          (Joyner & Boore, 1981 attenuation; fitted on M 5.0–7.7, extrapolated outside)
 *          intensity: PGA ↔ Modified Mercalli Intensity (Wald et al., 1999)
 *   fire        damage = duration / part fire rating (fireResistance = 1 − 10 min / rating, data/materialPhysics.js)
 *          temperature T = 20 + 345 · log₁₀(8t + 1) °C (ISO 834), played back in 8 s
 */

/** Impact: wrecking ball mass (t) */
export const BALL_MASS = 2;
const CAR_MASS = 1.5;
/** Korean design earthquake effective PGA (g): seismic zone I 0.11 g × 2,400-year return factor 2.0 (KDS 41 17 00) */
export const DESIGN_PGA = 0.22;
/** How long a fire plays on screen (s) */
export const FIRE_PLAY_SECONDS = 8;

/**
 * Slider settings per scenario
 * @type {Record<string, {label:string, unit:string, min:number, max:number, step?:number, log?:boolean,
 *   defaultValue:number, digits:number, fromIntensity:(i:number)=>number,
 *   distance?:{label:string, unit:string, min:number, max:number, step:number, defaultValue:number}}>}
 */
export const SCALES = {
  impact: {
    label: 'Impact speed',
    unit: 'km/h',
    min: 5,
    max: 60,
    step: 1,
    defaultValue: 30,
    digits: 0,
    fromIntensity: (i) => (2 + 10 * i) * 3.6,
  },
  explosion: {
    label: 'TNT equivalent',
    unit: 'kg',
    min: 0.1,
    max: 100,
    log: true,
    defaultValue: 1,
    digits: 1,
    fromIntensity: (i) => ((2 + 6 * i) / 7) ** 3,
  },
  earthquake: {
    label: 'Magnitude',
    unit: '',
    min: 1,
    max: 9,
    step: 0.1,
    defaultValue: 6,
    digits: 1,
    fromIntensity: (i) => i, // the old format is handled separately in earthquakePga
    distance: {
      label: 'Epicentral distance',
      unit: 'km',
      min: 1,
      max: 100,
      step: 1,
      defaultValue: 10,
    },
  },
  fire: {
    label: 'Fire duration',
    unit: 'min',
    min: 5,
    max: 180,
    step: 5,
    defaultValue: 30,
    digits: 0,
    fromIntensity: (i) => 20 * i,
  },
};

/** Slider position (0–1000) ↔ value. Exponential on a log scale */
export function valueFromSlider(scale, position) {
  const t = position / 1000;
  const v = scale.log
    ? scale.min * (scale.max / scale.min) ** t
    : scale.min + (scale.max - scale.min) * t;
  const step = scale.step ?? 0;
  if (!step) return Number(v.toPrecision(2));
  return Math.round(v / step) * step;
}
export function sliderFromValue(scale, value) {
  const t = scale.log
    ? Math.log(value / scale.min) / Math.log(scale.max / scale.min)
    : (value - scale.min) / (scale.max - scale.min);
  return Math.round(Math.min(1, Math.max(0, t)) * 1000);
}

/** The scenario's real-world value (converted from intensity when value is missing) */
export function scenarioValue(scenario) {
  if (typeof scenario.value === 'number') return scenario.value;
  return SCALES[scenario.type].fromIntensity(scenario.intensity ?? 0.6);
}

// ── Conversions per scenario ───────────────────────────────

export const impactSpeed = (kmh) => kmh / 3.6;

/** Explosion: TNT kg → damage radius (m) and damage factor (1 at 1.5 kg TNT) */
export function blast(tntKg) {
  const radius = 7 * Math.cbrt(tntKg);
  return { radius, power: Math.min(3, Math.max(0.05, (radius - 2) / 6)) };
}

/** Earthquake: magnitude and epicentral distance → peak ground acceleration (g) */
export function pgaFromMagnitude(magnitude, distanceKm = 10) {
  const r = Math.sqrt(distanceKm * distanceKm + 7.3 * 7.3);
  const log = -1.02 + 0.249 * magnitude - Math.log10(r) - 0.00255 * r;
  return Math.min(2, 10 ** log);
}

/** PGA (g) of an earthquake scenario. Old format (intensity only) is 0.5 g × intensity */
export function earthquakePga(scenario) {
  if (typeof scenario.value === 'number') {
    return pgaFromMagnitude(scenario.value, scenario.distanceKm ?? 10);
  }
  return 0.5 * (scenario.intensity ?? 0.6);
}

const MMI = [
  [0.0017, 'Ⅰ', 'Not felt'],
  [0.014, 'Ⅱ~Ⅲ', 'Felt by some people indoors'],
  [0.039, 'Ⅳ', 'Dishes and windows shake'],
  [0.092, 'Ⅴ', 'Dishes break; objects overturn'],
  [0.18, 'Ⅵ', 'Heavy furniture moves; walls crack'],
  [0.34, 'Ⅶ', 'Weak buildings suffer heavy damage'],
  [0.65, 'Ⅷ', 'Ordinary buildings may partially collapse'],
  [1.24, 'Ⅸ', 'Well-built structures suffer heavy damage'],
  [Infinity, 'Ⅹ or higher', 'Most buildings collapse'],
];

/** PGA (g) → intensity level and description */
export function mmiFromPga(pga) {
  const row = MMI.find(([upper]) => pga < upper) ?? MMI[MMI.length - 1];
  return { level: row[1], text: row[2] };
}

/** Effect strength for the renderer (0–1) */
export function effectEnergy(type, value, distanceKm) {
  if (type === 'impact') return Math.min(1, (0.5 * BALL_MASS * impactSpeed(value) ** 2) / 144);
  if (type === 'explosion') return Math.min(1, blast(value).power);
  if (type === 'earthquake') return Math.min(1, pgaFromMagnitude(value, distanceKm) / 0.5);
  if (type === 'fire') return Math.min(1, value / 60);
  return 0.5;
}

const round = (v, digits = 1) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** Value label (right of the slider) */
export function formatValue(type, value) {
  const s = SCALES[type];
  if (type === 'earthquake') return `M ${value.toFixed(1)}`;
  const text = value < 1 ? round(value, 2) : round(value, s.digits);
  return `${text} ${s.unit}`;
}

/**
 * User-facing description of the real-world size (English, shown in the UI)
 * @returns {{ headline:string, detail:string }}
 */
export function describeScenario(type, value, distanceKm = 10) {
  if (type === 'impact') {
    const v = impactSpeed(value);
    const energy = 0.5 * BALL_MASS * v * v;
    const car = Math.sqrt((2 * energy) / CAR_MASS) * 3.6;
    return {
      headline: `${BALL_MASS} t wrecking ball at ${Math.round(value)} km/h`,
      detail: `Impact energy ${Math.round(energy)} kJ — equivalent to a 1.5 t car at ${Math.round(car)} km/h`,
    };
  }
  if (type === 'explosion') {
    const { radius } = blast(value);
    return {
      headline: `TNT ${value < 1 ? round(value, 2) : round(value, 1)} kg · damage radius ${round(radius)} m`,
      detail: `Blast pressure can heavily damage walls and glazing (about 20 kPa or more). Area targets use the selected radius.`,
    };
  }
  if (type === 'earthquake') {
    const pga = pgaFromMagnitude(value, distanceKm);
    const { level, text } = mmiFromPga(pga);
    return {
      headline: `${Math.round(distanceKm)} km from epicenter · MMI ${level} · peak ground acceleration ${round(pga, 2)} g`,
      detail:
        `${text}. ${round(pga / DESIGN_PGA)}× the Korean design reference (0.22 g)` +
        (value < 5 || value > 7.7 ? ' (extrapolated beyond the M 5.0–7.7 data range)' : ''),
    };
  }
  if (type === 'fire') {
    const temp = 20 + 345 * Math.log10(8 * value + 1);
    return {
      headline: `Standard fire · ${Math.round(value)} min · approx. ${Math.round(temp / 10) * 10} °C`,
      detail: `Members rated below ${Math.round(value)} min fail: bare steel ≈20 min, timber ≈30 min, masonry ≈2 h, RC ≈3 h. Playback compresses this to ${FIRE_PLAY_SECONDS} s`,
    };
  }
  return { headline: '', detail: '' };
}
