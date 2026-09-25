import type { DishRenderSnapshot } from "../render/model";
import type { ComposedSimulationSnapshot } from "../sim/protocol";
import {
  FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
  type FungalSurfaceFrontRenderProjection,
} from "./fungalSurfaceRenderProjection";

export const HETEROGENEOUS_DISH_RENDER_TRANSACTION_SCHEMA_VERSION = 1 as const;
export const FUNGAL_SURFACE_FRONT_RENDER_COMPANION_SCHEMA_VERSION = 1 as const;

export interface AuthoritativeRenderTransactionPosition {
  readonly runBranchIdentity: string;
  readonly acceptedCommandCount: number;
  readonly simulationTimeHours: number;
}

export interface FungalSurfaceFrontRenderCompanion {
  readonly schemaVersion:
    typeof FUNGAL_SURFACE_FRONT_RENDER_COMPANION_SCHEMA_VERSION;
  readonly kind: "fungal-surface-front";
  readonly position: AuthoritativeRenderTransactionPosition;
  readonly projection: FungalSurfaceFrontRenderProjection;
}

export interface HeterogeneousDishRenderTransaction {
  readonly schemaVersion:
    typeof HETEROGENEOUS_DISH_RENDER_TRANSACTION_SCHEMA_VERSION;
  readonly authority: "heterogeneous-authoritative-render-transaction";
  readonly position: AuthoritativeRenderTransactionPosition;
  readonly traceHash: string;
  readonly dishSnapshot: DishRenderSnapshot;
  readonly fungalSurfaceFronts: readonly FungalSurfaceFrontRenderCompanion[];
  readonly crossSpeciesInteractionAuthority: "absent";
}

export interface CreateFungalSurfaceFrontRenderCompanionArgs {
  readonly position: AuthoritativeRenderTransactionPosition;
  readonly projection: FungalSurfaceFrontRenderProjection;
}

export interface CreateHeterogeneousDishRenderTransactionArgs {
  readonly runBranchIdentity: string;
  readonly simulationSnapshot: ComposedSimulationSnapshot;
  readonly dishSnapshot: DishRenderSnapshot;
  readonly fungalSurfaceFronts?: readonly FungalSurfaceFrontRenderCompanion[];
}

/**
 * Binds an already-authoritative fungal source-front projection to one exact
 * runtime render position. This does not make the fungal front part of the
 * bacterial biomass/resource model and does not create cross-species biology.
 */
export function createFungalSurfaceFrontRenderCompanion(
  args: CreateFungalSurfaceFrontRenderCompanionArgs,
): FungalSurfaceFrontRenderCompanion {
  const position = cloneAndValidatePosition(args.position);
  validateFungalSurfaceFrontProjection(args.projection);
  if (args.projection.biologicalTimeHours !== position.simulationTimeHours) {
    throw new RangeError(
      "fungal surface-front companion biological time must exactly match its runtime position",
    );
  }

  return Object.freeze({
    schemaVersion: FUNGAL_SURFACE_FRONT_RENDER_COMPANION_SCHEMA_VERSION,
    kind: "fungal-surface-front",
    position,
    projection: cloneFungalSurfaceFrontProjection(args.projection),
  });
}

/**
 * Composes heterogeneous renderer-safe scientific authorities at one exact
 * accepted runtime position.
 *
 * The existing DishRenderSnapshot is reused rather than rescanned or copied:
 * composedDishProjection already detached its large typed-array channels from
 * simulation authority. Only the small organism-specific companion metadata is
 * cloned here. A caller must bind every companion to the same branch, accepted
 * command position, and biological time before it can enter the transaction.
 */
