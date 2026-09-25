import rawHostAdmission from "../../../data/phage/t4_mg1655_host_admission_v1.json";
import {
  validateAuthoritativeTaxonIdentity,
  validateRuntimeLineageTaxonMap,
  type AuthoritativeTaxonRegistry,
  type RuntimeLineageTaxonMap,
} from "../taxonIdentity";
import { T4_MG1655_LIFE_HISTORY } from "./lifeHistory";

export const PHAGE_HOST_ADMISSION_SCHEMA_VERSION = 1 as const;

export interface PhageHostAdmissionAuthority {
  readonly schemaVersion: typeof PHAGE_HOST_ADMISSION_SCHEMA_VERSION;
  readonly id: string;
  readonly phage: Readonly<{
    readonly lifeHistoryEvidenceId: string;
    readonly name: string;
    readonly collectionId: string;
  }>;
  readonly sourceHost: Readonly<{
    readonly scientificName: string;
    readonly background: string;
    readonly collectionId: string;
  }>;
  readonly runtimeHost: Readonly<{
    readonly taxonId: string;
    readonly taxonContentVersion: string;
    readonly scientificName: string;
    readonly background: string;
    readonly taxonSourceKey: string;
    readonly genotypeId: string;
  }>;
  readonly admissionRule: "exact-runtime-taxon-content-and-genotype";
  readonly provenance: Readonly<{
    readonly classification: "transferred";
    readonly sourceKeys: readonly string[];
    readonly limitation: string;
  }>;
}

export interface AdmittedPhageHostLineage {
  readonly lineageId: string;
  readonly lineageIndex: number;
  readonly genotypeId: string;
  readonly taxonId: string;
  readonly taxonContentVersion: string;
}

export const T4_FLAGSHIP_MG1655_HOST_ADMISSION =
  parsePhageHostAdmissionAuthority(rawHostAdmission as unknown);

export function phageHostAdmissionAuthorityIdentity(
  authority: PhageHostAdmissionAuthority = T4_FLAGSHIP_MG1655_HOST_ADMISSION,
): string {
  validatePhageHostAdmissionAuthority(authority);
  return JSON.stringify({
    schemaVersion: authority.schemaVersion,
    id: authority.id,
    phage: authority.phage,
    sourceHost: authority.sourceHost,
    runtimeHost: authority.runtimeHost,
    admissionRule: authority.admissionRule,
    provenance: {
      classification: authority.provenance.classification,
      sourceKeys: [...authority.provenance.sourceKeys].sort(),
    },
  });
}

/**
 * Resolve only runtime lineages explicitly supported by one reviewed host
 * admission authority.
 *
 * This is deliberately narrower than "same species" or "same taxon id":
 * both the taxon content revision and genotype must match. V1 therefore admits
 * only the exact flagship WT lineage. Mutation children, other MG1655 content
 * revisions, Bacillus, and other taxa remain unsupported until a separate
 * host-range authority says otherwise.
 *
 * No PFU is sampled or allocated here. #1092 owns the later within-cell
 * allocation policy, so this function cannot silently choose among multiple
 * admitted lineage channels.
 */
export function resolveAdmittedPhageHostLineages(args: {
  readonly authority?: PhageHostAdmissionAuthority;
  readonly taxonRegistry: AuthoritativeTaxonRegistry;
  readonly lineageTaxonMap: RuntimeLineageTaxonMap;
  readonly lineageIds: readonly string[];
  readonly genotypeIds: readonly string[];
}): readonly AdmittedPhageHostLineage[] {
  const authority =
    args.authority ?? T4_FLAGSHIP_MG1655_HOST_ADMISSION;
  validatePhageHostAdmissionAuthority(authority);
  validateRuntimeLineageTaxonMap(
    args.lineageTaxonMap,
    args.taxonRegistry,
    args.lineageIds,
  );

  if (!Array.isArray(args.lineageIds) || !Array.isArray(args.genotypeIds)) {
    throw new TypeError("phage host lineage and genotype ids must be arrays");
  }
  if (args.lineageIds.length !== args.genotypeIds.length) {
    throw new Error(
      "phage host lineage and genotype ids must have identical lengths",
    );
  }

  const runtimeTaxon = args.taxonRegistry.taxa.find(
    (taxon) => taxon.id === authority.runtimeHost.taxonId,
  );
  if (runtimeTaxon === undefined) {
    throw new Error(
      "phage host admission runtime taxon is absent from the authoritative registry",
    );
  }
  validateAuthoritativeTaxonIdentity(runtimeTaxon);
  if (
    runtimeTaxon.contentVersion !== authority.runtimeHost.taxonContentVersion ||
    runtimeTaxon.scientificName !== authority.runtimeHost.scientificName ||
    runtimeTaxon.background !== authority.runtimeHost.background ||
    !runtimeTaxon.provenance.sourceKeys.includes(
      authority.runtimeHost.taxonSourceKey,
    )
  ) {
    throw new Error(
      "phage host admission runtime taxon identity does not match reviewed authority",
    );
  }

  const admitted: AdmittedPhageHostLineage[] = [];
  for (let index = 0; index < args.lineageIds.length; index += 1) {
    if (!(index in args.lineageIds) || !(index in args.genotypeIds)) {
      throw new TypeError("phage host lineage/genotype arrays must be dense");
    }
    const lineageId = canonicalText(
      `phage host lineage id at index ${index}`,
      args.lineageIds[index],
    );
    const genotypeId = canonicalText(
      `phage host genotype id at index ${index}`,
      args.genotypeIds[index],
    );
    const taxonId = args.lineageTaxonMap.taxonIds[index]!;
    const taxonContentVersion =
      args.lineageTaxonMap.taxonContentVersions[index]!;

    if (
      taxonId === authority.runtimeHost.taxonId &&
      taxonContentVersion === authority.runtimeHost.taxonContentVersion &&
      genotypeId === authority.runtimeHost.genotypeId
    ) {
      admitted.push(
        Object.freeze({
          lineageId,
          lineageIndex: index,
          genotypeId,
          taxonId,
          taxonContentVersion,
        }),
      );
    }
  }

  return Object.freeze(admitted);
}

