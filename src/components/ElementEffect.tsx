import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElementType } from '../lib/elements'

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

// ─── Fire: shaders ───────────────────────────────────────────────────────────
// Per-particle: size (world units), alpha, color (rgb), rotation (radians)

const FIRE_VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3  aColor;
  attribute float aRotation;
  uniform   float uScale;
  varying   float vAlpha;
  varying   vec3  vColor;
  varying   float vRotation;
  void main() {
    vAlpha    = aAlpha;
    vColor    = aColor;
    vRotation = aRotation;
    vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`
const FIRE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3  vColor;
  varying float vRotation;
  void main() {
    // Rotate UV around the sprite center (for per-particle tilt)
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRotation), s = sin(vRotation);
    uv = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

    vec4 t = texture2D(uMap, uv);
    if (t.a < 0.004) discard;

    // vColor drives hue; texture brightness punches up the core to white-hot
    float lum = t.r;                             // texture is grayscale
    vec3  col = vColor + vec3(0.9,0.7,0.2) * lum * lum * 0.5;
    gl_FragColor = vec4(col, t.a * vAlpha);
  }
`

// ─── Flame-tongue texture ─────────────────────────────────────────────────────
// 128×128, tip at canvas-top (y=0), wide base at canvas-bottom (y=128).
// flipY=false keeps canvas coords aligned with gl_PointCoord.

function makeFlameSprite(): THREE.CanvasTexture {
  const S = 128, H = S
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, S, H)

  const cx = S / 2

  // ① Outer flame silhouette — widest flame tongue shape
  const outerPath = () => {
    ctx.beginPath()
    ctx.moveTo(cx, H * 0.03)                         // tip
    ctx.bezierCurveTo(cx + S*0.40, H*0.18, cx + S*0.46, H*0.52, cx + S*0.40, H)
    ctx.lineTo(cx - S*0.40, H)
    ctx.bezierCurveTo(cx - S*0.46, H*0.52, cx - S*0.40, H*0.18, cx, H*0.03)
    ctx.closePath()
  }

  ctx.save()
  outerPath()
  // Radial glow from base outward — bright at center-base, fades at edges
  const outerG = ctx.createRadialGradient(cx, H*0.75, 0, cx, H*0.58, S*0.52)
  outerG.addColorStop(0,    'rgba(255,255,255,0.95)')
  outerG.addColorStop(0.30, 'rgba(255,255,255,0.80)')
  outerG.addColorStop(0.60, 'rgba(255,255,255,0.45)')
  outerG.addColorStop(0.85, 'rgba(255,255,255,0.15)')
  outerG.addColorStop(1,    'rgba(255,255,255,0.00)')
  ctx.fillStyle = outerG
  ctx.fill()
  ctx.restore()

  // ② Vertical gradient: fade tip to transparent so only base glows
  ctx.save()
  outerPath()
  ctx.clip()
  const tipFade = ctx.createLinearGradient(0, 0, 0, H)
  tipFade.addColorStop(0,    'rgba(0,0,0,1)')    // transparent at very tip
  tipFade.addColorStop(0.08, 'rgba(0,0,0,0)')    // then normal
  ctx.fillStyle = tipFade
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fill()
  ctx.restore()

  // ③ Bright inner core — narrower tongue, extra opacity to punch through
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(cx, H * 0.10)
  ctx.bezierCurveTo(cx + S*0.18, H*0.28, cx + S*0.22, H*0.58, cx + S*0.16, H)
  ctx.lineTo(cx - S*0.16, H)
  ctx.bezierCurveTo(cx - S*0.22, H*0.58, cx - S*0.18, H*0.28, cx, H*0.10)
  ctx.closePath()
  const coreG = ctx.createLinearGradient(0, H*0.08, 0, H)
  coreG.addColorStop(0,    'rgba(255,255,255,0.00)')  // tip: none
  coreG.addColorStop(0.06, 'rgba(255,255,255,0.90)')  // just below tip: hot
  coreG.addColorStop(0.35, 'rgba(255,255,255,0.95)')  // main body
  coreG.addColorStop(0.75, 'rgba(255,255,255,0.80)')
  coreG.addColorStop(1,    'rgba(255,255,255,0.55)')
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = coreG
  ctx.fill()
  ctx.restore()

  const tex = new THREE.CanvasTexture(c)
  tex.flipY = false   // gl_PointCoord y=0 = top of sprite = flame tip ✓
  return tex
}

