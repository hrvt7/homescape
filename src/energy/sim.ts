/*
 * Energy model of the home, pure functions (no React, no three).
 *
 * Consumption comes from the plan itself: every item bound to an entity that is on draws a typical power for its kind
 * (lights by brightness, a TV, an AC that heats, a washer...), and a bound power sensor of an appliance gives its real
 * value. So switching a lamp or the car charger in the scene changes the flows at once. Solar production follows the sun
 * (latitude of Vas county) and the clouds of the weather. The battery covers the gap, the grid the rest.
 * On a live Home Assistant the bound power sensors of the solar panels, the inverter and the car charger win over the
 * estimates (readPower).
 */

import type { Entities, HassEntity } from '@/ha/types'
import { bindingsOf } from '@/model/bindings'
import { roomAt } from '@/model/geometry'
import type { Item, ItemKind, Level } from '@/model/types'
import { approxSun } from '@/scene/sun'

/** Latitude of Szombathely: the sun of the target market */
export const LAT = 47.2

/** Kinds that are part of the energy system, not loads */
export const SYSTEM_KINDS: ItemKind[] = ['solarPanel', 'solarInverter', 'homeBattery', 'powerMeter', 'evCharger', 'utilityPole', 'ups', 'generator']

export interface SystemSpec {
  /** Solar peak power (W) */
  pvPeak: number
  /** Battery capacity (Wh) and its max charge / discharge power (W) */
  batteryWh: number
  batteryW: number
  /** The battery is never drained below this share */
  reserve: number
  /** Car charger power (W), car battery (Wh) */
  evW: number
  evWh: number
  /** Always-on base load: fridge, router, standby (W) */
  baseW: number
}

/** A typical new HU family-home system: 6 kWp, 10 kWh battery, 11 kW (3-phase) charger capped at 7.4 kW */
export const DEFAULT_SPEC: SystemSpec = { pvPeak: 6000, batteryWh: 10_000, batteryW: 5000, reserve: 0.1, evW: 7400, evWh: 60_000, baseW: 160 }

const num = (e: HassEntity | undefined) => {
  const v = Number(e?.state)
  return Number.isFinite(v) ? v : null
}
const isOn = (e: HassEntity | undefined) => Boolean(e) && !['off', 'unavailable', 'unknown', 'idle', 'standby', 'closed', 'docked', 'locked'].includes(e!.state)

/**
 * Average power of a kind while switched on (W). Thermostatic and cycling devices (water heater, hot tub, AC, fridge,
 * coffee machine keeping warm) are averaged over their duty cycle, not their nameplate, so the day totals stay realistic.
 */
const ON_W: Partial<Record<ItemKind, number>> = {
  tv: 95, monitor: 30, monitorV: 25, computer: 120, console: 160, projector: 220, soundbar: 25, speaker: 12, homepod: 8, floorSpeaker: 30,
  turntable: 15, streamingBox: 6, smartDisplay: 8, acUnit: 650, portableAc: 550, heater: 900, radiator: 500, towelWarmer: 110, boiler: 1100,
  waterHeater: 450, fan: 35, ceilingFan: 40, wallFan: 35, deskFan: 25, airPurifier: 30, humidifier: 25, dehumidifier: 200, diffuser: 12,
  fridge: 45, freezer: 40, wineFridge: 35, stove: 1200, oven: 1400, washer: 450, dryer: 1500, dishwasher: 900, coffeeMachine: 70, kettle: 1800,
  microwave: 900, airFryer: 1300, toaster: 800, multicooker: 220, blender: 500, waterDispenser: 90, robotVacuum: 40, stickVacuum: 80,
  plug: 60, powerStrip: 80, serverRack: 180, nas: 35, router: 12, printer: 20, aquarium: 45, fishbowl: 8, treadmill: 600, exerciseBike: 60,
  sauna: 3000, hotTub: 280, pool: 600, patioHeater: 1200, lawnMower: 60, sprinkler: 10, petFountain: 4, petFeeder: 3, ironingBoard: 1800,
  christmasTree: 25, stringLights: 15, neonSign: 20, lightPanels: 20, floodlight: 40, gardenLight: 8, streetLamp: 0, camera: 5, deskCamera: 4,
}
const LIGHT_W = 9

