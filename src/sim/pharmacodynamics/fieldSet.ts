export const ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION = 1 as const;

export const ANTIMICROBIAL_EFFECT_CHANNELS = [
  "division-multiplier",
  "incremental-loss-hazard",
] as const;

export type AntimicrobialEffectChannel =
  (typeof ANTIMICROBIAL_EFFECT_CHANNELS)[number];

export interface AntimicrobialFieldAuthority {
  readonly drugId: string;
  readonly authorityId: string;
  readonly authorityVersion: string;
  readonly concentrationUnit: string;
  readonly effectChannels: readonly AntimicrobialEffectChannel[];
}

export interface AntimicrobialSpatialField {
  readonly authority: AntimicrobialFieldAuthority;
  readonly width: number;
  readonly height: number;
  readonly values: Float32Array;
}

export interface AntimicrobialFieldSet {
  readonly schemaVersion: typeof ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION;
  readonly fields: readonly AntimicrobialSpatialField[];
}

export interface AntimicrobialFieldGridAuthority {
  readonly width: number;
  readonly height: number;
  readonly dishMask: readonly number[] | Uint8Array;
}

const CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CANONICAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Builds a detached multi-antimicrobial field transaction.
 *
 * This contract is intentionally mechanism-neutral. It preserves exact drug,
 * authority-version, concentration-unit and effect-channel identity without
 * choosing a pharmacodynamic equation from a drug name. In particular, it
 * performs no unit conversion and authorizes no cross-drug composition.
 */
export function createAntimicrobialFieldSet(
  fields: readonly AntimicrobialSpatialField[],
  grid: AntimicrobialFieldGridAuthority,
): AntimicrobialFieldSet {
  const detached: AntimicrobialFieldSet = {
    schemaVersion: ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION,
    fields: Object.freeze(
      fields.map((field) =>
        Object.freeze({
          authority: Object.freeze({
            ...field.authority,
            effectChannels: Object.freeze([...field.authority.effectChannels]),
          }),
          width: field.width,
          height: field.height,
          values: Float32Array.from(field.values),
        }),
      ),
    ),
  };

  validateAntimicrobialFieldSet(detached, grid);
  return Object.freeze(detached);
}

/**
 * Validates a field set against the exact authoritative spatial mask.
 *
 * Zero outside the mask is required so inactive presentation/off-dish storage
 * cannot later become biological exposure when another consumer reads the
 * channel.
 */
export function validateAntimicrobialFieldSet(
  set: AntimicrobialFieldSet,
  grid: AntimicrobialFieldGridAuthority,
): void {
  if (set.schemaVersion !== ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION) {
    throw new Error(
      `antimicrobial field set schemaVersion must equal ${ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION}`,
    );
  }
  validateGrid(grid);

  if (!Array.isArray(set.fields)) {
    throw new Error("antimicrobial field set fields must be an array");
  }

  const cells = grid.width * grid.height;
  const drugIds = new Set<string>();
  for (let index = 0; index < set.fields.length; index += 1) {
    if (!(index in set.fields)) {
      throw new Error("antimicrobial field set fields must be dense");
    }
    const field = set.fields[index]!;
    validateFieldAuthority(field.authority, index);

    if (drugIds.has(field.authority.drugId)) {
      throw new Error(
        `antimicrobial field set contains duplicate drugId ${JSON.stringify(field.authority.drugId)}`,
      );
    }
    drugIds.add(field.authority.drugId);

    if (field.width !== grid.width || field.height !== grid.height) {
      throw new Error(
        `antimicrobial field ${JSON.stringify(field.authority.drugId)} dimensions must match the authoritative grid`,
      );
    }
    if (!(field.values instanceof Float32Array)) {
      throw new Error(
        `antimicrobial field ${JSON.stringify(field.authority.drugId)} values must be Float32Array`,
      );
    }
    if (field.values.length !== cells) {
      throw new Error(
        `antimicrobial field ${JSON.stringify(field.authority.drugId)} length must match the authoritative grid`,
      );
    }

    for (let cell = 0; cell < cells; cell += 1) {
      const value = field.values[cell]!;
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(
          `antimicrobial field ${JSON.stringify(field.authority.drugId)} concentrations must be finite and non-negative`,
        );
      }
      if (grid.dishMask[cell] === 0 && value !== 0) {
        throw new Error(
          `antimicrobial field ${JSON.stringify(field.authority.drugId)} must be zero outside the authoritative dish mask`,
        );
      }
    }
  }
}

