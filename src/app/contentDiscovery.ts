import {
  CONTENT_SUPPORT_MATRIX_KIND,
  CONTENT_SUPPORT_MATRIX_SCHEMA_VERSION,
  SUPPORTED_CONTENT_MATRIX,
  type ContentAvailability,
  type ContentExpansionQueueEntry,
  type ContentQueueAvailability,
  type ContentQueueKind,
  type ScienceModeStatus,
  type SupportedContentMatrix,
  type SupportedEnvironment,
  type SupportedIntervention,
  type SupportedOrganism,
} from "../contentSupportMatrix";
import {
  listBundledScenarioDiscovery,
  type ScenarioDiscoveryEntry,
} from "./scenarioDiscovery";

export const PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION = 1 as const;

export interface ProductScenarioDiscoveryCard {
  readonly kind: "scenario";
  readonly schemaVersion: typeof PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION;
  readonly matrixVersion: string;
  readonly supportId: string;
  readonly scenarioKey: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly title: string;
  readonly catalogStatus: string;
  readonly availability: ContentAvailability;
  readonly scienceModeStatus: ScienceModeStatus;
  readonly scienceMode: ScenarioDiscoveryEntry["scienceMode"];
  readonly organisms: readonly SupportedOrganism[];
  readonly environment: SupportedEnvironment;
  readonly interventions: readonly SupportedIntervention[];
  readonly limitations: readonly string[];
}

export interface ProductExpansionQueueCard {
  readonly kind: "expansion";
  readonly schemaVersion: typeof PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION;
  readonly matrixVersion: string;
  readonly supportId: string;
  readonly queueKind: ContentQueueKind;
  readonly availability: ContentQueueAvailability;
  readonly issues: readonly number[];
  readonly reason: string;
}

export interface ProductContentDiscoveryCatalog {
  readonly schemaVersion: typeof PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION;
  readonly matrixKind: typeof CONTENT_SUPPORT_MATRIX_KIND;
  readonly matrixSchemaVersion: typeof CONTENT_SUPPORT_MATRIX_SCHEMA_VERSION;
  readonly matrixVersion: string;
  readonly scenarios: readonly ProductScenarioDiscoveryCard[];
  readonly expansionQueue: readonly ProductExpansionQueueCard[];
}

/**
 * Framework-neutral product discovery over exact science/support authority.
 *
 * This projection deliberately does not answer whether a scenario is executable
 * in Sandbox. Runtime registration remains separate authority under #598/#999.
 * Likewise, an enabled research entry is not automatically grounded Science
 * Mode: the matrix declaration must agree with the scenario admission evaluator.
 */
export function buildProductContentDiscovery(args: {
  readonly matrix: SupportedContentMatrix;
  readonly bundledScenarios: readonly ScenarioDiscoveryEntry[];
}): ProductContentDiscoveryCatalog {
  const discoveryByKey = new Map<string, ScenarioDiscoveryEntry>();

  for (const discovery of args.bundledScenarios) {
    const key = scenarioKey(discovery.id, discovery.version);
    if (discoveryByKey.has(key)) {
      throw new Error(`duplicate bundled product discovery identity: ${key}`);
    }
    discoveryByKey.set(key, discovery);
  }

  const scenarios = args.matrix.supportedScenarios.map((support) => {
    const key = scenarioKey(support.scenario.id, support.scenario.version);
    const discovery = discoveryByKey.get(key);
    if (discovery === undefined) {
      throw new Error(
        `enabled content support has no exact bundled scenario discovery entry: ${key}`,
      );
    }

    const evaluatedScienceModeStatus: ScienceModeStatus =
      discovery.scienceMode.admitted ? "admitted" : "not-admitted";
    if (support.scienceModeStatus !== evaluatedScienceModeStatus) {
      throw new Error(
        `content support Science-Mode status disagrees with scenario admission: ${key}`,
      );
    }

    return Object.freeze({
      kind: "scenario" as const,
      schemaVersion: PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION,
      matrixVersion: args.matrix.version,
      supportId: support.id,
      scenarioKey: key,
      scenarioId: discovery.id,
      scenarioVersion: discovery.version,
      title: discovery.title,
      catalogStatus: discovery.catalogStatus,
      availability: support.availability,
      scienceModeStatus: support.scienceModeStatus,
      scienceMode: cloneScienceMode(discovery.scienceMode),
      organisms: Object.freeze(support.organisms.map(cloneOrganism)),
      environment: cloneEnvironment(support.environment),
      interventions: Object.freeze(
        support.interventions.map(cloneIntervention),
      ),
      limitations: Object.freeze([...support.limitations]),
    });
  });

  const expansionQueue = args.matrix.expansionQueue.map((entry) =>
    cloneQueueEntry(entry, args.matrix.version),
  );

  return Object.freeze({
    schemaVersion: PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION,
    matrixKind: args.matrix.kind,
    matrixSchemaVersion: args.matrix.schemaVersion,
    matrixVersion: args.matrix.version,
    scenarios: Object.freeze(scenarios),
    expansionQueue: Object.freeze(expansionQueue),
  });
}

