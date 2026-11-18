// Fixed windows regression test: the window card's Opens / Fixed switch, no hinge and direction controls and no flip
// bubble on a fixed window, the "Fixed window" card in the item bar, back to an opening window. Also the sliding glass
// door (width, the side that opens, no swing area), the double window (a sensor per sash) and the doorless wall opening
// (width, door height or up to the ceiling, a passage for the walk). `npm run dev` must be
// running first. Run: npm run check:windows   Screenshots: shots/windows-*.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.HOMESCAPE_URL ?? 'http://localhost:5190/'

mkdirSync('shots', { recursive: true })
let failures = 0
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, locale: 'en-US' })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
// Small test plan first: the hook is enough to start (waiting for the sample home to draw is slow on software GL)
await p.goto(BASE)
await p.waitForFunction(() => Boolean(window.__homescape?.getState), null, { timeout: 60_000 })

const ok = (c, m) => {
  if (!c) failures += 1
  console.log(`${c ? 'PASS ' : 'FAIL '} ${m}`)
}
const item = (id) => p.evaluate((id) => window.__homescape.getState().layout.layout.levels[0].items.find((i) => i.id === id), id)
const settle = () => p.waitForTimeout(700)

// One room with two windows in its back wall: one that opens and one that will become fixed
const plan = {
  version: 1,
  levels: [
    {
      id: 'lvl',
      name: 'Ground floor',
      elevation: 0,
      rooms: [{ id: 'living', name: 'Living room', floor: 'wood', x: 0, z: 0, w: 5, d: 4 }],
      items: [
        { id: 'w-open', kind: 'window', x: 1.4, z: 0.21, rot: 0 },
        { id: 'w-fixed', kind: 'window', x: 3.6, z: 0.21, rot: 0 },
      ],
    },
  ],
}
await p.evaluate((plan) => {
  const h = window.__homescape
  h.getState().layout.setLayout(plan)
  h.setTheme('day')
  h.setMode('edit')
  h.focusRoom('living')
}, plan)
await p.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 })
await p.waitForTimeout(2500)
await p.screenshot({ path: 'shots/windows-before.png' })

// --- The window card: Opens / Fixed, with hinge and direction while it opens ---
await p.evaluate(() => window.__homescape.select({ type: 'item', id: 'w-fixed' }))
await p.waitForSelector('#window-fixed')
let card = await p.textContent('#side-panel')
ok(/Opens/.test(card) && /Fixed/.test(card) && /Hinge/.test(card), 'An opening window shows Opens / Fixed plus the hinge and direction')
ok(Boolean(await p.$('[title="Flip the opening direction"]')), 'Its bubble has the flip button')

// --- Fixed: stored on the item, no hinge or direction, no flip button ---
await p.click('#window-fixed')
await settle()
ok((await item('w-fixed')).fixed === true, 'Fixed is stored on the item')
card = await p.textContent('#side-panel')
ok(!/Hinge/.test(card) && /does not open/.test(card), 'A fixed window hides the hinge and direction and says it does not open')
ok(!(await p.$('[title="Flip the opening direction"]')), 'A fixed window has no flip button')
ok((await item('w-open')).fixed === undefined, 'The other window still opens')
await p.evaluate(() => window.__homescape.select(null))
await settle()
await p.screenshot({ path: 'shots/windows-fixed.png' })

// --- A window sensor does not open a fixed window, and keeps opening the other one ---
// In View (no swing arcs) the opening sash swings into the room and the window gets deeper; the fixed one stays as it is
const depth = (id) => p.evaluate((id) => window.__homescape.itemObject(id).then((o) => o.size[2]), id)
const sensor = (state) => p.evaluate((state) => window.__homescape.setEntity({ entity_id: 'binary_sensor.test_window', state, attributes: { friendly_name: 'Test window', device_class: 'window' } }), state)
await sensor('off')
await p.evaluate(() => {
  const h = window.__homescape
  const L = h.getState().layout
  L.updateItem('w-open', { entityId: 'binary_sensor.test_window' })
  L.updateItem('w-fixed', { entityId: 'binary_sensor.test_window' })
  h.setMode('view')
})
await settle()
const shut = { open: await depth('w-open'), fixed: await depth('w-fixed') }
await sensor('on')
await p.waitForTimeout(1500)
const opened = { open: await depth('w-open'), fixed: await depth('w-fixed') }
ok(opened.open > shut.open + 0.05 && Math.abs(opened.fixed - shut.fixed) < 0.005, `An open window sensor opens the window that opens and leaves the fixed one shut (depth ${shut.open.toFixed(2)} -> ${opened.open.toFixed(2)} m, fixed ${shut.fixed.toFixed(2)} -> ${opened.fixed.toFixed(2)} m)`)
const tile = await p.evaluate(() => document.querySelector('#kpi-tiles')?.textContent ?? '')
ok(/1 open/.test(tile), 'The Doors / windows tile counts only the window that opens')
await p.screenshot({ path: 'shots/windows-sensor.png' })
await sensor('off')
await p.evaluate(() => window.__homescape.setMode('edit'))
await settle()

