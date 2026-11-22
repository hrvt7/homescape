/*
 * Energy layer state and its engine. The engine ticks while the page is visible: it reads the plan and the entities,
 * computes the loads, the solar power and the battery, and keeps today's totals. The clock is either the real time
 * ("now") or a simulated day the user scrubs or plays back; in a simulated day the demo source gets a matching sun.sun, so
 * the scene turns to night with it.
 */

import { create } from 'zustand'
import { isAmericanLayout } from '@/demo/american'
import { currentWeather } from '@/ha/weather'
import { useHa } from '@/ha/store'
import type { Entities } from '@/ha/types'
import { useLayout } from '@/model/layoutStore'
import type { Item, Layout } from '@/model/types'
import { approxSun } from '@/scene/sun'
import { chargerOn, DEFAULT_SPEC, floorLoads, LAT, readPower, readSoc, solarPower, step, type Flows, type SystemSpec } from './sim'

export type Season = 'today' | 'summer' | 'winter'

export interface DayTotals {
  /** kWh since midnight */
  pv: number
  load: number
  imported: number
  exported: number
}

/** Evening peak of a demo home without the car (W): a family home with a heat pump water heater and the usual devices */
const DEMO_PEAK = 1100

const ZERO: DayTotals = { pv: 0, load: 0, imported: 0, exported: 0 }

interface EnergyState {
  open: boolean
  /** 'now': the real clock; 'sim': a simulated moment (simAt) */
  clock: 'now' | 'sim'
  simAt: number
  playing: boolean
  /** Simulated seconds per real second while playing */
  speed: number
  season: Season
  smartEv: boolean
  spec: SystemSpec
  /** Battery and car state of charge (0-1) */
  soc: number
  evSoc: number
  flows: Flows | null
  rooms: Record<string, number>
  totals: DayTotals
  /** The whole day (midnight to midnight) with today's loads and settings: the monthly estimate uses it */
  fullDay: DayTotals
  /** Whether solar power comes from real sensors (live Home Assistant) */
  measured: boolean
  /** The moment the flows belong to */
  at: number
  setOpen: (open: boolean) => void
  scrub: (at: number) => void
  play: (on: boolean) => void
  backToNow: () => void
  setSeason: (s: Season) => void
  setSmartEv: (on: boolean) => void
}

/** The same time of day on the season's date (summer: 21 June, winter: 21 December) */
export function seasonal(at: number, season: Season) {
  if (season === 'today') return at
  const d = new Date(at)
  const s = new Date(d)
  s.setMonth(season === 'summer' ? 5 : 11, 21)
  return s.getTime()
}

