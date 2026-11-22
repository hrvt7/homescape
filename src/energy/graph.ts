/*
 * Where the energy flows are drawn on a floor: points for the solar panels, the hub (inverter or meter), the battery, the
 * car charger, the grid (the nearest utility pole, else the front of the plot) and the rooms that use power, and the
 * strands between them with their power and source color. Pure: no three.
 */

import { labelYOf } from '@/model/catalog'
import { bounds, isOutdoor, labelPoint } from '@/model/geometry'
import type { Item, ItemKind, Level } from '@/model/types'
import type { Flows } from './sim'

export type Vec = [number, number, number]
export type Source = 'solar' | 'battery' | 'grid' | 'mix'

/** Source colors: the sun yellow, battery green, grid violet (DESIGN.md palette, brighter for light) */
export const SOURCE_COLOR: Record<Source, string> = { solar: '#ffc23d', battery: '#2fd58a', grid: '#8f7bff', mix: '#ffffff' }

export interface Strand {
  id: string
  from: Vec
  to: Vec
  watts: number
  source: Source
  /** How high the arc rises (m) */
  lift: number
}

export interface Node {
  id: 'solar' | 'hub' | 'battery' | 'ev' | 'grid' | 'home'
  at: Vec
}

export interface Graph {
  nodes: Node[]
  strands: Strand[]
}

const center = (items: Item[], dy = 0): Vec => {
  const x = items.reduce((a, i) => a + i.x, 0) / items.length
  const z = items.reduce((a, i) => a + i.z, 0) / items.length
  const y = Math.max(...items.map((i) => (i.y ?? 0) + labelYOf(i.kind) * 0.55))
  return [x, y + dy, z]
}
const of = (level: Level, kind: ItemKind) => level.items.filter((i) => i.kind === kind)
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[2] - b[2])

/** The source giving the largest share */
function sourceOf(parts: Record<'solar' | 'battery' | 'grid', number>): Source {
  const sum = parts.solar + parts.battery + parts.grid
  if (sum <= 0) return 'mix'
  return (Object.entries(parts) as ['solar' | 'battery' | 'grid', number][]).sort((a, b) => b[1] - a[1])[0][0]
}

export function energyGraph(level: Level, flows: Flows, rooms: Record<string, number>): Graph {
  const nodes: Node[] = []
  const strands: Strand[] = []
  const panels = of(level, 'solarPanel')
  const inverter = of(level, 'solarInverter')
  const meter = of(level, 'powerMeter')
  const battery = of(level, 'homeBattery')
  const charger = of(level, 'evCharger')
  const indoor = level.rooms.filter((r) => !isOutdoor(r))
  if (!indoor.length) return { nodes, strands }
  const b = bounds(indoor)
  const homeAt: Vec = [(b.minX + b.maxX) / 2, 3.4, (b.minZ + b.maxZ) / 2]
  const hubItems = inverter.length ? inverter : meter.length ? meter : battery
  const hub: Vec = hubItems.length ? center(hubItems.slice(0, 1)) : homeAt
  nodes.push({ id: 'hub', at: hub }, { id: 'home', at: homeAt })

  const s = flows.split
  const add = (id: string, from: Vec, to: Vec, watts: number, source: Source) => {
    if (watts < 15) return
    strands.push({ id, from, to, watts, source, lift: 0.8 + Math.min(3.2, dist(from, to) * 0.18) })
  }

  if (panels.length || inverter.length) {
    const solar = panels.length ? center(panels, 0.2) : hub
    nodes.push({ id: 'solar', at: solar })
    if (panels.length) add('pv-hub', solar, hub, flows.pv, 'solar')
  }
  if (battery.length) {
    const at = center(battery.slice(0, 1))
    nodes.push({ id: 'battery', at })
    add('hub-bat', hub, at, s.pvBattery, 'solar')
    add('bat-hub', at, hub, s.batteryHome + s.batteryEv, 'battery')
  }
  if (charger.length) {
    const at = center(charger.slice(0, 1))
    nodes.push({ id: 'ev', at })
    add('hub-ev', hub, at, flows.ev, sourceOf({ solar: s.pvEv, battery: s.batteryEv, grid: s.gridEv }))
  }
  // Grid: the utility pole nearest the hub, else the middle of the plot's front edge
  const poles = of(level, 'utilityPole').sort((p, q) => dist([p.x, 0, p.z], hub) - dist([q.x, 0, q.z], hub))
  const all = bounds(level.rooms)
  const grid: Vec = poles.length ? [poles[0].x, 5.3, poles[0].z] : [hub[0], 3, all.maxZ + 0.5]
  nodes.push({ id: 'grid', at: grid })
  add('grid-hub', grid, hub, s.gridHome + s.gridEv, 'grid')
  add('hub-grid', hub, grid, s.pvGrid, 'solar')

  // The house: one strand per room that uses power (the 8 largest), colored by what feeds the house now
  const homeSource = sourceOf({ solar: s.pvHome, battery: s.batteryHome, grid: s.gridHome })
  const used = Object.entries(rooms)
    .map(([id, w]) => ({ room: level.rooms.find((r) => r.id === id), w }))
    .filter((r): r is { room: NonNullable<typeof r.room>; w: number } => Boolean(r.room) && r.w >= 20)
    .sort((p, q) => q.w - p.w)
    .slice(0, 8)
  for (const { room, w } of used) {
    const lp = labelPoint(room)
    add(`room-${room.id}`, hub, [lp.x, 0.9, lp.z], w, homeSource)
  }
  return { nodes, strands }
}
