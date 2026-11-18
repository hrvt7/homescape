/*
 * Sofa layout, shared by the model (kit/furniture.tsx > Sofa), people's seats (people.ts) and pets' nap spots (pets.ts):
 * a straight sofa with two or three seats, or an L-shaped sectional (Item.variant 'lLeft' | 'lRight', the corner on that
 * side) whose second run comes forward from the corner. Item.len is the length of the main run, Item.len2 the length of
 * the second run measured from the back of the sofa (like the arm of an L kitchen counter, rules.ts > localFootprints).
 * All positions are in the item's local frame: x along the main run, +z its front.
 */

/** Depth of the sofa (and of the sectional's second run) */
export const SOFA_D = 0.9
export const isSectional = (variant?: string) => variant === 'lLeft' || variant === 'lRight'
/** Sectional defaults and limits: main run length, second run length (from the back) */
export const SECTIONAL = { len: 2.6, arm: 2.0, armMin: 1.5, armMax: 3.2 }

/** Arm and back thickness of the sofa model */
const ARM = 0.22
const BACK = 0.24

export interface SofaSeat {
  /** Middle of the seat cushion */
  x: number
  z: number
  /** Width of the cushion along its run */
  w: number
  /** Facing, relative to the item (0: the main run's front, ±π/2: the second run's front) */
  rot: number
}

/** Length of the second run of a sectional, from the back of the sofa */
export const sectionalArm = (len2?: number) => Math.min(SECTIONAL.armMax, Math.max(SECTIONAL.armMin, len2 ?? SECTIONAL.arm))

/** Seat cushions of a sofa: two or three on a straight sofa, the main and the side run's cushions on a sectional */
export function sofaSeats(len: number, variant?: string, len2?: number): SofaSeat[] {
  if (!isSectional(variant)) {
    const n = len >= 2 ? 3 : 2
    const step = (len - 0.43) / n
    return Array.from({ length: n }, (_, k) => ({ x: (k - (n - 1) / 2) * step, z: 0.11, w: step, rot: 0 }))
  }
  const sx = variant === 'lRight' ? 1 : -1
  const leg = sectionalArm(len2)
  // Main run: from the inner face of the far arm to the inner face of the corner back
  const a = -sx * (len / 2 - ARM)
  const b = sx * (len / 2 - BACK)
  const usable = Math.abs(b - a)
  const n = Math.max(2, Math.round(usable / 0.62))
  const step = usable / n
  const lo = Math.min(a, b)
  const main = Array.from({ length: n }, (_, k) => ({ x: lo + step * (k + 0.5), z: 0.11, w: step, rot: 0 }))
  // Second run: from the main run's front edge to the inner face of its end arm, facing the middle of the L
  const z0 = SOFA_D / 2
  const z1 = -SOFA_D / 2 + leg - ARM
  const m = Math.max(1, Math.round((z1 - z0) / 0.62))
  const sstep = (z1 - z0) / m
  const side = Array.from({ length: m }, (_, k) => ({ x: sx * (len / 2 - BACK - 0.33), z: z0 + sstep * (k + 0.5), w: sstep, rot: sx > 0 ? -Math.PI / 2 : Math.PI / 2 }))
  return [...main, ...side]
}