/**
 * Returns exact drug IDs whose authoritative field contains any non-zero
 * in-mask concentration. Field order is preserved.
 */
export function activeAntimicrobialDrugIds(
  set: AntimicrobialFieldSet,
  grid: AntimicrobialFieldGridAuthority,
): readonly string[] {
  validateAntimicrobialFieldSet(set, grid);

  const active: string[] = [];
  for (const field of set.fields) {
    let nonZero = false;
    for (let index = 0; index < field.values.length; index += 1) {
      if (grid.dishMask[index] === 1 && field.values[index]! > 0) {
        nonZero = true;
        break;
      }
    }
    if (nonZero) active.push(field.authority.drugId);
  }
  return Object.freeze(active);
}

/**
 * Current safe activation gate for prepared multiple-drug state.
 *
 * More than one non-zero antimicrobial field has no generic biological
 * meaning. Until a scenario supplies a separately reviewed joint-composition
 * policy, simultaneous exposure must fail closed rather than multiplying
 * division effects, summing hazards, or assuming Bliss/Loewe additivity.
 */
export function assertSingleActiveAntimicrobialOnly(
  set: AntimicrobialFieldSet,
  grid: AntimicrobialFieldGridAuthority,
): void {
  const active = activeAntimicrobialDrugIds(set, grid);
  if (active.length > 1) {
    throw new Error(
      `simultaneous antimicrobial exposure requires explicit joint-composition authority; active drugs: ${active.join(", ")}`,
    );
  }
}

function validateGrid(grid: AntimicrobialFieldGridAuthority): void {
  if (
    !Number.isSafeInteger(grid.width) ||
    !Number.isSafeInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0
  ) {
    throw new RangeError(
      "antimicrobial field grid width and height must be positive safe integers",
    );
  }
  const cells = grid.width * grid.height;
  if (!Number.isSafeInteger(cells)) {
    throw new RangeError("antimicrobial field grid cell count must be a safe integer");
  }
  if (grid.dishMask.length !== cells) {
    throw new Error(
      "antimicrobial field grid dishMask length must match width × height",
    );
  }
  for (const value of grid.dishMask) {
    if (value !== 0 && value !== 1) {
      throw new Error("antimicrobial field grid dishMask must be binary");
    }
  }
}

function validateFieldAuthority(
  authority: AntimicrobialFieldAuthority,
  index: number,
): void {
  const prefix = `antimicrobial field[${index}] authority`;
  canonicalIdentifier(`${prefix}.drugId`, authority.drugId);
  canonicalIdentifier(`${prefix}.authorityId`, authority.authorityId);
  canonicalVersion(`${prefix}.authorityVersion`, authority.authorityVersion);
  canonicalText(`${prefix}.concentrationUnit`, authority.concentrationUnit);

  if (
    !Array.isArray(authority.effectChannels) ||
    authority.effectChannels.length === 0
  ) {
    throw new Error(`${prefix}.effectChannels must be a non-empty array`);
  }
  const seen = new Set<AntimicrobialEffectChannel>();
  for (const channel of authority.effectChannels) {
    if (
      !(ANTIMICROBIAL_EFFECT_CHANNELS as readonly string[]).includes(channel)
    ) {
      throw new Error(
        `${prefix}.effectChannels contains unsupported channel ${JSON.stringify(channel)}`,
      );
    }
    if (seen.has(channel)) {
      throw new Error(
        `${prefix}.effectChannels contains duplicate channel ${JSON.stringify(channel)}`,
      );
    }
    seen.add(channel);
  }
}

function canonicalText(path: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${path} must be non-empty canonical text`);
  }
  return value;
}

function canonicalIdentifier(path: string, value: unknown): string {
  const text = canonicalText(path, value);
  if (!CANONICAL_ID.test(text)) {
    throw new Error(`${path} contains unsupported identifier characters`);
  }
  return text;
}

function canonicalVersion(path: string, value: unknown): string {
  const text = canonicalText(path, value);
  if (!CANONICAL_VERSION.test(text)) {
    throw new Error(`${path} contains unsupported version characters`);
  }
  return text;
}
