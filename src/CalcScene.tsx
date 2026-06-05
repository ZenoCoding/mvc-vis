import { useEffect, useMemo } from 'react'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import {
  clamp,
  computeProbe,
  length,
  mathToThree,
  sampleImplicitSurface,
  sampleCurve,
  sampleCurlField,
  sampleDivergenceField,
  sampleGradientField,
  sampleSurface,
  sampleTraceCurves,
  sampleVectorField,
  sampleVectorFieldLines,
  vectorToThree,
  type CompiledGraph,
  type CompiledCalculusOverlay,
  type CompiledCurve,
  type CompiledImplicitSurface,
  type CompiledPlane,
  type CompiledSurface,
  type CompiledVectorField,
  type ProbeResult,
} from './mathEngine'
import type { Bounds3, GraphSettings, ProbeState, Vec3 } from './types'

interface CalcSceneProps {
  graph: CompiledGraph
  settings: GraphSettings
  probe: ProbeState
  onProbeChange: (probe: ProbeState) => void
  cameraResetKey: number
}

export function CalcScene({
  graph,
  settings,
  probe,
  onProbeChange,
  cameraResetKey,
}: CalcSceneProps) {
  const activeSurface = graph.surfaces[0]
  const activeVector = graph.vectors[0]
  const probeResult = computeProbe(activeSurface, activeVector, probe, settings)
  const fov = 74 - settings.perspective * 0.4

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12.5, 8.5, 12.5], fov, near: 0.1, far: 140 }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={0.78} />
      <directionalLight castShadow position={[8, 10, 6]} intensity={1.1} />
      <CameraReset resetKey={cameraResetKey} />
      <SceneContents
        graph={graph}
        settings={settings}
        probe={probe}
        activeSurface={activeSurface}
        activeVector={activeVector}
        probeResult={probeResult}
        onProbeChange={onProbeChange}
      />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}

function SceneContents({
  graph,
  settings,
  probe,
  activeSurface,
  activeVector,
  probeResult,
  onProbeChange,
}: {
  graph: CompiledGraph
  settings: GraphSettings
  probe: ProbeState
  activeSurface?: CompiledSurface
  activeVector?: CompiledVectorField
  probeResult?: ProbeResult
  onProbeChange: (probe: ProbeState) => void
}) {
  return (
    <group>
      <GridAndBounds bounds={settings.bounds} settings={settings} />
      {graph.surfaces.map((surface) => (
        <SurfaceMesh
          key={surface.row.id}
          surface={surface}
          settings={settings}
          onProbeChange={onProbeChange}
        />
      ))}
      {graph.implicitSurfaces.map((surface) => (
        <ImplicitSurfaceMesh
          key={surface.row.id}
          surface={surface}
          settings={settings}
        />
      ))}
      {graph.curves.map((curve) => (
        <CurveObject key={curve.row.id} curve={curve} color={curve.row.color} />
      ))}
      {graph.vectors.map((field) => (
        <VectorFieldObject
          key={field.row.id}
          field={field}
          settings={settings}
        />
      ))}
      {graph.planes.map((plane) => (
        <PlaneObject key={plane.row.id} plane={plane} bounds={settings.bounds} />
      ))}
      {graph.overlays.map((overlay) => {
        if (overlay.type === 'gradient' && activeSurface) {
          return (
            <DerivedGradientField
              key={overlay.row.id}
              overlay={overlay}
              surface={activeSurface}
              settings={settings}
            />
          )
        }
        if (overlay.type === 'curl' && activeVector) {
          return (
            <DerivedCurlField
              key={overlay.row.id}
              overlay={overlay}
              field={activeVector}
              settings={settings}
            />
          )
        }
        if (overlay.type === 'divergence' && activeVector) {
          return (
            <DerivedDivergenceField
              key={overlay.row.id}
              overlay={overlay}
              field={activeVector}
              settings={settings}
            />
          )
        }
        return null
      })}
      {probeResult && activeSurface ? (
        <ProbeOverlay
          surface={activeSurface}
          vectorField={activeVector}
          settings={settings}
          probe={probe}
          result={probeResult}
        />
      ) : null}
    </group>
  )
}

