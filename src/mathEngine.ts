import { compile, derivative } from 'mathjs'
import type {
  Bounds3,
  ExpressionRow,
  ExpressionType,
  GraphSettings,
  ProbeState,
  Vec3,
} from './types'

type Scope = Record<string, number>
type Compiled = { evaluate: (scope: Scope) => unknown }
type ScalarFn = (scope: Scope) => number

export interface CompiledSurface {
  row: ExpressionRow
  source: string
  value: ScalarFn
  dx: ScalarFn
  dy: ScalarFn
}

export interface CompiledCurve {
  row: ExpressionRow
  components: [ScalarFn, ScalarFn, ScalarFn]
}

export interface CompiledVectorField {
  row: ExpressionRow
  components: [ScalarFn, ScalarFn, ScalarFn]
  derivatives: {
    px: ScalarFn
    py: ScalarFn
    pz: ScalarFn
    qx: ScalarFn
    qy: ScalarFn
    qz: ScalarFn
    rx: ScalarFn
    ry: ScalarFn
    rz: ScalarFn
  }
}

export interface CompiledPlane {
  row: ExpressionRow
  axis: 'x' | 'y' | 'z'
  value: number
}

export interface CompiledCalculusOverlay {
  row: ExpressionRow
  type: Extract<ExpressionType, 'gradient' | 'divergence' | 'curl'>
}

export interface RowCompileError {
  rowId: string
  message: string
}

export interface CompiledGraph {
  surfaces: CompiledSurface[]
  curves: CompiledCurve[]
  vectors: CompiledVectorField[]
  planes: CompiledPlane[]
  overlays: CompiledCalculusOverlay[]
  errors: RowCompileError[]
}

export interface SurfaceSample {
  positions: Float32Array
  indices: Uint32Array
}

export interface CurveSample {
  points: Vec3[]
}

export interface VectorSample {
  origin: Vec3
  vector: Vec3
  magnitude: number
}

export interface ScalarFieldSample {
  position: Vec3
  value: number
}

export interface ProbeResult {
  point: Vec3
  fx: number
  fy: number
  gradient2: { x: number; y: number }
  normal: Vec3
  tangentPlane: {
    center: Vec3
    corners: [Vec3, Vec3, Vec3, Vec3]
  }
  directionalDerivative: number
  direction: { x: number; y: number }
  vectorAtPoint?: Vec3
  divergence?: number
  curl?: Vec3
}

export const defaultRows: ExpressionRow[] = [
  {
    id: 'surface-1',
    type: 'surface',
    expression: 'z = sin(x) cos(y)',
    color: '#2f6edb',
    enabled: true,
  },
  {
    id: 'curve-1',
    type: 'curve',
    expression: 'r(t) = (cos(t), sin(t), t / 4)',
    color: '#cf2c2c',
    enabled: true,
  },
  {
    id: 'vector-1',
    type: 'vector',
    expression: 'F(x,y,z) = <y, -x, z>',
    color: '#57a33a',
    enabled: true,
  },
  {
    id: 'gradient-1',
    type: 'gradient',
    expression: 'grad f',
    color: '#ff7b1a',
    enabled: true,
  },
  {
    id: 'div-1',
    type: 'divergence',
    expression: 'div F',
    color: '#8247d8',
    enabled: true,
  },
  {
    id: 'curl-1',
    type: 'curl',
    expression: 'curl F',
    color: '#8a6045',
    enabled: true,
  },
  {
    id: 'implicit-1',
    type: 'implicit',
    expression: 'x^2 + y^2 + z^2 = 16',
    color: '#9aa0a6',
    enabled: false,
  },
  {
    id: 'plane-1',
    type: 'plane',
    expression: 'x = 0',
    color: '#111111',
    enabled: true,
  },
]

export const defaultSettings: GraphSettings = {
  bounds: {
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 5,
    zMin: -5,
    zMax: 5,
  },
  perspective: 60,
  showXY: true,
  showYZ: true,
  showXZ: true,
  showNumbers: true,
  showLabels: true,
  translucentSurfaces: true,
  vectorDensity: 4,
  vectorScale: 0.46,
  vectorMode: 'volume',
  gradient: true,
  divergence: true,
  curl: true,
  tangentPlane: true,
  normal: true,
  tracePlane: true,
  directionAngle: 35,
}

export const defaultProbe: ProbeState = { x: 1.2, y: -0.9 }

