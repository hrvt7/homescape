import { BatteryCharging, Car, ChevronDown, Clock, House, Leaf, Pause, Play, Sun, UtilityPole, X, Zap, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { registerEnergyLabel } from '@/energy/labels'
import { useEnergy, type Season } from '@/energy/store'
import { HU_2026, monthFromDay } from '@/energy/tariff'
import { et, fmtFt, fmtKwh, fmtPct, fmtTime, fmtW } from '@/energy/text'
import type { Node } from '@/energy/graph'
import { useLayout } from '@/model/layoutStore'
import { WIDE_PX } from './panelState'

/*
 * Energy view: a tile that opens it, the panel (live power, the day player, today's totals, the monthly bill in forints)
 * and the labels above the solar panels, battery, car charger and grid in the scene (scene/EnergyFlow.tsx).
 */

const seg = (on: boolean) =>
  `min-h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-[12.5px] font-semibold transition-colors ${on ? 'bg-brand text-white' : 'bg-surface-2 text-ink-2 hover:bg-surface hover:text-ink'}`

/** Which parts of the energy system the plan has */
function useParts() {
  const layout = useLayout((s) => s.layout)
  return useMemo(() => {
    const kinds = new Set(layout?.levels.flatMap((l) => l.items.map((i) => i.kind)) ?? [])
    return { solar: kinds.has('solarPanel') || kinds.has('solarInverter'), battery: kinds.has('homeBattery'), ev: kinds.has('evCharger'), any: kinds.has('solarPanel') || kinds.has('solarInverter') || kinds.has('homeBattery') || kinds.has('powerMeter') }
  }, [layout])
}

/** KPI tile: solar now and the grid direction; opens the energy view */
export function EnergyTile() {
  const open = useEnergy((s) => s.open)
  const pv = useEnergy((s) => s.flows?.pv ?? 0)
  const grid = useEnergy((s) => s.flows?.grid ?? 0)
  const setOpen = useEnergy((s) => s.setOpen)
  return (
    <button
      type="button"
      id="kpi-energy"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      title={et('openEnergy')}
      className={`glass flex items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 text-left xl:gap-3 xl:py-2.5 xl:pl-2.5 xl:pr-4 ${open ? 'ring-2 ring-sun' : ''}`}
    >
      <div className={`grid size-9 place-items-center rounded-xl xl:size-11 ${pv > 30 ? 'bg-sun-50 text-sun' : 'icon-tile'}`}>
        <Zap className="size-[18px] xl:size-5" strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <p className="text-[12px] font-medium text-ink-2">{et('energy')}</p>
        <p className="font-mono text-[16px] font-semibold tabular-nums xl:text-[19px]">{fmtW(pv)}</p>
        <p className="hidden text-[11px] text-ink-3 xl:block">
          {et('grid')}: {grid >= 0 ? et('fromGrid') : et('toGrid')} {fmtW(Math.abs(grid))}
        </p>
      </div>
    </button>
  )
}

/** Phones have no KPI tiles: a round button opens the energy view; the panel then lies over the bottom sheet */
export function EnergyFab() {
  const open = useEnergy((s) => s.open)
  if (open) return null
  return (
    <button
      type="button"
      id="energy-fab"
      onClick={() => useEnergy.getState().setOpen(true)}
      aria-label={et('openEnergy')}
      className="glass pointer-events-auto absolute left-3 top-3 z-30 grid size-11 place-items-center rounded-2xl text-sun lg:hidden"
    >
      <Zap className="size-5" strokeWidth={2.4} />
    </button>
  )
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5">
      <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-4" strokeWidth={2.3} />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[11px] font-medium text-ink-2">{label}</p>
        <p className="truncate font-mono text-[14px] font-semibold tabular-nums">{value}</p>
        {sub && <p className="truncate text-[10.5px] text-ink-3">{sub}</p>}
      </div>
    </div>
  )
}

const dayMinutes = (at: number) => {
  const d = new Date(at)
  return d.getHours() * 60 + d.getMinutes()
}