// --- Undo, back to Opens ---
await p.keyboard.press('ControlOrMeta+z')
await p.keyboard.press('ControlOrMeta+z')
await p.keyboard.press('ControlOrMeta+z')
await settle()
ok(!(await item('w-fixed')).fixed, 'Undo makes the window open again')
await p.evaluate(() => window.__homescape.select({ type: 'item', id: 'w-fixed' }))
await p.waitForSelector('#window-fixed')
await p.click('#window-fixed')
await settle()
await p.click('#window-opens')
await settle()
ok(!(await item('w-fixed')).fixed && /Hinge/.test(await p.textContent('#side-panel')), 'Opens brings back the hinge and direction')

// --- The item bar has a "Fixed window" card ---
await p.evaluate(() => window.__homescape.select(null))
await p.getByRole('button', { name: 'Doors and windows' }).first().click()
await settle()
const bar = await p.textContent('body')
await p.screenshot({ path: 'shots/windows-bar.png' })
ok(/Fixed window/.test(bar) && /does not open/.test(bar), 'The item bar offers a "Fixed window"')
ok(/Sliding glass door/.test(bar), 'The item bar offers a "Sliding glass door"')
ok(/Double window/.test(bar) && /opens on both sides/.test(bar), 'The item bar offers a "Double window"')

// --- Sliding glass door (GitHub issue #6): a door in the front wall becomes sliding, wider, without a swing area ---
await p.evaluate(() => {
  const L = window.__homescape.getState().layout
  L.addItems([{ id: 'd-slide', kind: 'door', x: 2.5, z: 3.79, rot: Math.PI }])
  window.__homescape.select({ type: 'item', id: 'd-slide' })
})
await p.waitForSelector('#door-sliding')
// A chair 60 cm in front of the door: in the swing of a hinged door, free in front of a sliding one
const chairFits = () =>
  p.evaluate(async () => {
    const rules = await import('/src/model/rules.ts')
    const lv = window.__homescape.getState().layout.layout.levels[0]
    return rules.checkItem(lv, { kind: 'chair', x: 2.5, z: 3.2, rot: 0 }).ok
  })
const hingedChair = await chairFits()
await p.click('#door-sliding')
await settle()
const slid = await item('d-slide')
const shape = await p.evaluate(async () => {
  const geo = await import('/src/model/geometry.ts')
  const it = window.__homescape.getState().layout.layout.levels[0].items.find((i) => i.id === 'd-slide')
  return { half: geo.apertureOf(it)?.half, card: document.querySelector('#side-panel')?.textContent ?? '' }
})
ok(slid.variant === 'sliding' && slid.len === 1.8 && Math.abs(shape.half - 0.9) < 1e-6, `Sliding glass makes a 1.8 m door with an opening as wide (half ${shape.half})`)
ok(/Door width/.test(shape.card) && /Side/.test(shape.card) && !/\bHinge\b/.test(shape.card), 'The sliding door card has the width and the side that opens, no hinge or swing direction')
ok(!hingedChair && (await chairFits()), 'A sliding door has no swing area: a chair can stand closer than in front of a hinged door')
await p.click('[title="Flip the opening direction"]')
await settle()
const flipped = await item('d-slide')
ok(flipped.hinge === 'right' && (flipped.swing ?? 'in') === 'in', 'The flip button switches the side that opens')
await p.locator('#len-d-slide').fill('2.4')
await settle()
ok((await item('d-slide')).len === 2.4, 'The width slider sets the door width')
await p.screenshot({ path: 'shots/windows-sliding.png' })
await p.click('#door-hinged')
await settle()
const back = await item('d-slide')
ok(!back.variant && back.len == null, 'Hinged makes it a 1 m hinged door again')

