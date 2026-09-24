import rawTransportEvidence from "../../../data/phage/t4_hu_2010_2012_transport.json";

export type TransportMaterial = "water" | "agarose";
export type EmbeddedHostCondition =
  | "none"
  | "dead-escherichia-coli-k12";

export interface PhageTransportSource {
  readonly key: string;
  readonly label: string;
  readonly doi: string;
}

export interface PhageTransportMatrix {
  readonly material: TransportMaterial;
  readonly barrier: string;
  readonly agarosePercent: number | null;
  readonly embeddedHostCondition: EmbeddedHostCondition;
}

export interface MeasuredPhageTransport {
  readonly id: string;
  readonly sourceKey: string;
  readonly matrix: PhageTransportMatrix;
  readonly apparentDiffusionCoefficientM2PerS: number;
  readonly classification: "measured";
  readonly limitation: string;
}

export interface PetraPhageTransportCalibration {
  readonly id: string;
  readonly selectedMeasurementId: string;
  readonly classification: "transferred";
  readonly matrix: Readonly<{
    material: "agarose";
    agarosePercent: number;
    embeddedHostCondition: "none";
  }>;
  readonly limitation: string;
  readonly freePhageLoss: Readonly<{
    status: "unbound";
    limitation: string;
  }>;
}

export interface PhageTransportEvidence {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly phage: Readonly<{ name: "T4" }>;
  readonly units: Readonly<{
    diffusionCoefficient: "m^2 s^-1";
    agaroseConcentration: "%";
  }>;
  readonly sources: readonly PhageTransportSource[];
  readonly measurements: readonly MeasuredPhageTransport[];
  readonly petraCalibration: PetraPhageTransportCalibration;
}

export interface PetraTransportContext {
  readonly material: "agarose" | "water" | "other";
  readonly agarosePercent: number | null;
  readonly embeddedHostCondition:
    | "none"
    | "dead-escherichia-coli-k12"
    | "living"
    | "other";
}

export type PhageTransportResolution =
  | {
      readonly status: "calibrated";
      readonly evidenceClass: "transferred";
      readonly diffusionCoefficientM2PerS: number;
      readonly sourceMeasurement: MeasuredPhageTransport;
      readonly calibration: PetraPhageTransportCalibration;
      readonly sources: readonly PhageTransportSource[];
    }
  | {
      readonly status: "out-of-domain";
      readonly evidenceClass: null;
      readonly reasons: readonly string[];
      readonly calibration: PetraPhageTransportCalibration;
    };

export const T4_TRANSPORT_EVIDENCE = parseTransportEvidence(
  rawTransportEvidence as unknown,
);

/**
 * Resolve Petra's deliberately narrow T4 extracellular transport calibration.
 *
 * The active coefficient is a transferred use of Hu et al. 2012's measured
 * apparent T4 diffusion in a 0.5% agarose gel membrane without embedded hosts.
 * It is not extrapolated to living host-bearing regions or other matrices.
 */
export function resolveT4Transport(
  context: PetraTransportContext,
  evidence: PhageTransportEvidence = T4_TRANSPORT_EVIDENCE,
): PhageTransportResolution {
  validateContext(context);

  const expected = evidence.petraCalibration.matrix;
  const reasons: string[] = [];

  if (context.material !== expected.material) {
    reasons.push("matrix-material");
  }
  if (context.agarosePercent !== expected.agarosePercent) {
    reasons.push("agarose-concentration");
  }
  if (context.embeddedHostCondition !== expected.embeddedHostCondition) {
    reasons.push("embedded-host-condition");
  }

  if (reasons.length > 0) {
    return {
      status: "out-of-domain",
      evidenceClass: null,
      reasons,
      calibration: evidence.petraCalibration,
    };
  }

  const sourceMeasurement = evidence.measurements.find(
    (measurement) =>
      measurement.id === evidence.petraCalibration.selectedMeasurementId,
  );
  if (sourceMeasurement === undefined) {
    throw new Error("selected phage transport measurement is missing");
  }

  return {
    status: "calibrated",
    evidenceClass: "transferred",
    diffusionCoefficientM2PerS:
      sourceMeasurement.apparentDiffusionCoefficientM2PerS,
    sourceMeasurement,
    calibration: evidence.petraCalibration,
    sources: evidence.sources,
  };
}