function DayPlayer() {
  const at = useEnergy((s) => s.at)
  const clock = useEnergy((s) => s.clock)
  const playing = useEnergy((s) => s.playing)
  const season = useEnergy((s) => s.season)
  const { scrub, play, backToNow, setSeason } = useEnergy.getState()
  const seasons: [Season, string][] = [
    ['today', et('seasonToday')],
    ['summer', et('seasonSummer')],
    ['winter', et('seasonWinter')],
  ]
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <button type="button" id="energy-play" onClick={() => play(!playing)} className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-label={playing ? et('pause') : et('play')} title={playing ? et('pause') : et('play')}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <input
          id="energy-time"
          type="range"
          min={0}
          max={1439}
          step={5}
          value={dayMinutes(at)}
          aria-label={et('time')}
          onChange={(e) => {
            // Same day as shown, another time of day
            const d = new Date(at)
            d.setHours(0, Number(e.target.value), 0, 0)
            scrub(d.getTime())
          }}
          className="min-w-0 flex-1 accent-[var(--brand)]"
        />
        <span className="w-12 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums">{fmtTime(at)}</span>
        <button type="button" id="energy-now" onClick={backToNow} disabled={clock === 'now'} className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 disabled:opacity-40" aria-label={et('now')} title={et('now')}>
          <Clock className="size-4" />
        </button>
      </div>
      <div className="flex gap-1.5" role="group" aria-label={et('season')}>
        {seasons.map(([k, label]) => (
          <button key={k} type="button" data-season={k} onClick={() => setSeason(k)} className={seg(season === k)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MonthBill() {
  const totals = useEnergy((s) => s.fullDay)
  const m = monthFromDay({ load: totals.load, imported: totals.imported, exported: totals.exported })
  const share = Math.min(1, m.importKwh / HU_2026.quotaKwh)
  const over = m.importKwh > HU_2026.quotaKwh
  const loadShare = Math.min(1, m.loadKwh / (HU_2026.quotaKwh * 2))
  return (
    <div className="grid gap-2 rounded-xl bg-surface-2 p-2.5">
      <p className="text-[11.5px] font-semibold text-ink-2">{et('monthEstimate')}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-ink-3">{et('withoutSolar')}</p>
          <p className="font-mono text-[15px] font-semibold tabular-nums text-ink-2 line-through decoration-miss/60">{fmtFt(m.without)}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-3">{et('withSystem')}</p>
          <p className="font-mono text-[15px] font-semibold tabular-nums">{fmtFt(Math.max(0, m.with))}</p>
        </div>
      </div>
      <div className="flex items-baseline justify-between rounded-lg bg-ok-50 px-2.5 py-1.5 text-ok">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Leaf className="size-3.5" />
          {et('saving')}
        </span>
        <span id="energy-saving" className="font-mono text-[18px] font-bold tabular-nums">
          {fmtFt(Math.max(0, m.saving))} <span className="text-[11px] font-semibold">{et('perMonth')}</span>
        </span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-ink-3">
          <span>
            {et('quota')} ({fmtKwh(HU_2026.quotaKwh)})
          </span>
          <span className={over ? 'font-semibold text-warn' : 'text-ok'}>{over ? et('quotaOver') : et('quotaUnder')}</span>
        </div>
        {/* Two bars: the month without solar (faint) and the grid energy bought with the system */}
        <div className="relative h-2.5 overflow-hidden rounded-full bg-line">
          <div className="absolute inset-y-0 left-0 rounded-full bg-miss/25" style={{ width: `${loadShare * 100}%` }} />
          <div className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${share * 50}%` }} />
          <div className="absolute inset-y-0 left-1/2 w-px bg-ink-3" />
        </div>
        <p className="mt-1 text-[10.5px] text-ink-3">
          {fmtKwh(m.importKwh)} / {fmtKwh(m.loadKwh)}
        </p>
      </div>
    </div>
  )
}

export default function EnergyPanel() {
  const open = useEnergy((s) => s.open)
  const f = useEnergy((s) => s.flows)
  const soc = useEnergy((s) => s.soc)
  const evSoc = useEnergy((s) => s.evSoc)
  const totals = useEnergy((s) => s.totals)
  const smartEv = useEnergy((s) => s.smartEv)
  const measured = useEnergy((s) => s.measured)
  const clock = useEnergy((s) => s.clock)
  const parts = useParts()
  // Phones show the live values and the player; the day and the bill fold out (the house stays visible)
  const [more, setMore] = useState(() => window.innerWidth >= WIDE_PX)
  const fullDay = useEnergy((s) => s.fullDay)
  if (!open) return null
  const saving = monthFromDay({ load: fullDay.load, imported: fullDay.imported, exported: fullDay.exported }).saving
  const self = totals.load > 0 ? Math.max(0, Math.min(1, 1 - totals.imported / totals.load)) : 0
  const bat = f?.battery ?? 0
  const grid = f?.grid ?? 0
  return (
    <section
      id="energy-panel"
      aria-label={et('energyFlow')}
      className="glass pointer-events-auto absolute bottom-[84px] left-3 z-[45] grid lg:z-30 max-h-[calc(100%-110px)] w-[min(352px,calc(100%-24px))] gap-2.5 overflow-y-auto rounded-2xl p-3 lg:bottom-auto lg:left-4 lg:top-[96px] xl:top-[104px]"
    >
      <header className="flex items-center gap-2">
        <Zap className="size-4 text-sun" strokeWidth={2.4} />
        <h2 className="flex-1 text-[14px] font-semibold">{et('energyFlow')}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${measured && clock === 'now' ? 'bg-ok-50 text-ok' : 'bg-brand-50 text-brand'}`}>{measured && clock === 'now' ? et('live') : et('simulated')}</span>
        <button type="button" onClick={() => useEnergy.getState().setOpen(false)} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={et('close')}>
          <X className="size-4" />
        </button>
      </header>
      {!parts.any && <p className="rounded-xl bg-warn-50 p-2.5 text-[12px] text-warn">{et('nothing')}</p>}
      <div className="grid grid-cols-2 gap-1.5">
        <Stat icon={Sun} label={et('solar')} value={fmtW(f?.pv ?? 0)} tone="bg-sun-50 text-sun" />
        <Stat icon={House} label={et('home')} value={fmtW(f?.home ?? 0)} tone="bg-brand-50 text-brand" />
        {parts.battery && (
          <Stat icon={BatteryCharging} label={et('battery')} value={fmtPct(soc)} sub={`${Math.abs(bat) < 30 ? et('idle') : bat > 0 ? et('charging') : et('discharging')} ${Math.abs(bat) < 30 ? '' : fmtW(Math.abs(bat))}`} tone="bg-ok-50 text-ok" />
        )}
        <Stat icon={UtilityPole} label={et('grid')} value={fmtW(Math.abs(grid))} sub={Math.abs(grid) < 30 ? et('idle') : grid > 0 ? et('fromGrid') : et('toGrid')} tone={grid > 30 ? 'bg-miss-50 text-miss' : 'bg-ok-50 text-ok'} />
        {parts.ev && <Stat icon={Car} label={et('car')} value={fmtW(f?.ev ?? 0)} sub={fmtPct(evSoc)} tone="bg-surface text-ink-2" />}
      </div>
      {parts.ev && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 py-2" title={et('smartEvHint')}>
          <input id="energy-smart-ev" type="checkbox" checked={smartEv} onChange={(e) => useEnergy.getState().setSmartEv(e.target.checked)} className="size-4 accent-[var(--ok)]" />
          <span className="leading-tight">
            <span className="block text-[12.5px] font-semibold">{et('smartEv')}</span>
            <span className="block text-[10.5px] text-ink-3">{et('smartEvHint')}</span>
          </span>
        </label>
      )}
      <DayPlayer />
      {!more && (
        <button type="button" id="energy-more" onClick={() => setMore(true)} className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-ok-50 text-[12.5px] font-semibold text-ok">
          <Leaf className="size-3.5" />
          {et('saving')}: {fmtFt(Math.max(0, saving))} {et('perMonth')}
          <ChevronDown className="size-4" />
        </button>
      )}
      {more && (
        <>
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          [et('produced'), totals.pv],
          [et('used'), totals.load],
          [et('bought'), totals.imported],
          [et('sold'), totals.exported],
        ].map(([label, kwh]) => (
          <div key={label as string} className="rounded-lg bg-surface-2 px-1 py-1.5">
            <p className="truncate text-[10.5px] text-ink-3">{label}</p>
            <p className="font-mono text-[12.5px] font-semibold tabular-nums">{fmtKwh(kwh as number)}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-1 text-[12px]">
        <span className="text-ink-2">
          {et('today')} · {et('selfShare')}
        </span>
        <span className="font-mono font-semibold tabular-nums text-ok">{fmtPct(self)}</span>
      </div>
      <MonthBill />
      <p className="px-1 text-[10px] leading-snug text-ink-3">{et('tariffNote')}</p>
        </>
      )}
    </section>
  )
}

/** Pills above the parts of the system in the scene */
export function EnergyLabels() {
  const open = useEnergy((s) => s.open)
  const f = useEnergy((s) => s.flows)
  const soc = useEnergy((s) => s.soc)
  const parts = useParts()
  if (!open || !f) return null
  const grid = f.grid
  const items: { id: Node['id']; icon: LucideIcon; text: string; tone: string; show: boolean }[] = [
    { id: 'solar', icon: Sun, text: fmtW(f.pv), tone: 'text-sun', show: parts.solar },
    { id: 'battery', icon: BatteryCharging, text: `${fmtPct(soc)}${Math.abs(f.battery) >= 30 ? ` · ${f.battery > 0 ? '+' : '-'}${fmtW(Math.abs(f.battery))}` : ''}`, tone: 'text-ok', show: parts.battery },
    { id: 'ev', icon: Car, text: fmtW(f.ev), tone: 'text-ink-2', show: parts.ev },
    { id: 'grid', icon: UtilityPole, text: `${Math.abs(grid) < 30 ? '0 W' : `${grid > 0 ? '↓' : '↑'} ${fmtW(Math.abs(grid))}`}`, tone: grid > 30 ? 'text-miss' : 'text-ok', show: true },
    { id: 'home', icon: House, text: fmtW(f.home), tone: 'text-brand', show: true },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 z-[29] overflow-hidden">
      {items
        .filter((i) => i.show)
        .map(({ id, icon: Icon, text, tone }) => (
          <div key={id} ref={(el) => registerEnergyLabel(id, el)} data-energy-label={id} className="glass absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-semibold shadow-sm" style={{ visibility: 'hidden' }}>
            <Icon className={`size-3.5 ${tone}`} strokeWidth={2.4} />
            <span className="font-mono tabular-nums">{text}</span>
          </div>
        ))}
    </div>
  )
}