// --- Double window (GitHub issue #7): two sashes from the middle, each following its own sensor ---
// In the wall to a second room (an interior wall stays full height in View, so the window is not cut away)
await p.evaluate(() => {
  const h = window.__homescape
  const L = h.getState().layout
  L.addRoom({ name: 'Study', floor: 'wood', x: 5, z: 0, w: 3, d: 4 })
  L.addItems([{ id: 'w-double', kind: 'window', x: 4.79, z: 2, rot: -Math.PI / 2, len: 1.6 }])
  h.setMode('edit')
  h.select({ type: 'item', id: 'w-double' })
})
await p.waitForSelector('#window-double')
await p.click('#window-double')
await settle()
const dw = await item('w-double')
const dcard = await p.textContent('#side-panel')
ok(dw.double === true && !dw.fixed && /Left sash/.test(dcard) && /Right sash/.test(dcard) && !/\bHinge\b/.test(dcard), 'Double makes a two-sash window: the card shows both sashes and no hinge')
const win = (id, state) => p.evaluate(({ id, state }) => window.__homescape.setEntity({ entity_id: id, state, attributes: { friendly_name: id === 'binary_sensor.test_left' ? 'Left window' : 'Right window', device_class: 'window' } }), { id, state })
await win('binary_sensor.test_left', 'off')
await win('binary_sensor.test_right', 'off')
await p.evaluate(() => window.__homescape.getState().layout.updateItem('w-double', { entityId: 'binary_sensor.test_left', extras: ['binary_sensor.test_right'] }))
await settle()
const shown = await p.evaluate(() => [...document.querySelectorAll('#side-panel [data-sash-sensor]')].map((e) => e.getAttribute('data-sash-sensor')))
ok(shown[0] === 'binary_sensor.test_left' && shown[1] === 'binary_sensor.test_right' && (await p.isVisible('#window-swap-sashes')), 'The card shows the sensor of each sash and offers a swap')
await p.click('#window-swap-sashes')
await settle()
ok((await item('w-double')).entityId === 'binary_sensor.test_right', 'Swap sashes swaps the two sensors')
await p.evaluate(() => window.__homescape.getState().layout.updateItem('w-double', { entityId: 'binary_sensor.test_left', extras: ['binary_sensor.test_right'] }))
// A ray from 45 cm inside the room toward the wall, 40 cm to the left or right of the middle: an open sash is hit sooner
const probe = (side) =>
  p.evaluate(async (side) => {
    const h = window.__homescape
    const it = h.getState().layout.layout.levels[0].items.find((i) => i.id === 'w-double')
    const [nx, nz] = [Math.sin(it.rot), Math.cos(it.rot)]
    const [ax, az] = [Math.cos(it.rot), -Math.sin(it.rot)]
    const [lx, lz] = [it.x - nx * 0.21, it.z - nz * 0.21]
    const hit = await h.pick(lx + nx * 0.45 + ax * side * 0.4, 1.5, lz + nz * 0.45 + az * side * 0.4, -nx, 0, -nz)
    return hit?.itemId === 'w-double' ? +hit.distance.toFixed(3) : null
  }, side)
await p.evaluate(() => {
  window.__homescape.select(null)
  window.__homescape.setMode('view')
})
await settle()
const shutD = [await probe(-1), await probe(1)]
await win('binary_sensor.test_left', 'on')
await p.waitForTimeout(1500)
const leftD = [await probe(-1), await probe(1)]
await win('binary_sensor.test_left', 'off')
await win('binary_sensor.test_right', 'on')
await p.waitForTimeout(1500)
const rightD = [await probe(-1), await probe(1)]
const sooner = (a, b) => a != null && b != null && a < b - 0.08
const same = (a, b) => a != null && b != null && Math.abs(a - b) < 0.02
ok(sooner(leftD[0], shutD[0]) && same(leftD[1], shutD[1]) && sooner(rightD[1], shutD[1]) && same(rightD[0], shutD[0]), `Each sensor opens its own sash (shut ${shutD}, left open ${leftD}, right open ${rightD})`)
await win('binary_sensor.test_left', 'on')
await p.waitForTimeout(400)
const both = await p.evaluate(() => document.querySelector('#kpi-tiles')?.textContent ?? '')
ok(/1 open/.test(both), 'The Doors / windows tile counts a double window once with both sashes open')
// With one sensor both sashes follow it
await win('binary_sensor.test_right', 'off')
await p.evaluate(() => window.__homescape.getState().layout.updateItem('w-double', { extras: [] }))
await p.waitForTimeout(1500)
const oneD = [await probe(-1), await probe(1)]
ok(sooner(oneD[0], shutD[0]) && sooner(oneD[1], shutD[1]), `One sensor opens both sashes (${oneD})`)
await p.screenshot({ path: 'shots/windows-double.png' })
await win('binary_sensor.test_left', 'off')
await p.evaluate(() => window.__homescape.setMode('edit'))