export function detectExpressionType(expression: string): ExpressionType {
  const original = expression.trim()
  const value = original.toLowerCase()
  if (!value) return 'unresolved'
  if (value.startsWith('z') && value.includes('=')) return 'surface'
  if (value.startsWith('r(') || value.startsWith('r =')) return 'curve'
  if (
    (/^f\s*\(/i.test(original) || /^f\s*=/.test(value)) &&
    vectorParts(rightHandSide(original)).length === 3
  ) {
    return 'vector'
  }
  if (/^f\s*\(/.test(original) && value.includes('=')) return 'surface'
  if (value.startsWith('grad')) return 'gradient'
  if (value.startsWith('div')) return 'divergence'
  if (value.startsWith('curl')) return 'curl'
  if ('gradient'.startsWith(value) || 'grad'.startsWith(value)) return 'unresolved'
  if ('divergence'.startsWith(value) || 'div'.startsWith(value)) return 'unresolved'
  if ('curl'.startsWith(value)) return 'unresolved'
  if (/^[xyz]\s*=/.test(value)) return 'plane'
  if (value.includes('=') && value.includes('^')) return 'implicit'
  return 'unresolved'
}

export function compileRows(rows: ExpressionRow[]): CompiledGraph {
  const errors: RowCompileError[] = []
  const surfaces: CompiledSurface[] = []
  const curves: CompiledCurve[] = []
  const vectors: CompiledVectorField[] = []
  const planes: CompiledPlane[] = []
  const overlays: CompiledCalculusOverlay[] = []

  for (const row of rows) {
    if (!row.enabled) continue
    if (!row.expression.trim()) continue
    const inferredType = detectExpressionType(row.expression)
    try {
      if (inferredType === 'surface') surfaces.push(compileSurface({ ...row, type: inferredType }))
      if (inferredType === 'curve') curves.push(compileCurve({ ...row, type: inferredType }))
      if (inferredType === 'vector') vectors.push(compileVectorField({ ...row, type: inferredType }))
      if (inferredType === 'plane') planes.push(compilePlane({ ...row, type: inferredType }))
      if (isCalculusOverlay(inferredType)) {
        overlays.push({ row: { ...row, type: inferredType }, type: inferredType })
      }
      if (inferredType === 'implicit') throw new Error('Implicit surfaces are not implemented yet')
      if (inferredType === 'unresolved') throw new Error('Expression is incomplete or not supported yet')
    } catch (error) {
      errors.push({
        rowId: row.id,
        message: error instanceof Error ? error.message : 'Could not parse expression',
      })
    }
  }

  for (const overlay of overlays) {
    if (overlay.type === 'gradient' && surfaces.length === 0) {
      errors.push({ rowId: overlay.row.id, message: 'grad f needs a scalar surface' })
    }
    if ((overlay.type === 'divergence' || overlay.type === 'curl') && vectors.length === 0) {
      errors.push({ rowId: overlay.row.id, message: `${overlay.type} needs a vector field F` })
    }
  }

  return { surfaces, curves, vectors, planes, overlays, errors }
}

function isCalculusOverlay(type: ExpressionType): type is CompiledCalculusOverlay['type'] {
  return type === 'gradient' || type === 'divergence' || type === 'curl'
}

export function sampleSurface(
  surface: CompiledSurface,
  bounds: Bounds3,
  resolution = 78,
): SurfaceSample {
  const positions: number[] = []
  const valid: boolean[] = []
  const indices: number[] = []
  const nx = resolution
  const ny = resolution

  for (let iy = 0; iy <= ny; iy += 1) {
    const y = lerp(bounds.yMin, bounds.yMax, iy / ny)
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = lerp(bounds.xMin, bounds.xMax, ix / nx)
      const z = surface.value(scope({ x, y, z: 0, t: 0 }))
      const ok = Number.isFinite(z) && z >= bounds.zMin * 1.5 && z <= bounds.zMax * 1.5
      valid.push(ok)
      positions.push(x, ok ? z : 0, y)
    }
  }

  const stride = nx + 1
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = iy * stride + ix
      const b = a + 1
      const c = a + stride
      const d = c + 1
      if (valid[a] && valid[b] && valid[c] && valid[d]) {
        indices.push(a, c, b, b, c, d)
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  }
}

export function sampleCurve(curve: CompiledCurve, samples = 320): CurveSample {
  const points: Vec3[] = []
  const tMin = -4 * Math.PI
  const tMax = 4 * Math.PI

  for (let i = 0; i <= samples; i += 1) {
    const t = lerp(tMin, tMax, i / samples)
    const values = curve.components.map((component) =>
      component(scope({ x: 0, y: 0, z: 0, t })),
    ) as [number, number, number]
    if (values.every(Number.isFinite)) {
      points.push({ x: values[0], y: values[1], z: values[2] })
    }
  }

  return { points }
}

export function sampleVectorField(
  field: CompiledVectorField,
  bounds: Bounds3,
  settings: GraphSettings,
): VectorSample[] {
  const samples: VectorSample[] = []
  const density = clamp(Math.round(settings.vectorDensity), 2, 7)
  const steps = density + 2

  for (let ix = 0; ix < steps; ix += 1) {
    const x = lerp(bounds.xMin, bounds.xMax, (ix + 0.5) / steps)
    for (let iy = 0; iy < steps; iy += 1) {
      const y = lerp(bounds.yMin, bounds.yMax, (iy + 0.5) / steps)
      const zIterations = settings.vectorMode === 'slice' ? 1 : steps + 1
      for (let iz = 0; iz < zIterations; iz += 1) {
        const z =
          settings.vectorMode === 'slice'
            ? 0
            : lerp(bounds.zMin, bounds.zMax, (iz + 0.5) / zIterations)
        const vector = evaluateVector(field, { x, y, z })
        const magnitude = length(vector)
        if (Number.isFinite(magnitude) && magnitude > 0.00001) {
          samples.push({ origin: { x, y, z }, vector, magnitude })
        }
      }
    }
  }

  return samples
}

export function sampleGradientField(
  surface: CompiledSurface,
  bounds: Bounds3,
  settings: GraphSettings,
): VectorSample[] {
  const samples: VectorSample[] = []
  const steps = clamp(Math.round(settings.vectorDensity), 2, 7) + 2

  for (let ix = 0; ix < steps; ix += 1) {
    const x = lerp(bounds.xMin, bounds.xMax, (ix + 0.5) / steps)
    for (let iy = 0; iy < steps; iy += 1) {
      const y = lerp(bounds.yMin, bounds.yMax, (iy + 0.5) / steps)
      const s = scope({ x, y, z: 0, t: 0 })
      const z = surface.value(s)
      const fx = surface.dx(scope({ x, y, z, t: 0 }))
      const fy = surface.dy(scope({ x, y, z, t: 0 }))
      const vector = { x: fx, y: fy, z: 0 }
      const magnitude = length(vector)
      if (Number.isFinite(z) && Number.isFinite(magnitude) && magnitude > 0.00001) {
        samples.push({ origin: { x, y, z: z + 0.08 }, vector, magnitude })
      }
    }
  }

  return samples
}

export function sampleCurlField(
  field: CompiledVectorField,
  bounds: Bounds3,
  settings: GraphSettings,
): VectorSample[] {
  const samples: VectorSample[] = []
  const density = clamp(Math.round(settings.vectorDensity), 2, 7)
  const steps = density + 2

  for (let ix = 0; ix < steps; ix += 1) {
    const x = lerp(bounds.xMin, bounds.xMax, (ix + 0.5) / steps)
    for (let iy = 0; iy < steps; iy += 1) {
      const y = lerp(bounds.yMin, bounds.yMax, (iy + 0.5) / steps)
      const zIterations = settings.vectorMode === 'slice' ? 1 : steps + 1
      for (let iz = 0; iz < zIterations; iz += 1) {
        const z =
          settings.vectorMode === 'slice'
            ? 0
            : lerp(bounds.zMin, bounds.zMax, (iz + 0.5) / zIterations)
        const s = scope({ x, y, z, t: 0 })
        const d = field.derivatives
        const vector = {
          x: d.ry(s) - d.qz(s),
          y: d.pz(s) - d.rx(s),
          z: d.qx(s) - d.py(s),
        }
        const magnitude = length(vector)
        if (Number.isFinite(magnitude) && magnitude > 0.00001) {
          samples.push({ origin: { x, y, z }, vector, magnitude })
        }
      }
    }
  }

  return samples
}

export function sampleDivergenceField(
  field: CompiledVectorField,
  bounds: Bounds3,
  settings: GraphSettings,
): ScalarFieldSample[] {
  const samples: ScalarFieldSample[] = []
  const steps = clamp(Math.round(settings.vectorDensity), 2, 7) + 2
  const z = 0

  for (let ix = 0; ix < steps; ix += 1) {
    const x = lerp(bounds.xMin, bounds.xMax, (ix + 0.5) / steps)
    for (let iy = 0; iy < steps; iy += 1) {
      const y = lerp(bounds.yMin, bounds.yMax, (iy + 0.5) / steps)
      const s = scope({ x, y, z, t: 0 })
      const d = field.derivatives
      const value = d.px(s) + d.qy(s) + d.rz(s)
      if (Number.isFinite(value)) samples.push({ position: { x, y, z }, value })
    }
  }

  return samples
}

export function computeProbe(
  surface: CompiledSurface | undefined,
  vectorField: CompiledVectorField | undefined,
  probe: ProbeState,
  settings: GraphSettings,
): ProbeResult | undefined {
  if (!surface) return undefined
  const x = clamp(probe.x, settings.bounds.xMin, settings.bounds.xMax)
  const y = clamp(probe.y, settings.bounds.yMin, settings.bounds.yMax)
  const z = surface.value(scope({ x, y, z: 0, t: 0 }))
  if (!Number.isFinite(z)) return undefined

  const fx = surface.dx(scope({ x, y, z, t: 0 }))
  const fy = surface.dy(scope({ x, y, z, t: 0 }))
  const normal = normalize({ x: -fx, y: -fy, z: 1 })
  const theta = (settings.directionAngle * Math.PI) / 180
  const direction = { x: Math.cos(theta), y: Math.sin(theta) }
  const tangentSize =
    Math.min(settings.bounds.xMax - settings.bounds.xMin, settings.bounds.yMax - settings.bounds.yMin) /
    5
  const corners = [
    tangentPoint(x, y, z, fx, fy, -tangentSize, -tangentSize),
    tangentPoint(x, y, z, fx, fy, tangentSize, -tangentSize),
    tangentPoint(x, y, z, fx, fy, tangentSize, tangentSize),
    tangentPoint(x, y, z, fx, fy, -tangentSize, tangentSize),
  ] as [Vec3, Vec3, Vec3, Vec3]
  const result: ProbeResult = {
    point: { x, y, z },
    fx,
    fy,
    gradient2: { x: fx, y: fy },
    normal,
    tangentPlane: { center: { x, y, z }, corners },
    directionalDerivative: fx * direction.x + fy * direction.y,
    direction,
  }

  if (vectorField) {
    const v = evaluateVector(vectorField, { x, y, z })
    const d = vectorField.derivatives
    const s = scope({ x, y, z, t: 0 })
    result.vectorAtPoint = v
    result.divergence = d.px(s) + d.qy(s) + d.rz(s)
    result.curl = {
      x: d.ry(s) - d.qz(s),
      y: d.pz(s) - d.rx(s),
      z: d.qx(s) - d.py(s),
    }
  }

  return result
}

export function sampleTraceCurves(
  surface: CompiledSurface,
  probe: ProbeState,
  bounds: Bounds3,
  count = 140,
) {
  const xTrace: Vec3[] = []
  const yTrace: Vec3[] = []

  for (let i = 0; i <= count; i += 1) {
    const x = lerp(bounds.xMin, bounds.xMax, i / count)
    const y = probe.y
    const z = surface.value(scope({ x, y, z: 0, t: 0 }))
    if (Number.isFinite(z)) xTrace.push({ x, y, z })
  }

  for (let i = 0; i <= count; i += 1) {
    const x = probe.x
    const y = lerp(bounds.yMin, bounds.yMax, i / count)
    const z = surface.value(scope({ x, y, z: 0, t: 0 }))
    if (Number.isFinite(z)) yTrace.push({ x, y, z })
  }

  return { xTrace, yTrace }
}

export function formatNumber(value: number | undefined, digits = 3) {
  if (value === undefined || !Number.isFinite(value)) return 'n/a'
  if (Math.abs(value) < 0.0005) return '0'
  return Number(value.toFixed(digits)).toString()
}

export function mathToThree(point: Vec3): [number, number, number] {
  return [point.x, point.z, point.y]
}

export function vectorToThree(vector: Vec3): Vec3 {
  return { x: vector.x, y: vector.z, z: vector.y }
}

export function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

export function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector)
  if (!Number.isFinite(magnitude) || magnitude < 0.00001) return { x: 0, y: 0, z: 0 }
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function compileSurface(row: ExpressionRow): CompiledSurface {
  const source = normalizeMathInput(rightHandSide(row.expression))
  const compiled = compile(source) as Compiled
  const value = scalarFromCompiled(compiled)

  return {
    row,
    source,
    value,
    dx: derivativeFn(source, 'x', value),
    dy: derivativeFn(source, 'y', value),
  }
}