function SurfaceMesh({
  surface,
  settings,
  onProbeChange,
}: {
  surface: CompiledSurface
  settings: GraphSettings
  onProbeChange: (probe: ProbeState) => void
}) {
  const geometry = useMemo(() => {
    const sampled = sampleSurface(surface, settings.bounds, 76)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(sampled.positions, 3))
    geo.setIndex(new THREE.BufferAttribute(sampled.indices, 1))
    geo.computeVertexNormals()
    return geo
  }, [surface, settings.bounds])

  const handleProbeMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onProbeChange({
      x: clamp(event.point.x, settings.bounds.xMin, settings.bounds.xMax),
      y: clamp(event.point.z, settings.bounds.yMin, settings.bounds.yMax),
    })
  }

  return (
    <mesh
      geometry={geometry}
      onPointerDown={handleProbeMove}
      onPointerMove={(event) => {
        if ((event.nativeEvent as PointerEvent).buttons === 1) handleProbeMove(event)
      }}
    >
      <meshStandardMaterial
        color={surface.row.color}
        roughness={0.54}
        metalness={0.02}
        transparent={settings.translucentSurfaces}
        opacity={settings.translucentSurfaces ? 0.38 : 0.86}
        depthWrite={!settings.translucentSurfaces}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function ImplicitSurfaceMesh({
  surface,
  settings,
}: {
  surface: CompiledImplicitSurface
  settings: GraphSettings
}) {
  const geometry = useMemo(() => {
    const sampled = sampleImplicitSurface(surface, settings.bounds, 34)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(sampled.positions, 3))
    if (sampled.normals) {
      geo.setAttribute('normal', new THREE.BufferAttribute(sampled.normals, 3))
    }
    geo.setIndex(new THREE.BufferAttribute(sampled.indices, 1))
    if (!sampled.normals) geo.computeVertexNormals()
    return geo
  }, [surface, settings.bounds])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={surface.row.color}
        roughness={0.58}
        metalness={0.02}
        transparent={settings.translucentSurfaces}
        opacity={settings.translucentSurfaces ? 0.34 : 0.82}
        depthWrite={!settings.translucentSurfaces}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function CurveObject({
  curve,
  color,
}: {
  curve: CompiledCurve
  color: string
}) {
  const points = useMemo(() => sampleCurve(curve).points.map(mathToThree), [curve])
  if (points.length < 2) return null
  return <Line points={points} color={color} lineWidth={3.5} dashed={false} />
}

function VectorFieldObject({
  field,
  settings,
}: {
  field: CompiledVectorField
  settings: GraphSettings
}) {
  return settings.vectorStyle === 'lines' ? (
    <VectorFieldLinesObject field={field} settings={settings} />
  ) : (
    <VectorFieldArrowsObject field={field} settings={settings} />
  )
}

function VectorFieldArrowsObject({
  field,
  settings,
}: {
  field: CompiledVectorField
  settings: GraphSettings
}) {
  const samples = useMemo(
    () => sampleVectorField(field, settings.bounds, settings),
    [field, settings],
  )
  const maxMagnitude = Math.max(1, ...samples.map((sample) => sample.magnitude))

  return (
    <group>
      {samples.map((sample, index) => {
        const ratio = sample.magnitude / maxMagnitude
        const color = magnitudeColor(ratio)
        const scale = (0.25 + ratio * 0.55) * settings.vectorScale
        return (
          <MathArrow
            key={`${sample.origin.x}-${sample.origin.y}-${sample.origin.z}-${index}`}
            origin={sample.origin}
            vector={sample.vector}
            color={color}
            scale={scale}
            headLength={0.13}
            headWidth={0.075}
          />
        )
      })}
    </group>
  )
}

function VectorFieldLinesObject({
  field,
  settings,
}: {
  field: CompiledVectorField
  settings: GraphSettings
}) {
  const lines = useMemo(
    () => sampleVectorFieldLines(field, settings.bounds, settings),
    [field, settings],
  )
  const maxMagnitude = Math.max(1, ...lines.map((line) => line.magnitude))

  return (
    <group>
      {lines.map((line, index) => {
        const ratio = line.magnitude / maxMagnitude
        return (
          <Line
            key={`${line.points[0]?.x}-${line.points[0]?.y}-${line.points[0]?.z}-${index}`}
            points={line.points.map(mathToThree)}
            color={magnitudeColor(ratio)}
            lineWidth={1.35 + ratio * 2.15}
            transparent
            opacity={0.42 + ratio * 0.5}
          />
        )
      })}
    </group>
  )
}

function DerivedGradientField({
  overlay,
  surface,
  settings,
}: {
  overlay: CompiledCalculusOverlay
  surface: CompiledSurface
  settings: GraphSettings
}) {
  const samples = useMemo(
    () => sampleGradientField(surface, settings.bounds, settings),
    [surface, settings],
  )
  return (
    <SampledVectorArrows
      samples={samples}
      color={overlay.row.color}
      scale={settings.vectorScale * 0.82}
      headLength={0.14}
      headWidth={0.08}
    />
  )
}

function DerivedCurlField({
  overlay,
  field,
  settings,
}: {
  overlay: CompiledCalculusOverlay
  field: CompiledVectorField
  settings: GraphSettings
}) {
  const samples = useMemo(
    () => sampleCurlField(field, settings.bounds, settings),
    [field, settings],
  )
  return (
    <SampledVectorArrows
      samples={samples}
      color={overlay.row.color}
      scale={settings.vectorScale * 0.74}
      headLength={0.13}
      headWidth={0.075}
    />
  )
}

function SampledVectorArrows({
  samples,
  color,
  scale,
  headLength,
  headWidth,
}: {
  samples: { origin: Vec3; vector: Vec3; magnitude: number }[]
  color: string
  scale: number
  headLength: number
  headWidth: number
}) {
  const maxMagnitude = Math.max(1, ...samples.map((sample) => sample.magnitude))
  return (
    <group>
      {samples.map((sample, index) => {
        const ratio = sample.magnitude / maxMagnitude
        return (
          <MathArrow
            key={`${sample.origin.x}-${sample.origin.y}-${sample.origin.z}-${index}`}
            origin={sample.origin}
            vector={sample.vector}
            color={color}
            scale={(0.32 + ratio * 0.62) * scale}
            headLength={headLength}
            headWidth={headWidth}
          />
        )
      })}
    </group>
  )
}

function DerivedDivergenceField({
  overlay,
  field,
  settings,
}: {
  overlay: CompiledCalculusOverlay
  field: CompiledVectorField
  settings: GraphSettings
}) {
  const samples = useMemo(
    () => sampleDivergenceField(field, settings.bounds, settings),
    [field, settings],
  )
  const maxAbs = Math.max(0.0001, ...samples.map((sample) => Math.abs(sample.value)))

  return (
    <group>
      {samples.map((sample, index) => {
        const ratio = Math.abs(sample.value) / maxAbs
        const signedHeight = Math.sign(sample.value) * (0.18 + ratio * 0.82)
        const endpoint = { ...sample.position, z: sample.position.z + signedHeight }
        return (
          <group key={`${sample.position.x}-${sample.position.y}-${index}`}>
            <Line
              points={[sample.position, endpoint].map(mathToThree)}
              color={overlay.row.color}
              lineWidth={1.9 + ratio * 1.8}
              transparent
              opacity={0.42 + ratio * 0.45}
            />
            <mesh position={mathToThree(endpoint)}>
              <sphereGeometry args={[0.035 + ratio * 0.045, 12, 12]} />
              <meshStandardMaterial color={overlay.row.color} transparent opacity={0.52 + ratio * 0.42} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function ProbeOverlay({
  surface,
  vectorField,
  settings,
  probe,
  result,
}: {
  surface: CompiledSurface
  vectorField?: CompiledVectorField
  settings: GraphSettings
  probe: ProbeState
  result: ProbeResult
}) {
  const traces = useMemo(
    () => sampleTraceCurves(surface, probe, settings.bounds),
    [surface, probe, settings.bounds],
  )
  const point = mathToThree(result.point)
  const gradientMagnitude = Math.hypot(result.fx, result.fy)
  const gradientEnd =
    gradientMagnitude > 0.0001
      ? {
          x: result.point.x + (result.fx / gradientMagnitude) * 1.15,
          y: result.point.y + (result.fy / gradientMagnitude) * 1.15,
          z: surface.value({
            x: result.point.x + (result.fx / gradientMagnitude) * 1.15,
            y: result.point.y + (result.fy / gradientMagnitude) * 1.15,
            z: 0,
            t: 0,
          }),
        }
      : result.point
  const gradientVector = {
    x: gradientEnd.x - result.point.x,
    y: gradientEnd.y - result.point.y,
    z: gradientEnd.z - result.point.z,
  }
  const directionEnd = {
    x: result.point.x + result.direction.x,
    y: result.point.y + result.direction.y,
    z: surface.value({
      x: result.point.x + result.direction.x,
      y: result.point.y + result.direction.y,
      z: 0,
      t: 0,
    }),
  }

  return (
    <group>
      <Line
        points={traces.xTrace.map(mathToThree)}
        color="#f28c28"
        lineWidth={2.8}
      />
      <Line
        points={traces.yTrace.map(mathToThree)}
        color="#2f6edb"
        lineWidth={2.8}
      />
      <TangentPlane result={result} />
      <mesh position={point} castShadow>
        <sphereGeometry args={[0.13, 28, 28]} />
        <meshStandardMaterial color="#101820" roughness={0.32} />
      </mesh>
      {gradientMagnitude > 0.0001 ? (
        <MathArrow
          origin={result.point}
          vector={gradientVector}
          color="#ff7b1a"
          scale={1.05}
          headLength={0.2}
          headWidth={0.12}
        />
      ) : null}
      <MathArrow origin={result.point} vector={result.normal} color="#111111" scale={1.25} />
      <Line points={[mathToThree(result.point), mathToThree(directionEnd)]} color="#7c4dff" lineWidth={3} />
      {vectorField && result.vectorAtPoint ? (
        <MathArrow origin={result.point} vector={result.vectorAtPoint} color={vectorField.row.color} scale={0.88} />
      ) : null}
      {result.curl ? (
        <MathArrow origin={result.point} vector={result.curl} color="#8a6045" scale={0.48} />
      ) : null}
    </group>
  )
}

function TangentPlane({ result }: { result: ProbeResult }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(result.tangentPlane.corners.flatMap(mathToThree))
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    geo.computeVertexNormals()
    return geo
  }, [result])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#ffcf71"
        opacity={0.32}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function PlaneObject({ plane, bounds }: { plane: CompiledPlane; bounds: Bounds3 }) {
  const corners = useMemo(() => planeCorners(plane, bounds), [plane, bounds])
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners.flatMap(mathToThree)), 3))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    geo.computeVertexNormals()
    return geo
  }, [corners])

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={plane.row.color}
          opacity={0.08}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={[...corners, corners[0]].map(mathToThree)}
        color={plane.row.color}
        lineWidth={2}
        dashed
        dashSize={0.18}
        gapSize={0.12}
      />
    </group>
  )
}