// --- Doorless wall opening: a passage cut into a wall, as wide as set, up to the ceiling if wanted, nothing to open ---
await p.evaluate(() => {
  const h = window.__homescape
  const L = h.getState().layout
  // In the 4 m wall to the study (an interior wall stands at full height), in place of the double window
  L.deleteItem('w-double')
  L.addItems([{ id: 'd-open', kind: 'door', x: 4.79, z: 2, rot: -Math.PI / 2 }])
  h.setMode('edit')
  h.select({ type: 'item', id: 'd-open' })
})
await p.waitForSelector('#door-opening')
await p.click('#door-opening')
await settle()
const cut = () =>
  p.evaluate(async () => {
    const geo = await import('/src/model/geometry.ts')
    const fps = await import('/src/scene/fps.ts')
    const lv = window.__homescape.getState().layout.layout.levels[0]
    const it = lv.items.find((i) => i.id === 'd-open')
    const room = lv.rooms.find((r) => r.name === 'Living room')
    const run = geo.wallRuns(room, lv.rooms).find((r) => !r.horizontal && Math.abs(r.line - 5) < 1e-6)
    const ops = run ? geo.runOpenings(run, lv.items) : []
    // Walk colliders on the wall line x = 5 that cross the opening's middle
    const blocked = fps.buildColliders(lv).segs.some((g) => Math.abs(g.x1 - 5) < 0.06 && Math.abs(g.x2 - 5) < 0.06 && Math.min(g.z1, g.z2) < it.z && Math.max(g.z1, g.z2) > it.z)
    return { it, ops, blocked, card: document.querySelector('#side-panel')?.textContent ?? '', flip: Boolean(document.querySelector('[title="Flip the opening direction"]')) }
  })
let hole = await cut()
const span = (o) => (o ? o.a1 - o.a0 : 0)
ok(hole.it.variant === 'opening' && hole.it.len === 1.2 && hole.ops.length === 1 && Math.abs(span(hole.ops[0]) - 1.2) < 1e-6 && Math.abs(hole.ops[0].y1 - 2.23) < 1e-6, `Opening cuts a 1.2 m passage at door height (${span(hole.ops[0]).toFixed(2)} m to ${hole.ops[0]?.y1} m)`)
ok(!hole.blocked, 'Walk mode passes through the opening: no collider across it')
ok(!hole.flip && /Door height/.test(hole.card) && /Up to the ceiling/.test(hole.card) && /Width/.test(hole.card) && !/\bHinge\b/.test(hole.card) && !/\bSide\b/.test(hole.card), 'The opening card has a width and a height; no hinge, side or flip button')
await p.locator('#len-d-open').fill('3')
await settle()
hole = await cut()
ok(Math.abs(span(hole.ops[0]) - 3) < 1e-6, `The width slider widens it: the 4 m wall keeps 1 m (${span(hole.ops[0]).toFixed(2)} m open)`)
// A ray at 2.45 m through the opening from the living room: it hits the wall above a door-height opening, not a full-height one
const above = async () => {
  await p.evaluate(() => window.__homescape.setMode('view'))
  await settle()
  const h = await p.evaluate(() => window.__homescape.pick(4, 2.45, 2, 1, 0, 0))
  await p.evaluate(() => {
    window.__homescape.setMode('edit')
    window.__homescape.select({ type: 'item', id: 'd-open' })
  })
  await settle()
  return h
}
const lintel = await above()
await p.click('#opening-full-height')
await settle()
hole = await cut()
const clear = await above()
ok(lintel && lintel.distance < 1.2 && Math.abs(hole.ops[0].y1 - 2.6) < 1e-6 && (!clear || clear.distance > 1.2), `Up to the ceiling leaves no wall above it (wall above at ${lintel?.distance?.toFixed(2)} m, then ${clear ? clear.distance.toFixed(2) + ' m' : 'nothing'})`)
await p.screenshot({ path: 'shots/windows-opening.png' })
await p.evaluate(() => window.__homescape.select(null))
await p.getByRole('button', { name: 'Doors and windows' }).first().click()
await settle()
const bar2 = await p.textContent('body')
ok(/Wall opening/.test(bar2) && /no door/.test(bar2), 'The item bar offers a "Wall opening"')
ok(/Double garage door/.test(bar2) && /two cars wide/.test(bar2), 'The item bar offers a "Double garage door"')