export function createHeterogeneousDishRenderTransaction(
  args: CreateHeterogeneousDishRenderTransactionArgs,
): HeterogeneousDishRenderTransaction {
  const checkpoint = args.simulationSnapshot.checkpoint;
  if (checkpoint.authority !== "composed") {
    throw new Error(
      "heterogeneous dish render transaction requires composed simulation authority",
    );
  }

  const position = cloneAndValidatePosition({
    runBranchIdentity: args.runBranchIdentity,
    acceptedCommandCount: checkpoint.commandCount,
    simulationTimeHours: checkpoint.simulationTimeHours,
  });
  assertCanonicalIdentity("trace hash", args.simulationSnapshot.traceHash);

  const expectedSnapshotId = `composed-trace:${args.simulationSnapshot.traceHash}`;
  if (args.dishSnapshot.snapshotId !== expectedSnapshotId) {
    throw new Error(
      "heterogeneous dish render transaction requires the dish snapshot from the same authoritative trace",
    );
  }
  const expectedSamplingIdentity = `runtime-branch:${position.runBranchIdentity}`;
  if (args.dishSnapshot.samplingIdentity !== expectedSamplingIdentity) {
    throw new Error(
      "heterogeneous dish render transaction requires the dish snapshot from the same runtime branch",
    );
  }
  if (
    args.dishSnapshot.simulationTimeHours !== position.simulationTimeHours
  ) {
    throw new RangeError(
      "heterogeneous dish render transaction requires exact dish/runtime biological-time equality",
    );
  }

  const seenFungalIdentities = new Set<string>();
  const fungalSurfaceFronts = (args.fungalSurfaceFronts ?? []).map(
    (companion) => {
      validateFungalCompanion(companion);
      assertSamePosition(
        position,
        companion.position,
        "fungal surface-front companion",
      );
      const identity = fungalCompanionIdentity(companion.projection);
      if (seenFungalIdentities.has(identity)) {
        throw new Error(
          "heterogeneous dish render transaction rejects duplicate fungal source-front identity",
        );
      }
      seenFungalIdentities.add(identity);
      return createFungalSurfaceFrontRenderCompanion({
        position: companion.position,
        projection: companion.projection,
      });
    },
  );

  return Object.freeze({
    schemaVersion: HETEROGENEOUS_DISH_RENDER_TRANSACTION_SCHEMA_VERSION,
    authority: "heterogeneous-authoritative-render-transaction",
    position,
    traceHash: args.simulationSnapshot.traceHash,
    dishSnapshot: args.dishSnapshot,
    fungalSurfaceFronts: Object.freeze(fungalSurfaceFronts),
    crossSpeciesInteractionAuthority: "absent",
  });
}

function validateFungalCompanion(
  companion: FungalSurfaceFrontRenderCompanion,
): void {
  if (
    companion.schemaVersion !==
      FUNGAL_SURFACE_FRONT_RENDER_COMPANION_SCHEMA_VERSION ||
    companion.kind !== "fungal-surface-front"
  ) {
    throw new Error(
      "heterogeneous dish render transaction requires a supported fungal companion schema",
    );
  }
  cloneAndValidatePosition(companion.position);
  validateFungalSurfaceFrontProjection(companion.projection);
  if (
    companion.projection.biologicalTimeHours !==
    companion.position.simulationTimeHours
  ) {
    throw new RangeError(
      "fungal surface-front companion biological time must exactly match its runtime position",
    );
  }
}

function cloneAndValidatePosition(
  position: AuthoritativeRenderTransactionPosition,
): AuthoritativeRenderTransactionPosition {
  assertCanonicalIdentity("runtime branch identity", position.runBranchIdentity);
  if (
    !Number.isSafeInteger(position.acceptedCommandCount) ||
    position.acceptedCommandCount < 0
  ) {
    throw new RangeError(
      "authoritative render transaction accepted command count must be a non-negative safe integer",
    );
  }
  if (
    !Number.isFinite(position.simulationTimeHours) ||
    position.simulationTimeHours < 0
  ) {
    throw new RangeError(
      "authoritative render transaction biological time must be finite and non-negative",
    );
  }
  return Object.freeze({
    runBranchIdentity: position.runBranchIdentity,
    acceptedCommandCount: position.acceptedCommandCount,
    simulationTimeHours: position.simulationTimeHours,
  });
}

function assertSamePosition(
  expected: AuthoritativeRenderTransactionPosition,
  actual: AuthoritativeRenderTransactionPosition,
  label: string,
): void {
  if (
    actual.runBranchIdentity !== expected.runBranchIdentity ||
    actual.acceptedCommandCount !== expected.acceptedCommandCount ||
    actual.simulationTimeHours !== expected.simulationTimeHours
  ) {
    throw new Error(
      `${label} must match the enclosing runtime branch, accepted command position, and biological time`,
    );
  }
}