// ─── Fire particle pool ───────────────────────────────────────────────────────

interface FP {
  x: number; y: number; z: number
  vx: number; vy: number
  life: number; maxLife: number
  size: number; baseY: number
  rotation: number  // radians, fixed at spawn for tilt variety
}
const FIRE_MAX = 350
const makeFP = (): FP => ({ x:0,y:0,z:0,vx:0,vy:0,life:0,maxLife:1,size:0.5,baseY:0,rotation:0 })

// ─── FireEffect ───────────────────────────────────────────────────────────────

interface FireEffectProps {
  handCentersRef: React.MutableRefObject<Array<{x:number;y:number}|null>>
  continuous: boolean
  trigger: number
}

function FireEffect({ handCentersRef, continuous, trigger }: FireEffectProps) {
  const texture  = useMemo(makeFlameSprite, [])
  const pool     = useMemo(() => Array.from({length: FIRE_MAX}, makeFP), [])
  const posArr   = useMemo(() => new Float32Array(FIRE_MAX * 3), [])
  const colArr   = useMemo(() => new Float32Array(FIRE_MAX * 3), [])
  const alphaArr = useMemo(() => new Float32Array(FIRE_MAX),     [])
  const sizeArr  = useMemo(() => new Float32Array(FIRE_MAX),     [])
  const rotArr   = useMemo(() => new Float32Array(FIRE_MAX),     [])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr,   3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aColor',   new THREE.BufferAttribute(colArr,   3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaArr, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize',    new THREE.BufferAttribute(sizeArr,  1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aRotation',new THREE.BufferAttribute(rotArr,   1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    return g
  }, [posArr, colArr, alphaArr, sizeArr, rotArr])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uMap: { value: texture }, uScale: { value: 1.0 } },
    vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [texture])

  const ptsRef    = useRef<THREE.Points>(null!)
  const burstQ    = useRef(false)
  const prevTrig  = useRef(trigger)
  const contAcc   = useRef(0)

  useEffect(() => {
    if (trigger !== prevTrig.current) { burstQ.current = true; prevTrig.current = trigger }
  }, [trigger])

  function spawnAt(cx: number, cy: number, burst: boolean, count: number) {
    let n = 0
    for (const p of pool) {
      if (p.life > 0 || n >= count) break
      // Spread across palm width — wider for burst
      const spreadX = burst ? 1.0 : 0.60
      p.x       = cx + rnd(-spreadX, spreadX)
      p.y       = cy + rnd(-0.05, 0.12)
      p.z       = rnd(-0.30, 0.42)     // depth variation gives 3-D body
      p.baseY   = p.y
      p.vx      = rnd(-0.30, 0.30)
      p.vy      = rnd(1.8, 3.8)        // world units / second, upward
      p.maxLife = burst ? rnd(0.7, 2.0) : rnd(0.5, 1.4)
      p.life    = p.maxLife
      // Bigger than before — cartoon fire is bold
      p.size    = burst ? rnd(0.45, 1.10) : rnd(0.28, 0.80)
      // Slight random tilt so flames aren't all perfectly vertical
      p.rotation = rnd(-0.28, 0.28)
      n++
    }
  }

  useFrame(({ viewport, size, gl }, dt) => {
    if (!ptsRef.current) return

    // Point-size scale: same formula Three.js PointsMaterial uses for sizeAttenuation
    mat.uniforms.uScale.value =
      0.5 * Math.sqrt(size.width ** 2 + size.height ** 2) * gl.getPixelRatio()

    // Convert MediaPipe hand centers → Three.js world coords
    const centers = handCentersRef.current
      .filter(Boolean)
      .map(hc => ({ wx: (hc!.x - 0.5) * viewport.width, wy: -(hc!.y - 0.5) * viewport.height }))

    // Burst
    if (burstQ.current && centers.length) {
      burstQ.current = false
      for (const { wx, wy } of centers) spawnAt(wx, wy, true, 100)
    }

    // Continuous — fire that follows the open palm
    if (continuous && centers.length) {
      contAcc.current += dt * 32        // 32 particles/sec per hand
      const n = Math.floor(contAcc.current); contAcc.current -= n
      for (let i = 0; i < n; i++)
        for (const { wx, wy } of centers) spawnAt(wx, wy, false, 1)
    }

    // Step particles + fill GPU buffers
    const col = new THREE.Color()
    let alive = 0

    for (const p of pool) {
      if (p.life <= 0) continue

      // Turbulent upward rise
      p.vx += rnd(-0.025, 0.025)
      p.vx *= 0.952
      p.x  += p.vx * dt
      p.y  += p.vy * dt
      p.life -= dt

      if (p.life <= 0) continue

      const t  = p.life / p.maxLife          // 1=fresh, 0=dead
      const h  = Math.max(0, p.y - p.baseY)
      const hN = Math.min(1, h / 3.0)        // 0=palm level, 1=3 world units up

      // Vivid cartoon-style color gradient by height
      // Avatar-like: white/yellow base → vivid orange → red tips
      if      (hN < 0.08) col.setRGB(1.00, 0.98, 0.80)   // white-yellow (heat base)
      else if (hN < 0.22) col.setRGB(1.00, 0.90, 0.12)   // bright yellow
      else if (hN < 0.40) col.setRGB(1.00, 0.62, 0.02)   // vivid yellow-orange
      else if (hN < 0.58) col.setRGB(1.00, 0.35, 0.00)   // orange
      else if (hN < 0.74) col.setRGB(0.92, 0.12, 0.00)   // deep orange-red
      else if (hN < 0.88) col.setRGB(0.68, 0.04, 0.00)   // red
      else                col.setRGB(0.32, 0.01, 0.00)   // dark red (dying tip)

      // Alpha: instant fade-in, hold, then fade near top and at end-of-life
      const fadeTop = 1.0 - Math.pow(hN, 1.3)
      const alpha   = Math.min(1, t * 6) * fadeTop * Math.pow(t, 0.6)

      posArr[alive*3]   = p.x;  posArr[alive*3+1] = p.y;  posArr[alive*3+2] = p.z
      colArr[alive*3]   = col.r; colArr[alive*3+1] = col.g; colArr[alive*3+2] = col.b
      alphaArr[alive]   = Math.max(0, alpha)
      sizeArr[alive]    = p.size * (0.30 + t * 0.70)   // shrinks with age
      rotArr[alive]     = p.rotation
      alive++
    }

    geo.setDrawRange(0, alive)
    ;(geo.getAttribute('position')  as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aColor')    as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aAlpha')    as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aSize')     as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aRotation') as THREE.BufferAttribute).needsUpdate = true
  })

  return <points ref={ptsRef} geometry={geo} material={mat} frustumCulled={false} />
}

