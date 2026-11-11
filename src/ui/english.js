/** Presentation-only English labels. Building IDs and physics stay unchanged. */
import {
  BUILDING_TYPES as TYPES,
  MATERIALS as MATS,
  MATERIAL_SLOTS as SLOTS,
  SCENARIOS as CASES,
} from '../data/ids.js';

const names = {
  house: ['Detached house', 'Pitched roof · compact residential frame'],
  piloti: ['Piloti residence', 'Open ground floor · soft-story response'],
  apartment: ['Apartment block', 'Regular bays · multi-story concrete frame'],
  lshape: ['L-shaped building', 'Two connected wings · asymmetric footprint'],
};
export const BUILDING_TYPES = Object.fromEntries(
  Object.entries(TYPES).map(([id, v]) => [
    id,
    { ...v, label: names[id][0], description: names[id][1] },
  ]),
);
const materials = {
  rc: 'Reinforced concrete',
  steel: 'Structural steel',
  wood: 'Timber',
  brick: 'Brick masonry',
  panel: 'Lightweight panel',
  window: 'Standard glazing',
  curtain: 'Glass curtain wall',
};
export const MATERIALS = Object.fromEntries(
  Object.entries(MATS).map(([id, v]) => [id, { ...v, label: materials[id] }]),
);
const slots = {
  frame: 'Columns & beams',
  wall: 'Walls',
  slab: 'Floor slabs',
  facade: 'Facade & glazing',
};
export const MATERIAL_SLOTS = Object.fromEntries(
  Object.entries(SLOTS).map(([id, v]) => [id, { ...v, label: slots[id] }]),
);
export const SCENARIOS = Object.fromEntries(
  Object.entries(CASES).map(([id, v]) => [id, { ...v, label: id[0].toUpperCase() + id.slice(1) }]),
);

/** Translate generated member labels without changing A's building data. */
export function partLabel(value) {
  return String(value ?? '')
    .replace(/천장판/g, 'ceiling slab')
    .replace(/경사/g, 'sloped')
    .replace(/끝벽/g, 'end wall')
    .replace(/현관문/g, 'entrance door')
    .replace(/계단실/g, 'stairwell')
    .replace(/옥탑/g, 'rooftop core')
    .replace(/덮개/g, 'cap')
    .replace(/지붕판/g, 'roof slab')
    .replace(/(\d+)층/g, 'L$1')
    .replace(/기둥/g, 'column')
    .replace(/바닥판/g, 'slab')
    .replace(/바닥/g, 'slab')
    .replace(/지붕/g, 'roof')
    .replace(/창문/g, 'window')
    .replace(/창/g, 'window')
    .replace(/유리/g, 'glass')
    .replace(/외벽/g, 'outer wall')
    .replace(/벽/g, 'wall')
    .replace(/보/g, 'beam')
    .replace(/조각/g, 'fragment')
    .replace(/패널/g, 'panel')
    .replace(/박공/g, 'gable')
    .replace(/발코니/g, 'balcony')
    .replace(/난간/g, 'parapet')
    .replace(/코어/g, 'core')
    .replace(/계단/g, 'stair')
    .replace(/장식/g, 'detail')
    .replace(/옥상/g, 'rooftop')
    .replace(/슬래브/g, 'slab')
    .replace(/지붕판/g, 'roof slab');
}