function compileCurve(row: ExpressionRow): CompiledCurve {
  const parts = vectorParts(rightHandSide(row.expression))
  if (parts.length !== 3) throw new Error('Curve needs three components')
  return {
    row,
    components: parts.map((part) => scalarFromCompiled(compile(normalizeMathInput(part)) as Compiled)) as [
      ScalarFn,
      ScalarFn,
      ScalarFn,
    ],
  }
}

function compileVectorField(row: ExpressionRow): CompiledVectorField {
  const parts = vectorParts(rightHandSide(row.expression))
  if (parts.length !== 3) throw new Error('Vector field needs three components')
  const normalized = parts.map(normalizeMathInput) as [string, string, string]
  const components = normalized.map((part) =>
    scalarFromCompiled(compile(part) as Compiled),
  ) as [ScalarFn, ScalarFn, ScalarFn]
  const [p, q, r] = normalized

  return {
    row,
    components,
    derivatives: {
      px: derivativeFn(p, 'x', components[0]),
      py: derivativeFn(p, 'y', components[0]),
      pz: derivativeFn(p, 'z', components[0]),
      qx: derivativeFn(q, 'x', components[1]),
      qy: derivativeFn(q, 'y', components[1]),
      qz: derivativeFn(q, 'z', components[1]),
      rx: derivativeFn(r, 'x', components[2]),
      ry: derivativeFn(r, 'y', components[2]),
      rz: derivativeFn(r, 'z', components[2]),
    },
  }
}

