/*
 * Texts of the energy layer. The layer targets the Hungarian and Austrian market first, so it carries its own small
 * dictionary (Hungarian, German, English) instead of the app's 14-language t(): Hungarian has no app locale yet.
 * Language: ?lang=hu|de|en in the URL, else the device language, else Hungarian.
 */

type Key = keyof typeof EN

const EN = {
  energy: 'Energy',
  energyFlow: 'Energy flow',
  simulated: 'Simulation',
  live: 'Live',
  solar: 'Solar',
  home: 'Home',
  battery: 'Battery',
  grid: 'Grid',
  car: 'Car',
  fromGrid: 'buying',
  toGrid: 'selling',
  charging: 'charging',
  discharging: 'discharging',
  idle: 'idle',
  today: 'Today',
  produced: 'Produced',
  used: 'Used',
  bought: 'Bought',
  sold: 'Sold',
  selfShare: 'Self-sufficiency',
  monthEstimate: 'Monthly bill, a month of days like this',
  withoutSolar: 'Without solar',
  withSystem: 'With this system',
  saving: 'Saving',
  perMonth: '/ month',
  quota: 'Discounted quota',
  quotaOver: 'over the quota: market price',
  quotaUnder: 'within the quota',
  time: 'Time of day',
  play: 'Play the day',
  pause: 'Pause',
  now: 'Now',
  season: 'Season',
  seasonToday: 'Today',
  seasonSummer: 'Summer',
  seasonWinter: 'Winter',
  smartEv: 'Smart charging: solar only',
  smartEvHint: 'The car charges only from surplus solar power',
  evOn: 'Car charger',
  rooms: 'Rooms using the most',
  close: 'Close',
  tariffNote: 'Estimated 2026 retail prices: 36.9 Ft/kWh within 210 kWh/month, 70.1 Ft/kWh above, 5 Ft/kWh feed-in (gross settlement).',
  openEnergy: 'Open the energy view',
  nothing: 'No solar, battery or meter in this plan yet: add them in Edit (Smart devices, Garden) to see the flows.',
} as const

const HU: Record<Key, string> = {
  energy: 'Energia',
  energyFlow: 'Energiaáramlás',
  simulated: 'Szimuláció',
  live: 'Élő',
  solar: 'Napelem',
  home: 'Ház',
  battery: 'Akku',
  grid: 'Hálózat',
  car: 'Autó',
  fromGrid: 'vételezés',
  toGrid: 'betáplálás',
  charging: 'töltődik',
  discharging: 'merül',
  idle: 'áll',
  today: 'Ma',
  produced: 'Termelt',
  used: 'Fogyasztott',
  bought: 'Vásárolt',
  sold: 'Betáplált',
  selfShare: 'Önellátás',
  monthEstimate: 'Havi számla, ha minden nap ilyen',
  withoutSolar: 'Napelem nélkül',
  withSystem: 'Ezzel a rendszerrel',
  saving: 'Megtakarítás',
  perMonth: '/ hó',
  quota: 'Kedvezményes keret',
  quotaOver: 'kereten felül: piaci ár',
  quotaUnder: 'kereten belül',
  time: 'Napszak',
  play: 'Nap lejátszása',
  pause: 'Szünet',
  now: 'Most',
  season: 'Évszak',
  seasonToday: 'Ma',
  seasonSummer: 'Nyár',
  seasonWinter: 'Tél',
  smartEv: 'Okos töltés: csak napból',
  smartEvHint: 'Az autó csak a napelem többletéből töltődik',
  evOn: 'Autótöltő',
  rooms: 'Legtöbbet fogyasztó szobák',
  close: 'Bezárás',
  tariffNote: 'Becsült 2026-os lakossági árak: 36,9 Ft/kWh havi 210 kWh-ig, felette 70,1 Ft/kWh, betáplálás 5 Ft/kWh (bruttó elszámolás).',
  openEnergy: 'Energia nézet megnyitása',
  nothing: 'Ebben a tervben még nincs napelem, akku vagy mérő: Szerkesztés módban add hozzá őket (Smart devices, Garden), és megjelennek az áramlások.',
}