// ─── Other elements (InstancedMesh) ──────────────────────────────────────────

const MAX = 600
const COLORS: Record<ElementType, string> = {
  fire:'#ff6000', water:'#00aadd', air:'#cceeff',
  earth:'#7a5028', lightning:'#aaddff', energy:'#dd00ff', spirit:'#00ffcc',
}
const ADDITIVE_ELS: ElementType[] = ['lightning','energy','spirit']

interface PState {
  pos: THREE.Vector3; vel: THREE.Vector3
  life: number; maxLife: number; size: number
  angle: number; radius: number; orbitAxis: THREE.Vector3; phase: number
}
const makePState = (): PState => ({
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  life:0, maxLife:1, size:1, angle:0, radius:0,
  orbitAxis: new THREE.Vector3(0,1,0), phase:0,
})

interface SystemProps {
  el: ElementType; trigger: number; continuous: boolean
  handCenterRef: React.MutableRefObject<{x:number;y:number}|null>
}

function ParticleSystem({ el, trigger, continuous, handCenterRef }: SystemProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const dummy   = useMemo(() => new THREE.Object3D(), [])
  const pool    = useMemo(() => Array.from({length:MAX}, makePState), [])
  const burstQ  = useRef(false)
  const prevT   = useRef(trigger)
  const contAcc = useRef(0)
  const core    = COLORS[el]

  useEffect(() => {
    if (trigger !== prevT.current) { burstQ.current = true; prevT.current = trigger }
  }, [trigger])

  const { viewport } = useThree()

  function getCenter(): THREE.Vector3 | null {
    const hc = handCenterRef.current
    if (!hc) return null
    return new THREE.Vector3((hc.x-0.5)*viewport.width, -(hc.y-0.5)*viewport.height, 0)
  }

  function spawnP(p: PState, c: THREE.Vector3, burst: boolean) {
    p.life=1; p.angle=rnd(0,Math.PI*2); p.phase=rnd(0,Math.PI*2)
    switch(el){
      case 'water':{
        p.radius=burst?rnd(0.8,2.5):rnd(0.5,1.5)
        p.orbitAxis.set(rnd(-0.3,0.3),rnd(0.7,1),rnd(-0.3,0.3)).normalize()
        p.pos.set(c.x+Math.cos(p.angle)*p.radius,c.y+rnd(-0.5,0.5),Math.sin(p.angle)*p.radius*0.4)
        p.vel.set(rnd(-0.3,0.3),rnd(0.2,0.8),rnd(-0.1,0.1))
        p.maxLife=burst?rnd(1.0,2.0):rnd(0.8,1.6); p.size=burst?rnd(0.1,0.28):rnd(0.07,0.18); break}
      case 'air':{
        p.radius=burst?rnd(0.6,2.0):rnd(0.4,1.4)
        p.pos.set(c.x+Math.cos(p.angle)*p.radius,c.y+rnd(-1,1),Math.sin(p.angle)*p.radius)
        p.vel.set(0,rnd(-0.02,0.05),0)
        p.maxLife=burst?rnd(1.0,2.0):rnd(0.8,1.5); p.size=burst?rnd(0.06,0.18):rnd(0.04,0.12); break}
      case 'earth':{
        const tilt=Math.PI*0.25; p.radius=burst?rnd(1.0,3.0):rnd(0.7,2.0)
        const ax=new THREE.Vector3(Math.sin(tilt),Math.cos(tilt),rnd(-0.2,0.2)).normalize()
        p.orbitAxis.copy(ax)
        const rad=new THREE.Vector3(Math.cos(p.angle),0,Math.sin(p.angle))
        const tan=new THREE.Vector3().crossVectors(ax,rad).normalize()
        p.pos.set(c.x+rad.x*p.radius,c.y+rad.y*p.radius,rad.z*p.radius)
        p.vel.copy(tan).multiplyScalar(rnd(0.015,0.04)*p.radius)
        p.maxLife=burst?rnd(2,4):rnd(3,6); p.size=burst?rnd(0.15,0.45):rnd(0.08,0.25); break}
      case 'lightning':{
        const a=rnd(0,Math.PI*2),d=rnd(0.3,2)
        p.pos.set(c.x+Math.cos(a)*d*rnd(0.1,1),c.y+Math.sin(a)*d*rnd(0.1,1),rnd(-0.5,0.5))
        p.vel.set(rnd(-0.5,0.5),rnd(-0.5,0.5),rnd(-0.3,0.3))
        p.maxLife=burst?rnd(0.15,0.4):rnd(0.1,0.25); p.size=burst?rnd(0.08,0.25):rnd(0.05,0.15); break}
      case 'energy':{
        const phi=Math.acos(rnd(-1,1)),theta=rnd(0,Math.PI*2)
        p.radius=burst?rnd(0.5,1.8):rnd(0.3,1.2)
        p.orbitAxis.set(rnd(-1,1),rnd(-1,1),rnd(-1,1)).normalize()
        p.pos.set(c.x+Math.sin(phi)*Math.cos(theta)*p.radius,c.y+Math.cos(phi)*p.radius,Math.sin(phi)*Math.sin(theta)*p.radius)
        p.vel.set(rnd(-0.1,0.1),rnd(-0.1,0.1),rnd(-0.1,0.1))
        p.maxLife=burst?rnd(0.8,1.5):rnd(0.6,1.2); p.size=burst?rnd(0.1,0.3):rnd(0.06,0.18); break}
      case 'spirit':{
        const a2=rnd(0,Math.PI*2); p.radius=burst?rnd(0.5,2.5):rnd(0.4,1.8)
        p.orbitAxis.set(rnd(-0.5,0.5),1,rnd(-0.5,0.5)).normalize()
        p.pos.set(c.x+Math.cos(a2)*p.radius,c.y+rnd(-0.8,0.8),Math.sin(a2)*p.radius*0.6)
        p.vel.set(rnd(-0.08,0.08),rnd(-0.1,0.15),rnd(-0.05,0.05))
        p.maxLife=burst?rnd(2,4):rnd(1.5,3); p.size=burst?rnd(0.12,0.35):rnd(0.08,0.22); break}
      default: p.pos.copy(c); p.vel.set(rnd(-1,1)*0.1,rnd(-1,1)*0.1,0); p.maxLife=1; p.size=0.2
    }
  }

  function stepP(p: PState, dt: number, c: THREE.Vector3|null) {
    const sp=dt*60
    switch(el){
      case 'water':
        p.vel.y-=0.008*sp; p.vel.multiplyScalar(Math.pow(0.985,sp))
        p.pos.addScaledVector(p.vel,sp); p.life-=dt/p.maxLife; break
      case 'air':
        if(c){p.angle+=(0.04+0.02*(1-p.life))*sp; p.radius=Math.max(0.1,p.radius+rnd(-0.005,0.005)*sp)
          p.pos.set(c.x+Math.cos(p.angle)*p.radius,p.pos.y+0.003*sp,Math.sin(p.angle)*p.radius)}
        p.life-=dt/p.maxLife; break
      case 'earth':
        if(c){const toC=new THREE.Vector3().subVectors(c,p.pos)
          const proj=new THREE.Vector3().copy(p.orbitAxis).multiplyScalar(toC.dot(p.orbitAxis))
          const rad=new THREE.Vector3().subVectors(toC,proj); const d=rad.length()
          if(d>0.01) p.vel.addScaledVector(rad.normalize(),(d-p.radius)*0.04*sp)}
        p.vel.multiplyScalar(Math.pow(0.992,sp)); p.pos.addScaledVector(p.vel,sp); p.life-=dt/p.maxLife; break
      case 'lightning':
        p.vel.multiplyScalar(Math.pow(0.88,sp)); p.pos.addScaledVector(p.vel,sp); p.life-=dt/p.maxLife; break
      case 'energy':
        if(c){p.angle+=0.07*sp; const ax=p.orbitAxis
          const pp1=new THREE.Vector3(ax.z,ax.x,ax.y).normalize()
          const pp2=new THREE.Vector3().crossVectors(ax,pp1).normalize()
          const s2=Math.sin(p.angle+p.phase),c2=Math.cos(p.angle+p.phase)
          p.pos.set(c.x+(pp1.x*c2+pp2.x*s2)*p.radius,c.y+(pp1.y*c2+pp2.y*s2)*p.radius,(pp1.z*c2+pp2.z*s2)*p.radius)}
        p.life-=dt/p.maxLife; break
      case 'spirit':
        if(c){p.angle+=0.012*sp; const sr=p.radius*(0.5+0.5*p.life)
          p.pos.x+=(c.x+Math.cos(p.angle)*sr-p.pos.x)*0.015*sp
          p.pos.z+=(Math.sin(p.angle)*sr*0.6-p.pos.z)*0.015*sp}
        p.vel.y-=0.001*sp; p.pos.y+=p.vel.y*sp; p.life-=dt/p.maxLife; break
      default: p.vel.multiplyScalar(Math.pow(0.97,sp)); p.pos.addScaledVector(p.vel,sp); p.life-=dt/p.maxLife
    }
  }

  const BURST_CNT: Record<ElementType,number>={fire:80,water:55,air:90,earth:35,lightning:50,energy:60,spirit:50}
  const CONT_RATE: Record<ElementType,number>={fire:5,water:5,air:10,earth:3,lightning:6,energy:7,spirit:4}

  useFrame((_,dt)=>{
    const mesh=meshRef.current; if(!mesh) return
    const ctr=getCenter()
    if(burstQ.current&&ctr){burstQ.current=false; let n=0; for(const p of pool) if(p.life<=0&&n<BURST_CNT[el]){spawnP(p,ctr,true);n++}}
    if(continuous&&ctr){contAcc.current+=dt*CONT_RATE[el]; const n=Math.floor(contAcc.current); contAcc.current-=n; let sp=0; for(const p of pool) if(p.life<=0&&sp<n){spawnP(p,ctr,false);sp++}}
    const tc=new THREE.Color(core); let alive=0
    for(const p of pool){
      if(p.life<=0) continue; stepP(p,dt,ctr); if(p.life<=0) continue
      dummy.position.copy(p.pos); dummy.scale.setScalar(p.size*Math.max(0,p.life)); dummy.updateMatrix()
      mesh.setMatrixAt(alive,dummy.matrix); mesh.setColorAt!(alive,tc); alive++
    }
    mesh.count=alive; mesh.instanceMatrix.needsUpdate=true
    if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true
  })

  const geo2=useMemo(()=>new THREE.SphereGeometry(1,6,6),[])
  const mat2=useMemo(()=>new THREE.MeshBasicMaterial({
    color:core,transparent:true,opacity:0.85,depthWrite:false,
    blending:ADDITIVE_ELS.includes(el)?THREE.AdditiveBlending:THREE.NormalBlending,
  }),[el,core])

  return <instancedMesh ref={meshRef} args={[geo2,mat2,MAX]} frustumCulled={false}/>
}

// ─── Exported component ───────────────────────────────────────────────────────

interface Props {
  element: ElementType | ''
  trigger: number
  continuous: boolean
  handCenterRef:  React.MutableRefObject<{x:number;y:number}|null>
  handCentersRef: React.MutableRefObject<Array<{x:number;y:number}|null>>
}

export function ElementEffect({ element, trigger, continuous, handCenterRef, handCentersRef }: Props) {
  if (!element) return null
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas
        camera={{ position:[0,0,10], fov:50 }}
        gl={{ alpha:true, antialias:false, powerPreference:'high-performance' }}
        style={{ background:'transparent' }}
      >
        {element === 'fire' ? (
          <FireEffect key="fire" handCentersRef={handCentersRef} continuous={continuous} trigger={trigger} />
        ) : (
          <ParticleSystem key={element} el={element} trigger={trigger} continuous={continuous} handCenterRef={handCenterRef} />
        )}
      </Canvas>
    </div>
  )
}