function planeCorners(plane: CompiledPlane, bounds: Bounds3): [Vec3, Vec3, Vec3, Vec3] {
  if (plane.axis === 'x') {
    return [
      { x: plane.value, y: bounds.yMin, z: bounds.zMin },
      { x: plane.value, y: bounds.yMax, z: bounds.zMin },
      { x: plane.value, y: bounds.yMax, z: bounds.zMax },
      { x: plane.value, y: bounds.yMin, z: bounds.zMax },
    ]
  }
  if (plane.axis === 'y') {
    return [
      { x: bounds.xMin, y: plane.value, z: bounds.zMin },
      { x: bounds.xMax, y: plane.value, z: bounds.zMin },
      { x: bounds.xMax, y: plane.value, z: bounds.zMax },
      { x: bounds.xMin, y: plane.value, z: bounds.zMax },
    ]
  }
  return [
    { x: bounds.xMin, y: bounds.yMin, z: plane.value },
    { x: bounds.xMax, y: bounds.yMin, z: plane.value },
    { x: bounds.xMax, y: bounds.yMax, z: plane.value },
    { x: bounds.xMin, y: bounds.yMax, z: plane.value },
  ]
}

function GridAndBounds({ bounds, settings }: { bounds: Bounds3; settings: GraphSettings }) {
  return (
    <group>
      <BoundsBox bounds={bounds} />
      {settings.showXY ? <GridPlane bounds={bounds} plane="xy" /> : null}
      {settings.showXZ ? <GridPlane bounds={bounds} plane="xz" /> : null}
      {settings.showYZ ? <GridPlane bounds={bounds} plane="yz" /> : null}
      <Axes bounds={bounds} showLabels={settings.showLabels} showNumbers={settings.showNumbers} />
    </group>
  )
}