const DE: Record<Key, string> = {
  energy: 'Energie',
  energyFlow: 'Energiefluss',
  simulated: 'Simulation',
  live: 'Live',
  solar: 'Solar',
  home: 'Haus',
  battery: 'Speicher',
  grid: 'Netz',
  car: 'Auto',
  fromGrid: 'Bezug',
  toGrid: 'Einspeisung',
  charging: 'lädt',
  discharging: 'entlädt',
  idle: 'Ruhe',
  today: 'Heute',
  produced: 'Erzeugt',
  used: 'Verbraucht',
  bought: 'Bezogen',
  sold: 'Eingespeist',
  selfShare: 'Autarkie',
  monthEstimate: 'Monatsrechnung bei Tagen wie diesem',
  withoutSolar: 'Ohne PV',
  withSystem: 'Mit dieser Anlage',
  saving: 'Ersparnis',
  perMonth: '/ Monat',
  quota: 'Vergünstigtes Kontingent',
  quotaOver: 'über dem Kontingent: Marktpreis',
  quotaUnder: 'im Kontingent',
  time: 'Tageszeit',
  play: 'Tag abspielen',
  pause: 'Pause',
  now: 'Jetzt',
  season: 'Jahreszeit',
  seasonToday: 'Heute',
  seasonSummer: 'Sommer',
  seasonWinter: 'Winter',
  smartEv: 'Smartes Laden: nur Sonne',
  smartEvHint: 'Das Auto lädt nur mit überschüssigem Solarstrom',
  evOn: 'Wallbox',
  rooms: 'Räume mit dem höchsten Verbrauch',
  close: 'Schließen',
  tariffNote: 'Geschätzte ungarische Haushaltspreise 2026: 36,9 Ft/kWh bis 210 kWh/Monat, darüber 70,1 Ft/kWh, Einspeisung 5 Ft/kWh.',
  openEnergy: 'Energieansicht öffnen',
  nothing: 'In diesem Plan gibt es noch keine PV, keinen Speicher und keinen Zähler: im Bearbeiten-Modus hinzufügen.',
}

export type EnergyLang = 'hu' | 'de' | 'en'

function pickLang(): EnergyLang {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'hu' || q === 'de' || q === 'en') return q
    for (const tag of navigator.languages ?? []) {
      const b = tag.toLowerCase().slice(0, 2)
      if (b === 'hu' || b === 'de' || b === 'en') return b
    }
  } catch {
    /* no window (tests) */
  }
  return 'hu'
}

export const ENERGY_LANG = pickLang()
const DICT: Record<EnergyLang, Record<Key, string>> = { hu: HU, de: DE, en: EN }
const LOCALE: Record<EnergyLang, string> = { hu: 'hu-HU', de: 'de-AT', en: 'en-GB' }

/** Energy layer text */
export const et = (k: Key) => DICT[ENERGY_LANG][k]

const nf = (d: number) => new Intl.NumberFormat(LOCALE[ENERGY_LANG], { minimumFractionDigits: d, maximumFractionDigits: d })
const F0 = nf(0)
const F1 = nf(1)

/** Power: below 1 kW in W, else kW with one decimal */
export const fmtW = (w: number) => (Math.abs(w) < 950 ? `${F0.format(Math.round(w / 10) * 10)} W` : `${F1.format(w / 1000)} kW`)
export const fmtKwh = (kwh: number) => `${(kwh < 10 ? F1 : F0).format(kwh)} kWh`
export const fmtFt = (ft: number) => `${F0.format(Math.round(ft / 10) * 10)} Ft`
export const fmtPct = (p: number) => `${F0.format(Math.round(p * 100))}%`
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE[ENERGY_LANG], { hour: '2-digit', minute: '2-digit' })