// --- Garage door width (GitHub issue #10): from a single 2.4 m door to a double one for two cars; the wall cut, walking,
// pets and the cars inside follow the width ---
await p.evaluate(() => {
  const h = window.__homescape
  const L = h.getState().layout
  L.addRoom({ name: 'Garage', floor: 'concrete', x: 30, z: 0, w: 7, d: 6, type: 'garage' })
  L.addRoom({ name: 'Drive', floor: 'concrete', x: 30, z: 6, w: 7, d: 4, type: 'garden' })
  L.addItems([{ id: 'gd', kind: 'garageDoor', x: 33.5, z: 5.79, rot: Math.PI }])
  h.setMode('edit')
  h.select({ type: 'item', id: 'gd' })
})
await p.waitForSelector('#len-gd')
await settle()
const garage = () =>
  p.evaluate(async () => {
    const geo = await import('/src/model/geometry.ts')
    const fps = await import('/src/scene/fps.ts')
    const pets = await import('/src/model/pets.ts')
    const rules = await import('/src/model/rules.ts')
    const lv = window.__homescape.getState().layout.layout.levels[0]
    const it = lv.items.find((i) => i.id === 'gd')
    const room = lv.rooms.find((r) => r.name === 'Garage')
    const run = geo.wallRuns(room, lv.rooms).find((r) => r.horizontal && Math.abs(r.line - 6) < 1e-6)
    const ops = run ? geo.runOpenings(run, lv.items) : []
    // 2 m to the right of the door's middle: a wall beside a single door, inside a double one
    const x = it.x + 2
    const walkBlocked = fps.buildColliders(lv).segs.some((g) => Math.abs(g.z1 - 6) < 0.06 && Math.abs(g.z2 - 6) < 0.06 && Math.min(g.x1, g.x2) < x && Math.max(g.x1, g.x2) > x)
    const dogPasses = pets.lineFree(pets.buildPetGrid(lv, 'dog'), { x, z: 5.2 }, { x, z: 6.8 }, true)
    // Two cars side by side behind the door, nose to the door
    const car = (cx) => rules.checkItem(lv, { kind: 'car', x: cx, z: 3, rot: Math.PI }, undefined)
    return { it, half: geo.apertureOf(it)?.half, ops, walkBlocked, dogPasses, cars: [car(it.x - 1.25), car(it.x + 1.25)].map((c) => c.ok) }
  })
let gd = await garage()
const gdCard = await p.textContent('#side-panel')
ok(/Door width/.test(gdCard) && gd.half === 1.2 && gd.ops.length === 1 && Math.abs(span(gd.ops[0]) - 2.4) < 1e-6 && gd.walkBlocked && !gd.dogPasses, `A garage door is 2.4 m wide by default, its card has a width (${span(gd.ops[0]).toFixed(2)} m cut; 2 m from its middle the wall stops walking and the dog)`)
await p.locator('#len-gd').fill('4.8')
await settle()
gd = await garage()
ok(gd.it.len === 4.8 && gd.half === 2.4 && Math.abs(span(gd.ops[0]) - 4.8) < 1e-6, `The width slider makes it a double door: the wall cut follows (${span(gd.ops[0]).toFixed(2)} m)`)
ok(!gd.walkBlocked && gd.dogPasses, 'Walking and the dog pass through the whole width of the double door')
ok(gd.cars.every(Boolean), `Two cars park side by side behind the double door (${gd.cars.join(', ')})`)
const gdSize = await p.evaluate(() => window.__homescape.itemObject('gd').then((o) => o.size[0]))
ok(gdSize > 4.9 && gdSize < 5.4, `The door is drawn as wide as set, frame included (${gdSize.toFixed(2)} m)`)
await p.evaluate(() => {
  window.__homescape.select(null)
  window.__homescape.setMode('view')
  window.__homescape.focusRoom(window.__homescape.getState().layout.layout.levels[0].rooms.find((r) => r.name === 'Garage').id)
})
await p.waitForTimeout(1500)
await p.screenshot({ path: 'shots/windows-garage-double.png' })

ok(errors.length === 0, `No page errors (${errors.slice(0, 3).join(' / ')})`)
await b.close()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll window checks passed')
process.exit(failures ? 1 : 0)
