/*
 * Energy labels in the DOM (ui/EnergyLabels.tsx) anchored to the graph's points; scene/EnergyFlow.tsx writes the points and
 * projects them every frame. No three here, so the UI bundle stays light.
 */

import { kick } from '@/scene/frame'
import type { Node, Vec } from './graph'

export const nodePos = new Map<Node['id'], Vec>()
export const labelEls = new Map<Node['id'], HTMLElement>()

export function registerEnergyLabel(id: Node['id'], el: HTMLElement | null) {
  if (el) {
    labelEls.set(id, el)
    kick()
  } else labelEls.delete(id)
}
