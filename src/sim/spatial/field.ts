export interface GridSpec {
  width: number
  height: number
  cellSize: number
  centerX?: number
  centerY?: number
  radius?: number
}

export interface DiffusionResult {
  substeps: number
  dtPerSubstep: number
}

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`)
}

/**
 * Validate a scalar before it enters authoritative Float32 field storage.
 * JavaScript can represent finite numbers that binary32 would round to Infinity,
 * so Number.isFinite(value) alone is not a sufficient storage-domain check.
 */
export function requireFiniteNonNegativeFloat32(
  name: string,
  value: number,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
  const stored = Math.fround(value)
  if (!Number.isFinite(stored)) {
    throw new Error(`${name} must fit in finite Float32 field storage`)
  }
  return stored
}

/**
 * Dense scalar field over a circular Petri-dish mask.
 * Values outside the mask are always zero and are never part of simulation authority.
 */
export class CircularScalarField {
  readonly width: number
  readonly height: number
  readonly cellSize: number
  readonly mask: Uint8Array
  readonly values: Float32Array
  private readonly scratch: Float32Array

  constructor(spec: GridSpec, initialValue = 0) {
    if (!Number.isSafeInteger(spec.width) || spec.width < 3) throw new Error('width must be an integer >= 3')
    if (!Number.isSafeInteger(spec.height) || spec.height < 3) throw new Error('height must be an integer >= 3')
    requirePositiveFinite('cellSize', spec.cellSize)
    const storedInitialValue = requireFiniteNonNegativeFloat32('initialValue', initialValue)

    this.width = spec.width
    this.height = spec.height
    this.cellSize = spec.cellSize
    const length = spec.width * spec.height
    this.mask = new Uint8Array(length)
    this.values = new Float32Array(length)
    this.scratch = new Float32Array(length)

    const centerX = spec.centerX ?? (spec.width - 1) / 2
    const centerY = spec.centerY ?? (spec.height - 1) / 2
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      throw new Error('dish center coordinates must be finite')
    }

    const radius = spec.radius ?? Math.min(spec.width, spec.height) / 2 - 0.5
    requirePositiveFinite('radius', radius)
    const radiusSquared = radius * radius
    let inDomainCells = 0

    for (let y = 0; y < spec.height; y += 1) {
      for (let x = 0; x < spec.width; x += 1) {
        const index = this.index(x, y)
        const dx = x - centerX
        const dy = y - centerY
        if (dx * dx + dy * dy <= radiusSquared) {
          this.mask[index] = 1
          this.values[index] = storedInitialValue
          inDomainCells += 1
        }
      }
    }

    if (inDomainCells === 0) {
      throw new Error('dish geometry must include at least one authoritative grid cell')
    }
  }

  index(x: number, y: number): number {
    return y * this.width + x
  }

  isInside(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height && this.mask[this.index(x, y)] === 1
  }

  total(): number {
    let total = 0
    for (let index = 0; index < this.values.length; index += 1) {
      if (this.mask[index] === 1) total += this.values[index]!
    }
    return total
  }

  fill(value: number): void {
    const stored = requireFiniteNonNegativeFloat32('field value', value)
    for (let index = 0; index < this.values.length; index += 1) {
      this.values[index] = this.mask[index] === 1 ? stored : 0
    }
  }

  set(x: number, y: number, value: number): void {
    if (!this.isInside(x, y)) throw new Error('cannot write outside the dish mask')
    const stored = requireFiniteNonNegativeFloat32('field value', value)
    this.values[this.index(x, y)] = stored
  }

  get(x: number, y: number): number {
    if (!this.isInside(x, y)) return 0
    return this.values[this.index(x, y)]!
  }

  /**
   * Explicit 5-point finite-difference diffusion with a conservative no-flux rim.
   * Missing/outside neighbours contribute zero flux rather than concentration zero.
   * dt is automatically subdivided so alpha = D*dt/dx^2 <= 1/4 in 2D.
   */
  diffuse(diffusivity: number, dt: number): DiffusionResult {
    if (!Number.isFinite(diffusivity) || diffusivity < 0) throw new Error('diffusivity must be finite and non-negative')
    if (!Number.isFinite(dt) || dt < 0) throw new Error('dt must be finite and non-negative')
    if (diffusivity === 0 || dt === 0) return { substeps: 0, dtPerSubstep: 0 }

    const stableDt = (this.cellSize * this.cellSize) / (4 * diffusivity)
    const substeps = Math.max(1, Math.ceil(dt / stableDt))
    const dtPerSubstep = dt / substeps
    const alpha = (diffusivity * dtPerSubstep) / (this.cellSize * this.cellSize)

    for (let step = 0; step < substeps; step += 1) {
      this.diffuseSubstep(alpha)
    }
    return { substeps, dtPerSubstep }
  }

  private diffuseSubstep(alpha: number): void {
    const source = this.values
    const target = this.scratch
    target.fill(0)

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = this.index(x, y)
        if (this.mask[index] === 0) continue
        const center = source[index]!
        let flux = 0
        if (this.isInside(x - 1, y)) flux += source[this.index(x - 1, y)]! - center
        if (this.isInside(x + 1, y)) flux += source[this.index(x + 1, y)]! - center
        if (this.isInside(x, y - 1)) flux += source[this.index(x, y - 1)]! - center
        if (this.isInside(x, y + 1)) flux += source[this.index(x, y + 1)]! - center
        const next = center + alpha * flux
        target[index] = next < 0 && next > -1e-7 ? 0 : next
        if (!Number.isFinite(target[index]!) || target[index]! < 0) {
          throw new Error('diffusion produced an invalid concentration')
        }
      }
    }

    source.set(target)
  }
}