function compilePlane(row: ExpressionRow): CompiledPlane {
  const match = row.expression.trim().match(/^([xyz])\s*=\s*(.+)$/i)
  if (!match) throw new Error('Plane must look like x = c, y = c, or z = c')
  const value = scalarFromCompiled(compile(normalizeMathInput(match[2])) as Compiled)(scope({}))
  if (!Number.isFinite(value)) throw new Error('Plane value must be a finite number')
  return {
    row,
    axis: match[1].toLowerCase() as 'x' | 'y' | 'z',
    value,
  }
}

function derivativeFn(source: string, variable: 'x' | 'y' | 'z', base: ScalarFn): ScalarFn {
  try {
    const node = derivative(source, variable)
    return scalarFromCompiled(node.compile() as Compiled)
  } catch {
    return (s: Scope) => {
      const h = 0.0001
      const left = { ...s, [variable]: (s[variable] ?? 0) - h }
      const right = { ...s, [variable]: (s[variable] ?? 0) + h }
      return (base(right) - base(left)) / (2 * h)
    }
  }
}

function scalarFromCompiled(compiled: Compiled): ScalarFn {
  return (s: Scope) => toNumber(compiled.evaluate(scope(s)))
}

function evaluateVector(field: CompiledVectorField, values: Pick<Vec3, 'x' | 'y' | 'z'>): Vec3 {
  const s = scope({ ...values, t: 0 })
  return {
    x: field.components[0](s),
    y: field.components[1](s),
    z: field.components[2](s),
  }
}

