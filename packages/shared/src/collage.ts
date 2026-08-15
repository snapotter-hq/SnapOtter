/**
 * Maximum cell pan offset for the collage tool, as a percentage of the cell
 * dimension, in either direction. The preview clamps drag to +/-this
 * (collage-preview.tsx) and the route schema validates cell pan against it
 * (routes/tools/collage.ts). Defined once so the two cannot drift: a mismatch
 * between them is what produced #718.
 */
export const COLLAGE_PAN_LIMIT = 200;
