export type ExpressionType =
  | 'surface'
  | 'curve'
  | 'vector'
  | 'gradient'
  | 'divergence'
  | 'curl'
  | 'implicit'
  | 'plane'
  | 'unresolved'

export interface ExpressionRow {
  id: string
  type: ExpressionType
  expression: string
  color: string
  enabled: boolean
  note?: string
}

export interface Bounds3 {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
}

export interface GraphSettings {
  bounds: Bounds3
  perspective: number
  showXY: boolean
  showYZ: boolean
  showXZ: boolean
  showNumbers: boolean
  showLabels: boolean
  translucentSurfaces: boolean
  vectorDensity: number
  vectorScale: number
  vectorMode: 'volume' | 'slice'
  gradient: boolean
  divergence: boolean
  curl: boolean
  tangentPlane: boolean
  normal: boolean
  tracePlane: boolean
  directionAngle: number
}

export interface ProbeState {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}