function BoundsBox({ bounds }: { bounds: Bounds3 }) {
  const x0 = bounds.xMin
  const x1 = bounds.xMax
  const y0 = bounds.yMin
  const y1 = bounds.yMax
  const z0 = bounds.zMin
  const z1 = bounds.zMax
  const edges = [
    [
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z0 },
    ],
    [
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
      { x: x0, y: y0, z: z1 },
    ],
    [
      { x: x0, y: y0, z: z0 },
      { x: x0, y: y0, z: z1 },
    ],
    [
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y0, z: z1 },
    ],
    [
      { x: x1, y: y1, z: z0 },
      { x: x1, y: y1, z: z1 },
    ],
    [
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y1, z: z1 },
    ],
  ]
  return (
    <group>
      {edges.map((edge, index) => (
        <Line
          key={index}
          points={edge.map(mathToThree)}
          color="#c8cdd4"
          lineWidth={1}
          transparent
          opacity={0.86}
        />
      ))}
    </group>
  )
}

function GridPlane({ bounds, plane }: { bounds: Bounds3; plane: 'xy' | 'xz' | 'yz' }) {
  const lines: Vec3[][] = []
  const step = 1

  if (plane === 'xy') {
    for (let x = Math.ceil(bounds.xMin); x <= bounds.xMax; x += step) {
      lines.push([
        { x, y: bounds.yMin, z: 0 },
        { x, y: bounds.yMax, z: 0 },
      ])
    }
    for (let y = Math.ceil(bounds.yMin); y <= bounds.yMax; y += step) {
      lines.push([
        { x: bounds.xMin, y, z: 0 },
        { x: bounds.xMax, y, z: 0 },
      ])
    }
  }

  if (plane === 'xz') {
    for (let x = Math.ceil(bounds.xMin); x <= bounds.xMax; x += step) {
      lines.push([
        { x, y: 0, z: bounds.zMin },
        { x, y: 0, z: bounds.zMax },
      ])
    }
    for (let z = Math.ceil(bounds.zMin); z <= bounds.zMax; z += step) {
      lines.push([
        { x: bounds.xMin, y: 0, z },
        { x: bounds.xMax, y: 0, z },
      ])
    }
  }

  if (plane === 'yz') {
    for (let y = Math.ceil(bounds.yMin); y <= bounds.yMax; y += step) {
      lines.push([
        { x: 0, y, z: bounds.zMin },
        { x: 0, y, z: bounds.zMax },
      ])
    }
    for (let z = Math.ceil(bounds.zMin); z <= bounds.zMax; z += step) {
      lines.push([
        { x: 0, y: bounds.yMin, z },
        { x: 0, y: bounds.yMax, z },
      ])
    }
  }

  return (
    <group>
      {lines.map((line, index) => (
        <Line
          key={`${plane}-${index}`}
          points={line.map(mathToThree)}
          color={plane === 'xy' ? '#d6d9de' : '#e6e8eb'}
          lineWidth={0.75}
          transparent
          opacity={plane === 'xy' ? 0.78 : 0.42}
        />
      ))}
    </group>
  )
}