/**
 * Power an item draws now (W). `seen` holds entities already counted on another item (a thermostat and its outdoor unit
 * share one climate entity): each entity draws once.
 */
export function itemPower(it: Item, entities: Entities, seen?: Set<string>): number {
  if (SYSTEM_KINDS.includes(it.kind)) return 0
  const ids = bindingsOf(it).filter((id) => !seen?.has(id))
  ids.forEach((id) => seen?.add(id))
  if (!ids.length) return 0
  // A bound power sensor tells the real value
  for (const id of ids) {
    const e = entities[id]
    if (e?.attributes.device_class === 'power' && String(e.attributes.unit_of_measurement ?? 'W') === 'W') {
      const v = num(e)
      if (v != null) return Math.max(0, v)
    }
  }
  let w = 0
  for (const id of ids) {
    const e = entities[id]
    if (!e || !isOn(e)) continue
    const d = id.split('.')[0]
    if (d === 'light') w += LIGHT_W * (typeof e.attributes.brightness === 'number' ? Math.max(0.15, e.attributes.brightness / 255) : 1) * (it.kind === 'ledStrip' || it.kind === 'ceilingStrip' ? 1.8 : 1)
    else if (d === 'climate') {
      const act = String(e.attributes.hvac_action ?? '')
      w += act === 'heating' || act === 'cooling' ? (ON_W[it.kind] ?? 650) : 20
    } else if (d === 'media_player') w += e.state === 'playing' || e.state === 'on' ? (ON_W[it.kind] ?? 40) : 6
    else if (d === 'vacuum') w += e.state === 'cleaning' ? 40 : 4
    else if (d === 'water_heater') w += ON_W.waterHeater ?? 450
    else if (d === 'switch' || d === 'fan' || d === 'humidifier' || d === 'input_boolean') w += ON_W[it.kind] ?? 50
  }
  return w
}

export interface Loads {
  /** House consumption without the car (W) */
  home: number
  /** Per room id (W) */
  rooms: Record<string, number>
}

/** Consumption of a floor's items, by room; items outside any room go to the base load */
export function floorLoads(level: Level, entities: Entities, base: number, seen = new Set<string>()): Loads {
  const rooms: Record<string, number> = {}
  let home = base
  for (const it of level.items) {
    const w = itemPower(it, entities, seen)
    if (w <= 0) continue
    home += w
    const r = roomAt(level.rooms, it.x, it.z)
    if (r) rooms[r.id] = (rooms[r.id] ?? 0) + w
  }
  return { home, rooms }
}

/** Solar power at a moment (W): sun height, a little morning and evening loss, clouds (0-1) */
export function solarPower(at: number, peak: number, cloud: number) {
  const el = approxSun(at, LAT).elevation
  if (el <= 0) return 0
  const s = Math.sin((el * Math.PI) / 180)
  // Air mass: low sun loses more; 0.82 system losses (inverter, heat, dirt)
  const clear = Math.pow(s, 1.25) * 0.82 * (1 - Math.exp(-el / 4))
  return peak * clear * (1 - 0.78 * Math.min(1, Math.max(0, cloud)))
}

/** Power of a sensor bound to items of these kinds (live homes), W; null when none reports a number */
export function readPower(items: Item[], kinds: ItemKind[], entities: Entities): number | null {
  let sum: number | null = null
  const seen = new Set<string>()
  for (const it of items) {
    if (!kinds.includes(it.kind)) continue
    for (const id of bindingsOf(it)) {
      const e = entities[id]
      if (seen.has(id) || e?.attributes.device_class !== 'power') continue
      seen.add(id)
      const v = num(e)
      if (v == null) continue
      const unit = String(e.attributes.unit_of_measurement ?? 'W')
      sum = (sum ?? 0) + (unit === 'kW' ? v * 1000 : v)
    }
  }
  return sum
}