/**
 * Canonical repository-owned product discovery catalog.
 *
 * Adding a scientific support row alone still does not make a runtime
 * executable; callers must use the separate Sandbox runtime registry for that.
 */
export function listProductContentDiscovery(): ProductContentDiscoveryCatalog {
  return buildProductContentDiscovery({
    matrix: SUPPORTED_CONTENT_MATRIX,
    bundledScenarios: listBundledScenarioDiscovery(),
  });
}

function scenarioKey(id: string, version: string): string {
  return `${canonicalText("scenario id", id)}@${canonicalText(
    "scenario version",
    version,
  )}`;
}

function cloneOrganism(organism: SupportedOrganism): SupportedOrganism {
  return Object.freeze({
    scientificName: organism.scientificName,
    background: organism.background,
    microbialGroup: organism.microbialGroup,
    presentationIdentityId: organism.presentationIdentityId,
  });
}

function cloneEnvironment(environment: SupportedEnvironment): SupportedEnvironment {
  return Object.freeze({
    resourceContextVersion: environment.resourceContextVersion,
    resourceBindingStatus: environment.resourceBindingStatus,
    resourceRepresentation: environment.resourceRepresentation,
    medium: environment.medium,
    referenceTemperatureC: environment.referenceTemperatureC,
  });
}

function cloneIntervention(
  intervention: SupportedIntervention,
): SupportedIntervention {
  return Object.freeze({
    id: intervention.id,
    kind: intervention.kind,
    protocolCommand: intervention.protocolCommand,
    concentrationUnit: intervention.concentrationUnit,
    supportedGeometries: Object.freeze([
      ...intervention.supportedGeometries,
    ]),
  });
}

function cloneQueueEntry(
  entry: ContentExpansionQueueEntry,
  matrixVersion: string,
): ProductExpansionQueueCard {
  return Object.freeze({
    kind: "expansion" as const,
    schemaVersion: PRODUCT_CONTENT_DISCOVERY_SCHEMA_VERSION,
    matrixVersion,
    supportId: entry.id,
    queueKind: entry.kind,
    availability: entry.availability,
    issues: Object.freeze([...entry.issues]),
    reason: entry.reason,
  });
}

function cloneScienceMode(
  admission: ScenarioDiscoveryEntry["scienceMode"],
): ScenarioDiscoveryEntry["scienceMode"] {
  return Object.freeze({
    schemaVersion: admission.schemaVersion,
    scenarioId: admission.scenarioId,
    scenarioVersion: admission.scenarioVersion,
    maturity: admission.maturity,
    admitted: admission.admitted,
    referenceEligible: admission.referenceEligible,
    summary: admission.summary,
    reasons: Object.freeze(
      admission.reasons.map((reason) => Object.freeze({ ...reason })),
    ),
    evidence: Object.freeze({
      decisiveRecordCount: admission.evidence.decisiveRecordCount,
      primarySourceCount: admission.evidence.primarySourceCount,
      validationTargetCount: admission.evidence.validationTargetCount,
      transferAssumptionCount: admission.evidence.transferAssumptionCount,
      evidenceClasses: Object.freeze({
        ...admission.evidence.evidenceClasses,
      }),
    }),
  });
}

function canonicalText(name: string, value: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
  return value;
}