function Axes({
  bounds,
  showLabels,
  showNumbers,
}: {
  bounds: Bounds3
  showLabels: boolean
  showNumbers: boolean
}) {
  const ticks = [-5, -3, -1, 1, 3, 5]
  return (
    <group>
      <Line
        points={[
          [bounds.xMin, 0, 0],
          [bounds.xMax, 0, 0],
        ]}
        color="#df2525"
        lineWidth={2.2}
      />
      <Line
        points={[
          [0, 0, bounds.yMin],
          [0, 0, bounds.yMax],
        ]}
        color="#2f8f3f"
        lineWidth={2.2}
      />
      <Line
        points={[
          [0, bounds.zMin, 0],
          [0, bounds.zMax, 0],
        ]}
        color="#165dd8"
        lineWidth={2.2}
      />
      {showLabels ? (
        <>
          <AxisText position={[bounds.xMax + 0.35, 0, 0]} color="#df2525" text="x" />
          <AxisText position={[0, 0, bounds.yMax + 0.35]} color="#2f8f3f" text="y" />
          <AxisText position={[0, bounds.zMax + 0.35, 0]} color="#165dd8" text="z" />
        </>
      ) : null}
      {showNumbers
        ? ticks.map((tick) => (
            <group key={tick}>
              <AxisText position={[tick, -0.22, -0.18]} color="#df2525" text={String(tick)} size={0.18} />
              <AxisText position={[-0.22, -0.2, tick]} color="#2f8f3f" text={String(tick)} size={0.18} />
              <AxisText position={[0.18, tick, 0.18]} color="#165dd8" text={String(tick)} size={0.18} />
            </group>
          ))
        : null}
    </group>
  )
}