function parseTransportEvidence(raw: unknown): PhageTransportEvidence {
  if (!isRecord(raw)) {
    throw new TypeError("phage transport evidence must be an object");
  }
  if (raw.schemaVersion !== 1) {
    throw new TypeError("unsupported phage transport schema version");
  }
  requireNonEmptyString(raw.id, "id");

  const phage = requireRecord(raw.phage, "phage");
  if (phage.name !== "T4") {
    throw new TypeError("transport evidence must identify phage T4");
  }

  const units = requireRecord(raw.units, "units");
  if (
    units.diffusionCoefficient !== "m^2 s^-1" ||
    units.agaroseConcentration !== "%"
  ) {
    throw new TypeError("unexpected phage transport units");
  }

  if (!Array.isArray(raw.sources) || raw.sources.length < 2) {
    throw new TypeError("phage transport evidence requires source records");
  }
  const sourceKeys = new Set<string>();
  for (let index = 0; index < raw.sources.length; index += 1) {
    const source = requireRecord(raw.sources[index], `sources[${index}]`);
    const key = requireNonEmptyString(source.key, `sources[${index}].key`);
    requireNonEmptyString(source.label, `sources[${index}].label`);
    requireNonEmptyString(source.doi, `sources[${index}].doi`);
    if (sourceKeys.has(key)) {
      throw new RangeError(`duplicate phage transport source key: ${key}`);
    }
    sourceKeys.add(key);
  }

  if (!Array.isArray(raw.measurements) || raw.measurements.length < 3) {
    throw new TypeError("phage transport evidence requires measured anchors");
  }
  const measurementIds = new Set<string>();
  for (let index = 0; index < raw.measurements.length; index += 1) {
    const measurement = requireRecord(
      raw.measurements[index],
      `measurements[${index}]`,
    );
    const id = requireNonEmptyString(
      measurement.id,
      `measurements[${index}].id`,
    );
    const sourceKey = requireNonEmptyString(
      measurement.sourceKey,
      `measurements[${index}].sourceKey`,
    );
    if (!sourceKeys.has(sourceKey)) {
      throw new RangeError(
        `measurement ${id} references unknown source ${sourceKey}`,
      );
    }
    if (measurementIds.has(id)) {
      throw new RangeError(`duplicate phage transport measurement id: ${id}`);
    }
    measurementIds.add(id);

    if (measurement.classification !== "measured") {
      throw new TypeError("source transport anchors must be classified measured");
    }
    finitePositive(
      `measurements[${index}].apparentDiffusionCoefficientM2PerS`,
      measurement.apparentDiffusionCoefficientM2PerS,
    );
    requireNonEmptyString(
      measurement.limitation,
      `measurements[${index}].limitation`,
    );
    validateMeasuredMatrix(
      requireRecord(measurement.matrix, `measurements[${index}].matrix`),
      `measurements[${index}].matrix`,
    );
  }

  const calibration = requireRecord(raw.petraCalibration, "petraCalibration");
  requireNonEmptyString(calibration.id, "petraCalibration.id");
  const selectedMeasurementId = requireNonEmptyString(
    calibration.selectedMeasurementId,
    "petraCalibration.selectedMeasurementId",
  );
  if (!measurementIds.has(selectedMeasurementId)) {
    throw new RangeError("Petra calibration references an unknown measurement");
  }
  if (calibration.classification !== "transferred") {
    throw new TypeError("Petra transport calibration must be transferred");
  }
  requireNonEmptyString(calibration.limitation, "petraCalibration.limitation");

  const calibrationMatrix = requireRecord(
    calibration.matrix,
    "petraCalibration.matrix",
  );
  if (
    calibrationMatrix.material !== "agarose" ||
    calibrationMatrix.embeddedHostCondition !== "none"
  ) {
    throw new TypeError(
      "Petra T4 transport calibration must remain host-free agarose",
    );
  }
  const agarosePercent = finitePositive(
    "petraCalibration.matrix.agarosePercent",
    calibrationMatrix.agarosePercent,
  );

  const selected = raw.measurements.find((candidate) => {
    if (!isRecord(candidate)) return false;
    return candidate.id === selectedMeasurementId;
  });
  if (!isRecord(selected)) {
    throw new Error("selected transport measurement disappeared");
  }
  const selectedMatrix = requireRecord(
    selected.matrix,
    "selected measurement matrix",
  );
  if (
    selectedMatrix.material !== "agarose" ||
    selectedMatrix.embeddedHostCondition !== "none" ||
    selectedMatrix.agarosePercent !== agarosePercent
  ) {
    throw new RangeError(
      "selected transport measurement does not match Petra calibration context",
    );
  }

  const freePhageLoss = requireRecord(
    calibration.freePhageLoss,
    "petraCalibration.freePhageLoss",
  );
  if (freePhageLoss.status !== "unbound") {
    throw new TypeError("free-phage loss must remain unbound");
  }
  requireNonEmptyString(
    freePhageLoss.limitation,
    "petraCalibration.freePhageLoss.limitation",
  );

  return raw as unknown as PhageTransportEvidence;
}

function validateMeasuredMatrix(
  matrix: Record<string, unknown>,
  name: string,
): void {
  if (matrix.material !== "water" && matrix.material !== "agarose") {
    throw new TypeError(`${name}.material is unsupported`);
  }
  requireNonEmptyString(matrix.barrier, `${name}.barrier`);
  if (matrix.material === "agarose") {
    finitePositive(`${name}.agarosePercent`, matrix.agarosePercent);
  } else if (matrix.agarosePercent !== null) {
    throw new TypeError(`${name}.agarosePercent must be null for water`);
  }

  if (
    matrix.embeddedHostCondition !== "none" &&
    matrix.embeddedHostCondition !== "dead-escherichia-coli-k12"
  ) {
    throw new TypeError(`${name}.embeddedHostCondition is unsupported`);
  }
}

function validateContext(context: PetraTransportContext): void {
  if (
    context.material !== "agarose" &&
    context.material !== "water" &&
    context.material !== "other"
  ) {
    throw new TypeError("transport context material is unsupported");
  }
  if (context.agarosePercent !== null) {
    finitePositive("context.agarosePercent", context.agarosePercent);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object`);
  return value;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function finitePositive(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