/** First battery percentage bound to items of these kinds (0-1) */
export function readSoc(items: Item[], kinds: ItemKind[], entities: Entities): number | null {
  for (const it of items) {
    if (!kinds.includes(it.kind)) continue
    for (const id of bindingsOf(it)) {
      const e = entities[id]
      if (e?.attributes.device_class === 'battery') {
        const v = num(e)
        if (v != null) return v / 100
      }
    }
  }
  return null
}

/** Whether the car charger of the floor is switched on (its main switch) */
export function chargerOn(items: Item[], entities: Entities) {
  const c = items.find((i) => i.kind === 'evCharger')
  if (!c) return false
  const sw = bindingsOf(c).find((id) => id.startsWith('switch.') || id.startsWith('input_boolean.'))
  return sw ? entities[sw]?.state === 'on' : true
}

export interface Flows {
  /** Solar production, house load, car charging (W, all >= 0) */
  pv: number
  home: number
  ev: number
  /** + charging, - discharging (W) */
  battery: number
  /** + buying, - selling (W) */
  grid: number
  /** Battery and car state of charge (0-1) */
  soc: number
  evSoc: number
  /** Solar power going into the house, the battery, the car and the grid (W): the strands drawn in the scene */
  split: { pvHome: number; pvBattery: number; pvEv: number; pvGrid: number; batteryHome: number; batteryEv: number; gridHome: number; gridEv: number }
}

export interface StepInput {
  pv: number
  home: number
  /** Car charger switched on, smart mode (solar surplus only) */
  evWanted: boolean
  smartEv: boolean
  soc: number
  evSoc: number
  spec: SystemSpec
  /** Seconds simulated */
  dt: number
}

/** One step of the battery and car: who feeds whom; returns the flows and the new states of charge */
export function step(i: StepInput): Flows {
  const { spec } = i
  const hasBattery = spec.batteryWh > 0
  let ev = 0
  if (i.evWanted && i.evSoc < 0.995) {
    if (!i.smartEv) ev = spec.evW
    else {
      // Smart charging: only the surplus over the house load and, below 80%, the battery's charging (the battery comes
      // first so the evening is covered); at least 1.4 kW (6 A single phase) to start
      const batteryFirst = hasBattery && i.soc < 0.8 ? spec.batteryW : 0
      const surplus = i.pv - i.home - batteryFirst
      ev = surplus >= 1400 ? Math.min(spec.evW, surplus) : 0
    }
  }
  // Solar first to the house, then the car, then the battery, then the grid
  const pvHome = Math.min(i.pv, i.home)
  const pvEv = Math.min(i.pv - pvHome, ev)
  let rest = i.pv - pvHome - pvEv
  const room = hasBattery ? Math.max(0, (1 - i.soc) * spec.batteryWh) * (3600 / Math.max(1, i.dt)) : 0
  const pvBattery = Math.min(rest, spec.batteryW, room)
  rest -= pvBattery
  const pvGrid = rest
  // Gaps: the battery covers the house first (not the car in smart mode), down to its reserve
  let homeGap = i.home - pvHome
  let evGap = ev - pvEv
  const avail = hasBattery ? Math.max(0, (i.soc - spec.reserve) * spec.batteryWh) * (3600 / Math.max(1, i.dt)) : 0
  let budget = Math.min(spec.batteryW - pvBattery, avail)
  const batteryHome = Math.max(0, Math.min(homeGap, budget))
  budget -= batteryHome
  homeGap -= batteryHome
  const batteryEv = i.smartEv ? 0 : Math.max(0, Math.min(evGap, budget))
  evGap -= batteryEv
  const gridHome = homeGap
  const gridEv = evGap
  const battery = pvBattery - batteryHome - batteryEv
  const soc = hasBattery ? Math.min(1, Math.max(0, i.soc + (battery * i.dt) / 3600 / spec.batteryWh)) : 0
  const evSoc = Math.min(1, i.evSoc + (ev * i.dt) / 3600 / spec.evWh)
  return {
    pv: i.pv,
    home: i.home,
    ev,
    battery,
    grid: gridHome + gridEv - pvGrid,
    soc,
    evSoc,
    split: { pvHome, pvBattery, pvEv, pvGrid, batteryHome, batteryEv, gridHome, gridEv },
  }
}