function validateFungalSurfaceFrontProjection(
  projection: FungalSurfaceFrontRenderProjection,
): void {
  if (
    projection.schemaVersion !==
      FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION ||
    projection.authority !== "source-validation-front" ||
    projection.geometryKind !== "central-point-radial-front"
  ) {
    throw new Error(
      "fungal surface-front companion requires the supported source-validation projection schema",
    );
  }
  assertCanonicalIdentity("fungal source pack id", projection.sourcePackId);
  assertCanonicalIdentity("fungal taxon id", projection.taxonId);
  assertCanonicalIdentity(
    "fungal taxon content version",
    projection.taxonContentVersion,
  );
  assertCanonicalIdentity("fungal treatment id", projection.treatmentId);

  if (
    !Number.isFinite(projection.biologicalTimeHours) ||
    projection.biologicalTimeHours < 0
  ) {
    throw new RangeError(
      "fungal surface-front biological time must be finite and non-negative",
    );
  }
  if (
    !Number.isFinite(projection.fixedSourceTreatment.glucoseGPerL) ||
    projection.fixedSourceTreatment.glucoseGPerL < 0 ||
    projection.fixedSourceTreatment.unit !== "g/L" ||
    projection.fixedSourceTreatment.role !==
      "experimental-condition-identity"
  ) {
    throw new Error(
      "fungal surface-front fixed source treatment identity is malformed",
    );
  }
  if (
    !Number.isFinite(projection.plate.radiusUm) ||
    projection.plate.radiusUm <= 0 ||
    projection.plate.unit !== "um" ||
    projection.plate.centerNormalized.x !== 0.5 ||
    projection.plate.centerNormalized.y !== 0.5
  ) {
    throw new Error("fungal surface-front source plate geometry is malformed");
  }
  if (
    !Number.isFinite(projection.front.radiusUm) ||
    projection.front.radiusUm < 0 ||
    projection.front.radiusUm > projection.plate.radiusUm ||
    !Number.isFinite(projection.front.normalizedRadius) ||
    projection.front.normalizedRadius < 0 ||
    projection.front.normalizedRadius > 1
  ) {
    throw new RangeError("fungal surface-front geometry is out of range");
  }
  const expectedNormalized =
    projection.front.radiusUm / projection.plate.radiusUm;
  if (!numbersAgree(projection.front.normalizedRadius, expectedNormalized)) {
    throw new Error(
      "fungal surface-front normalized radius must match the physical source-front radius",
    );
  }
  if (
    projection.front.atDishBoundary !==
    numbersAgree(projection.front.radiusUm, projection.plate.radiusUm)
  ) {
    throw new Error(
      "fungal surface-front boundary flag must match the physical source-front radius",
    );
  }

  if (
    projection.unsupportedScientificSemantics.length !==
      FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS.length ||
    projection.unsupportedScientificSemantics.some(
      (value, index) =>
        value !== FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS[index],
    )
  ) {
    throw new Error(
      "fungal surface-front companion must preserve the exact unsupported-science refusal surface",
    );
  }
}

function cloneFungalSurfaceFrontProjection(
  projection: FungalSurfaceFrontRenderProjection,
): FungalSurfaceFrontRenderProjection {
  return Object.freeze({
    schemaVersion: projection.schemaVersion,
    authority: projection.authority,
    geometryKind: projection.geometryKind,
    sourcePackId: projection.sourcePackId,
    taxonId: projection.taxonId,
    taxonContentVersion: projection.taxonContentVersion,
    treatmentId: projection.treatmentId,
    biologicalTimeHours: projection.biologicalTimeHours,
    fixedSourceTreatment: Object.freeze({
      glucoseGPerL: projection.fixedSourceTreatment.glucoseGPerL,
      unit: projection.fixedSourceTreatment.unit,
      role: projection.fixedSourceTreatment.role,
    }),
    plate: Object.freeze({
      radiusUm: projection.plate.radiusUm,
      unit: projection.plate.unit,
      centerNormalized: Object.freeze({
        x: projection.plate.centerNormalized.x,
        y: projection.plate.centerNormalized.y,
      }),
    }),
    front: Object.freeze({
      radiusUm: projection.front.radiusUm,
      normalizedRadius: projection.front.normalizedRadius,
      atDishBoundary: projection.front.atDishBoundary,
    }),
    unsupportedScientificSemantics: Object.freeze([
      ...projection.unsupportedScientificSemantics,
    ]),
  });
}

function fungalCompanionIdentity(
  projection: FungalSurfaceFrontRenderProjection,
): string {
  return [
    projection.sourcePackId,
    projection.taxonId,
    projection.taxonContentVersion,
    projection.treatmentId,
    projection.geometryKind,
  ].join("\u0000");
}

function assertCanonicalIdentity(label: string, value: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${label} must be canonical non-empty text`);
  }
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true;
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  );
}