function tangentPoint(
  x0: number,
  y0: number,
  z0: number,
  fx: number,
  fy: number,
  dx: number,
  dy: number,
): Vec3 {
  return {
    x: x0 + dx,
    y: y0 + dy,
    z: z0 + fx * dx + fy * dy,
  }
}

function scope(values: Scope): Scope {
  return {
    pi: Math.PI,
    e: Math.E,
    x: 0,
    y: 0,
    z: 0,
    t: 0,
    u: 0,
    v: 0,
    ...values,
  }
}

function normalizeMathInput(input: string) {
  return input
    .replaceAll('π', 'pi')
    .replaceAll('−', '-')
    .replace(/\)\s+(?=[a-zA-Z0-9(])/g, ')*')
    .replace(/(\d)\s+(?=[a-zA-Z(])/g, '$1*')
    .trim()
}

function rightHandSide(expression: string) {
  const index = expression.indexOf('=')
  return index >= 0 ? expression.slice(index + 1).trim() : expression.trim()
}

function vectorParts(value: string) {
  const trimmed = value.trim()
  const unwrapped =
    (trimmed.startsWith('<') && trimmed.endsWith('>')) ||
    (trimmed.startsWith('(') && trimmed.endsWith(')'))
      ? trimmed.slice(1, -1)
      : trimmed
  return splitTopLevel(unwrapped)
}

function splitTopLevel(value: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(' || char === '[' || char === '<') depth += 1
    if (char === ')' || char === ']' || char === '>') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value && typeof value === 'object' && 'valueOf' in value) {
    const numberValue = Number(value.valueOf())
    return numberValue
  }
  return Number(value)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
