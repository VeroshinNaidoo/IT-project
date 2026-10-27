export const ISLAND_STATE_VERSION = 1;
export const ISLAND_INITIAL_PHASE_ATTEMPT = 1;
export const ISLAND_MIN_QUESTIONS = 30;
export const ISLAND_PHASE_COUNT = 3;
export const ISLAND_QUESTIONS_PER_PHASE = 10;
export const ISLAND_BASE_POINTS = 10;
export const ISLAND_DOUBLE_MULTIPLIER = 2;
export const ISLAND_STREAK_FOR_DOUBLE = 3;
export const ISLAND_WRONG_LIMIT = 5;
export const ISLAND_MAX_SETBACKS = 3;

export const ISLAND_PHASES = Object.freeze({
  1: Object.freeze({
    name: 'Gather materials',
    preferredLevels: Object.freeze([1, 2]),
    setback: 'tools_lost',
  }),
  2: Object.freeze({
    name: 'Build the boat',
    preferredLevels: Object.freeze([3]),
    setback: 'boat_broken',
  }),
  3: Object.freeze({
    name: 'Sail to the mainland',
    preferredLevels: Object.freeze([4, 5]),
    setback: 'sharks',
  }),
});

export const ISLAND_MATERIALS = Object.freeze([
  'Wood',
  'Rope',
  'Cloth',
  'Nails',
  'Bamboo',
  'Resin',
  'Vines',
  'Palm leaves',
  'Driftwood',
  'Tools',
]);

export const ISLAND_BOAT_PARTS = Object.freeze([
  'Keel',
  'Hull',
  'Mast',
  'Sail',
  'Rudder',
  'Deck',
  'Oars',
  'Rigging',
  'Seat',
  'Anchor',
]);