export function validatePhageHostAdmissionAuthority(
  authority: PhageHostAdmissionAuthority,
): void {
  if (!isRecord(authority)) {
    throw new TypeError("phage host admission authority must be an object");
  }
  if (authority.schemaVersion !== PHAGE_HOST_ADMISSION_SCHEMA_VERSION) {
    throw new Error("unsupported phage host admission schema version");
  }
  canonicalText("phage host admission id", authority.id);

  if (!isRecord(authority.phage)) {
    throw new TypeError("phage host admission phage must be an object");
  }
  canonicalText(
    "phage host admission life-history evidence id",
    authority.phage.lifeHistoryEvidenceId,
  );
  canonicalText("phage host admission phage name", authority.phage.name);
  canonicalText(
    "phage host admission phage collection id",
    authority.phage.collectionId,
  );

  if (!isRecord(authority.sourceHost)) {
    throw new TypeError("phage host admission sourceHost must be an object");
  }
  canonicalText(
    "phage host admission source scientific name",
    authority.sourceHost.scientificName,
  );
  canonicalText(
    "phage host admission source background",
    authority.sourceHost.background,
  );
  canonicalText(
    "phage host admission source collection id",
    authority.sourceHost.collectionId,
  );

  if (!isRecord(authority.runtimeHost)) {
    throw new TypeError("phage host admission runtimeHost must be an object");
  }
  canonicalText(
    "phage host admission runtime taxon id",
    authority.runtimeHost.taxonId,
  );
  canonicalText(
    "phage host admission runtime taxon content version",
    authority.runtimeHost.taxonContentVersion,
  );
  canonicalText(
    "phage host admission runtime scientific name",
    authority.runtimeHost.scientificName,
  );
  canonicalText(
    "phage host admission runtime background",
    authority.runtimeHost.background,
  );
  canonicalText(
    "phage host admission runtime taxon source key",
    authority.runtimeHost.taxonSourceKey,
  );
  canonicalText(
    "phage host admission runtime genotype id",
    authority.runtimeHost.genotypeId,
  );

  if (
    authority.admissionRule !== "exact-runtime-taxon-content-and-genotype"
  ) {
    throw new Error("unsupported phage host admission rule");
  }
  if (!isRecord(authority.provenance)) {
    throw new TypeError("phage host admission provenance must be an object");
  }
  if (authority.provenance.classification !== "transferred") {
    throw new Error(
      "phage host admission v1 must remain classified as transferred",
    );
  }
  if (
    !Array.isArray(authority.provenance.sourceKeys) ||
    authority.provenance.sourceKeys.length === 0
  ) {
    throw new Error("phage host admission requires source keys");
  }
  for (
    let index = 0;
    index < authority.provenance.sourceKeys.length;
    index += 1
  ) {
    if (!(index in authority.provenance.sourceKeys)) {
      throw new TypeError("phage host admission source keys must be dense");
    }
    canonicalText(
      `phage host admission source key at index ${index}`,
      authority.provenance.sourceKeys[index],
    );
  }
  if (
    new Set(authority.provenance.sourceKeys).size !==
    authority.provenance.sourceKeys.length
  ) {
    throw new Error("phage host admission source keys must be unique");
  }
  canonicalText(
    "phage host admission limitation",
    authority.provenance.limitation,
  );

  const lifeHistory = T4_MG1655_LIFE_HISTORY;
  if (
    authority.phage.lifeHistoryEvidenceId !== lifeHistory.id ||
    authority.phage.name !== lifeHistory.phage.name ||
    authority.phage.collectionId !== lifeHistory.phage.collectionId ||
    authority.sourceHost.scientificName !== lifeHistory.host.species ||
    authority.sourceHost.background !== lifeHistory.host.background ||
    authority.sourceHost.collectionId !== lifeHistory.host.collectionId
  ) {
    throw new Error(
      "phage host admission must match the canonical T4/MG1655 life-history host and phage identities exactly",
    );
  }
  if (!authority.provenance.sourceKeys.includes(lifeHistory.source.key)) {
    throw new Error(
      "phage host admission provenance must include the canonical life-history source key",
    );
  }
  if (
    !authority.provenance.sourceKeys.includes(
      authority.runtimeHost.taxonSourceKey,
    )
  ) {
    throw new Error(
      "phage host admission provenance must include the runtime taxon source key",
    );
  }
}

function parsePhageHostAdmissionAuthority(
  raw: unknown,
): PhageHostAdmissionAuthority {
  if (!isRecord(raw)) {
    throw new TypeError("phage host admission data must be an object");
  }
  const authority = raw as unknown as PhageHostAdmissionAuthority;
  validatePhageHostAdmissionAuthority(authority);
  return Object.freeze({
    schemaVersion: PHAGE_HOST_ADMISSION_SCHEMA_VERSION,
    id: authority.id,
    phage: Object.freeze({ ...authority.phage }),
    sourceHost: Object.freeze({ ...authority.sourceHost }),
    runtimeHost: Object.freeze({ ...authority.runtimeHost }),
    admissionRule: authority.admissionRule,
    provenance: Object.freeze({
      classification: authority.provenance.classification,
      sourceKeys: Object.freeze([...authority.provenance.sourceKeys]),
      limitation: authority.provenance.limitation,
    }),
  });
}

function canonicalText(name: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
