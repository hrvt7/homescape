import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { energyGraph, SOURCE_COLOR, type Strand } from '@/energy/graph'
import { labelEls, nodePos } from '@/energy/labels'
import { useEnergy } from '@/energy/store'
import { rectsOf } from '@/model/geometry'
import { activeLevel, useLayout } from '@/model/layoutStore'
import type { Room } from '@/model/types'
import { useAmbient } from './kit/effects'
import { useView } from './camera'

/*
 * Energy layer in the scene (energy/store.ts open): glowing arcs from the solar panels, the battery and the grid to the
 * hub and from there into the rooms that use power, with pulses running along them (more and faster with more power), and
 * a warm tint on the floor of rooms by their consumption. Arcs rise above the walls so they read from any angle.
 */

const MAX = 420
const v = new THREE.Vector3()
const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const sc = new THREE.Vector3()
const col = new THREE.Color()

const curveOf = (s: Strand) => {
  const a = new THREE.Vector3(...s.from)
  const b = new THREE.Vector3(...s.to)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  mid.y = Math.max(a.y, b.y) + s.lift
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

/** Pulses per strand and their speed (curve lengths per second) from the power */
const pulses = (w: number) => Math.round(Math.min(26, 3 + w / 260))
const speedOf = (w: number, len: number) => (0.55 + Math.min(2.2, w / 2600)) / Math.max(2, len)

function Arcs({ strands }: { strands: Strand[] }) {
  // Geometry only changes when a strand appears, goes or its ends move; the power changes every tick
  const key = strands.map((s) => `${s.id}:${s.from.join(',')}:${s.to.join(',')}:${s.lift.toFixed(1)}`).join('|')
  const curves = useMemo(() => strands.map((s) => ({ id: s.id, curve: curveOf(s) })), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const tubes = useMemo(() => curves.map((c) => new THREE.TubeGeometry(c.curve, 48, 0.022, 6, false)), [curves])
  useEffect(() => () => tubes.forEach((g) => g.dispose()), [tubes])
  const live = useRef(strands)
  useLayoutEffect(() => {
    live.current = strands
  }, [strands])
  const core = useRef<THREE.InstancedMesh>(null)
  const halo = useRef<THREE.InstancedMesh>(null)
  const lengths = useMemo(() => curves.map((c) => c.curve.getLength()), [curves])

  useFrame(({ clock }) => {
    const a = core.current
    const h = halo.current
    if (!a || !h) return
    const t = clock.elapsedTime
    let n = 0
    curves.forEach((c, ci) => {
      const s = live.current.find((x) => x.id === c.id)
      if (!s) return
      const count = pulses(s.watts)
      const sp = speedOf(s.watts, lengths[ci])
      const size = 0.06 + Math.min(0.07, s.watts / 90000)
      col.set(SOURCE_COLOR[s.source])
      for (let i = 0; i < count && n < MAX; i++, n++) {
        const u = (t * sp + i / count) % 1
        c.curve.getPoint(u, v)
        // Pulses grow in the middle of the arc and shrink at the ends
        const k = size * (0.55 + Math.sin(u * Math.PI) * 0.6)
        m.compose(v, q, sc.set(k, k, k))
        a.setMatrixAt(n, m)
        a.setColorAt(n, col)
        m.compose(v, q, sc.set(k * 2.6, k * 2.6, k * 2.6))
        h.setMatrixAt(n, m)
        h.setColorAt(n, col)
      }
    })
    a.count = n
    h.count = n
    a.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    if (a.instanceColor) a.instanceColor.needsUpdate = true
    if (h.instanceColor) h.instanceColor.needsUpdate = true
  })

  return (
    <group>
      {curves.map((c, i) => {
        const s = strands.find((x) => x.id === c.id)
        return (
          <mesh key={c.id} geometry={tubes[i]} renderOrder={5}>
            <meshBasicMaterial color={SOURCE_COLOR[s?.source ?? 'mix']} transparent opacity={0.38} depthWrite={false} toneMapped={false} />
          </mesh>
        )
      })}
      <instancedMesh ref={core} args={[undefined, undefined, MAX]} frustumCulled={false} renderOrder={6}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={halo} args={[undefined, undefined, MAX]} frustumCulled={false} renderOrder={6}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </group>
  )
}

/** Floor tint by consumption: pale yellow from 20 W to deep orange at 2 kW */
function RoomHeat({ room, watts }: { room: Room; watts: number }) {
  const k = Math.min(1, Math.max(0, (watts - 20) / 2000))
  const color = useMemo(() => new THREE.Color('#ffe08a').lerp(new THREE.Color('#ff5a2c'), Math.sqrt(k)), [k])
  return (
    <>
      {rectsOf(room).map((r, i) => (
        <mesh key={i} position={[r.x + r.w / 2, 0.035, r.z + r.d / 2]} rotation-x={-Math.PI / 2} renderOrder={2}>
          <planeGeometry args={[r.w - 0.12, r.d - 0.12]} />
          <meshBasicMaterial color={color} transparent opacity={0.22 + k * 0.3} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </>
  )
}

/** The car charger usually hangs next to the battery: their labels open to opposite sides so both read */
const ANCHOR: Partial<Record<string, string>> = { ev: 'translate(-100%, -100%) translate(-6px, 0)', battery: 'translate(6px, -100%)' }

/** Projects the graph points to the DOM labels (ui/EnergyLabels.tsx) */
function LabelSync() {
  const p = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const [id, el] of labelEls) {
      const at = nodePos.get(id)
      if (!at) {
        el.style.visibility = 'hidden'
        continue
      }
      p.set(at[0], at[1] + 0.55, at[2]).project(camera)
      const off = p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1
      el.style.visibility = off ? 'hidden' : 'visible'
      el.style.transform = `translate(${(p.x * 0.5 + 0.5) * size.width}px, ${(-p.y * 0.5 + 0.5) * size.height}px) ${ANCHOR[id] ?? 'translate(-50%, -100%)'}`
    }
  })
  return null
}

export function EnergyFlow() {
  const open = useEnergy((s) => s.open)
  const flows = useEnergy((s) => s.flows)
  const rooms = useEnergy((s) => s.rooms)
  const level = useLayout((s) => activeLevel(s))
  const mode = useLayout((s) => s.mode)
  const fps = useView((s) => s.fps)
  const show = open && mode === 'view' && !fps && Boolean(flows && level)
  useAmbient(show)
  const graph = useMemo(() => (show && level && flows ? energyGraph(level, flows, rooms) : null), [show, level, flows, rooms])
  useLayoutEffect(() => {
    nodePos.clear()
    for (const n of graph?.nodes ?? []) nodePos.set(n.id, n.at)
  }, [graph])
  if (!graph || !level) return null
  return (
    <group name="energy-flow">
      <Arcs strands={graph.strands} />
      {level.rooms.map((r) => (rooms[r.id] ?? 0) >= 20 && <RoomHeat key={r.id} room={r} watts={rooms[r.id]} />)}
      <LabelSync />
    </group>
  )
}