function AxisText({
  position,
  color,
  text,
  size = 0.28,
}: {
  position: [number, number, number]
  color: string
  text: string
  size?: number
}) {
  return (
    <Text position={position} fontSize={size} color={color} anchorX="center" anchorY="middle">
      {text}
    </Text>
  )
}

function MathArrow({
  origin,
  vector,
  color,
  scale,
  headLength = 0.18,
  headWidth = 0.1,
}: {
  origin: Vec3
  vector: Vec3
  color: string
  scale: number
  headLength?: number
  headWidth?: number
}) {
  const object = useMemo(() => {
    const mappedVector = vectorToThree(vector)
    const direction = new THREE.Vector3(mappedVector.x, mappedVector.y, mappedVector.z)
    const magnitude = Math.max(length(mappedVector), 0.0001)
    direction.normalize()
    const mappedOrigin = mathToThree(origin)
    return new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(mappedOrigin[0], mappedOrigin[1], mappedOrigin[2]),
      scale * Math.min(1.8, Math.max(0.35, magnitude)),
      color,
      headLength,
      headWidth,
    )
  }, [origin, vector, color, scale, headLength, headWidth])

  return <primitive object={object} />
}

function CameraReset({ resetKey }: { resetKey: number }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(12.5, 8.5, 12.5)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, resetKey])
  return null
}

function magnitudeColor(ratio: number) {
  const clamped = clamp(ratio, 0, 1)
  const hue = 206 - clamped * 168
  return `hsl(${hue}, 70%, 42%)`
}