const midnight = (at: number) => {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** How much of the evening load the house uses at an hour (shape of a family day) */
function profile(at: number) {
  const h = new Date(at).getHours() + new Date(at).getMinutes() / 60
  if (h < 6) return 0.35
  if (h < 9) return 0.85
  if (h < 16) return 0.55
  if (h < 22) return 1
  return 0.6
}

interface Inputs {
  items: Item[]
  home: number
  rooms: Record<string, number>
  cloud: number
  evWanted: boolean
  realPv: number | null
  realSoc: number | null
}

/**
 * Loads, solar and the car charger from the plan. A demo home's switches never change on their own, so its consumption
 * follows the day profile (the evening state is the peak); a live home's states are real and used as they are.
 */
function readInputs(layout: Layout | null, entities: Entities, spec: SystemSpec, live: boolean, at: number): Inputs {
  const levels = layout?.levels ?? []
  const items = levels.flatMap((l) => l.items)
  const demo = !(live && !isAmericanLayout(layout))
  let raw = 0
  const rawRooms: Record<string, number> = {}
  const seen = new Set<string>()
  for (const l of levels) {
    const f = floorLoads(l, entities, 0, seen)
    raw += f.home
    Object.assign(rawRooms, f.rooms)
  }
  // The sample home has nearly every device on at once (a showcase, not a household): its evening peak is scaled to a
  // Hungarian family home's, so the day and the bill look like a real customer's
  const shape = demo ? profile(at) * Math.min(1, DEMO_PEAK / Math.max(1, raw)) : 1
  const home = spec.baseW + raw * shape
  const rooms: Record<string, number> = {}
  for (const [id, w] of Object.entries(rawRooms)) rooms[id] = w * shape
  const cloud = currentWeather(entities).fx.cloud
  const real = live && !isAmericanLayout(layout)
  return {
    items,
    home,
    rooms,
    cloud,
    evWanted: chargerOn(items, entities),
    realPv: real ? readPower(items, ['solarPanel', 'solarInverter'], entities) : null,
    realSoc: real ? readSoc(items, ['homeBattery'], entities) : null,
  }
}

/** Integrates a day from midnight to `at` (5 minute steps), the house following the day profile around today's load */
function prefill(at: number, inp: Inputs, s: Pick<EnergyState, 'spec' | 'smartEv'>) {
  const start = midnight(at)
  const dt = 300
  let soc = 0.35
  // The car comes home with a day's commute used (about 10 kWh of 60)
  let evSoc = 0.8
  const totals = { ...ZERO }
  // The load at `at` scaled along the day profile (a demo home's inputs already carry the profile at `at`)
  const nowShape = profile(at)
  for (let t = start; t < at; t += dt * 1000) {
    const home = s.spec.baseW + (inp.home - s.spec.baseW) * (profile(t) / nowShape)
    const pv = solarPower(t, s.spec.pvPeak, inp.cloud)
    // Without smart charging the car is plugged in after work
    const hour = new Date(t).getHours()
    const evWanted = inp.evWanted && (s.smartEv || hour >= 18)
    const f = step({ pv, home, evWanted, smartEv: s.smartEv, soc, evSoc, spec: s.spec, dt })
    soc = f.soc
    evSoc = f.evSoc
    add(totals, f, dt)
  }
  return { totals, soc, evSoc }
}

/** Adds `dt` seconds of the flows to the totals (kWh) */
function add(totals: DayTotals, f: Flows, dt: number) {
  const h = dt / 3600 / 1000
  totals.pv += f.pv * h
  totals.load += (f.home + f.ev) * h
  totals.imported += Math.max(0, f.grid) * h
  totals.exported += Math.max(0, -f.grid) * h
}

/** ?energy in the URL opens the energy view at start (a link for a customer demo); ?energy=play also plays the day */
const START = (() => {
  try {
    return new URLSearchParams(location.search).get('energy')
  } catch {
    return null
  }
})()

export const useEnergy = create<EnergyState>((set, get) => ({
  open: START != null,
  clock: 'now',
  simAt: Date.now(),
  playing: false,
  speed: 1800,
  season: 'today',
  smartEv: false,
  spec: DEFAULT_SPEC,
  soc: 0.6,
  evSoc: 0.5,
  flows: null,
  rooms: {},
  totals: ZERO,
  fullDay: ZERO,
  measured: false,
  at: Date.now(),
  setOpen: (open) => {
    set({ open })
    if (open) restart()
  },
  scrub: (at) => {
    set({ clock: 'sim', simAt: at })
    restart()
  },
  play: (on) => {
    if (on && get().clock === 'now') set({ clock: 'sim', simAt: seasonal(Date.now(), get().season) })
    // The night follows the simulated sun (useNight in "auto")
    if (on) useLayout.getState().setTheme('auto')
    set({ playing: on })
  },
  backToNow: () => {
    set({ clock: 'now', playing: false })
    restart()
  },
  setSeason: (season) => {
    const s = get()
    set({ season, simAt: seasonal(s.clock === 'now' ? Date.now() : s.simAt, season) })
    restart()
  },
  setSmartEv: (smartEv) => {
    set({ smartEv })
    restart()
  },
}))

/** The moment shown: the simulated one, or now on the season's date */
const momentOf = (s: EnergyState) => (s.clock === 'sim' ? s.simAt : seasonal(Date.now(), s.season))

/** Recomputes today up to the shown moment (after a jump in time or a setting change) */
function restart() {
  const s = useEnergy.getState()
  const { layout } = useLayout.getState()
  const ha = useHa.getState()
  const at = momentOf(s)
  const inp = readInputs(layout, ha.entities, s.spec, ha.source?.kind === 'live', at)
  const day = prefill(at, inp, s)
  useEnergy.setState({ totals: day.totals, soc: inp.realSoc ?? day.soc, evSoc: day.evSoc, at, fullDay: wholeDay(at, inp, s) })
  tick(0)
}

/** The day of `at` from midnight to midnight */
function wholeDay(at: number, inp: Inputs, s: Pick<EnergyState, 'spec' | 'smartEv'>) {
  return prefill(midnight(at) + 86_400_000 - 1, inp, s).totals
}

/** Refreshes the whole day now and then (a switched device changes the day too) */
let sinceDay = 0
function refreshDay() {
  if (++sinceDay < 25) return
  sinceDay = 0
  const s = useEnergy.getState()
  const ha = useHa.getState()
  const inp = readInputs(useLayout.getState().layout, ha.entities, s.spec, ha.source?.kind === 'live', s.at)
  useEnergy.setState({ fullDay: wholeDay(s.at, inp, s) })
}

/** Advances the clock by `realDt` ms and computes the flows */
function tick(realDt: number) {
  const s = useEnergy.getState()
  const { layout } = useLayout.getState()
  const ha = useHa.getState()
  let at = momentOf(s)
  let dt = realDt / 1000
  if (s.clock === 'sim' && s.playing) {
    dt *= s.speed
    at = s.simAt + dt * 1000
    useEnergy.setState({ simAt: at })
  }
  const inp = readInputs(layout, ha.entities, s.spec, ha.source?.kind === 'live', at)
  const pv = inp.realPv ?? solarPower(at, s.spec.pvPeak, inp.cloud)
  const f = step({ pv, home: inp.home, evWanted: inp.evWanted, smartEv: s.smartEv, soc: s.soc, evSoc: s.evSoc, spec: s.spec, dt: Math.max(dt, 0.001) })
  // A new day starts the totals again
  const totals = midnight(at) !== midnight(s.at) ? { ...ZERO } : { ...s.totals }
  if (dt > 0) add(totals, f, dt)
  useEnergy.setState({ flows: f, rooms: inp.rooms, soc: inp.realSoc ?? f.soc, evSoc: f.evSoc, totals, at, measured: inp.realPv != null })
  syncSun(at, s.clock === 'sim')
  if (s.open) refreshDay()
}

/** In the demo, a simulated day moves HA's sun with it, so the scene goes dark in the evening */
let sunAt = 0
function syncSun(at: number, simulated: boolean) {
  const src = useHa.getState().source
  if (src?.kind !== 'demo' || !src.inject) return
  if (!simulated && !useHa.getState().entities['sun.sun']) return
  if (Math.abs(at - sunAt) < 60_000) return
  sunAt = at
  const { elevation, azimuth } = approxSun(at, LAT)
  src.inject({
    entity_id: 'sun.sun',
    state: elevation > -0.8 ? 'above_horizon' : 'below_horizon',
    attributes: { elevation: Math.round(elevation * 10) / 10, azimuth: Math.round(azimuth * 10) / 10, friendly_name: 'Sun' },
    last_changed: new Date().toISOString(),
  })
}

let timer: ReturnType<typeof setInterval> | null = null
let last = 0

/** Starts the engine once (App); fast while the energy view is open, slow otherwise */
export function startEnergy() {
  if (timer) return () => {}
  last = performance.now()
  let slowCount = 0
  timer = setInterval(() => {
    const now = performance.now()
    const open = useEnergy.getState().open
    if (document.hidden) {
      last = now
      return
    }
    // Closed: once a second is enough for the tile
    if (!open && ++slowCount % 5 !== 0) return
    tick(now - last)
    last = now
  }, 200)
  // The first values right away (the plan and the entities arrive a moment after start)
  setTimeout(restart, 300)
  setTimeout(restart, 1500)
  if (START === 'play') setTimeout(() => useEnergy.getState().play(true), 1800)
  return () => {
    if (timer) clearInterval(timer)
    timer = null
  }
}

// Tests and demos drive the store through the page (a module imported from outside the app would be a second copy)
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __energy: { store: useEnergy, seasonal } })
