import { describe, expect, it } from "vitest";
import {
  BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
  EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
  baselineNonDrugLossPolicyIdentity,
  resolveBaselineNonDrugDeathHazardPerHour,
  validateBaselineNonDrugLossPolicy,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";

function policy(
  entries: BaselineNonDrugLossPolicy["entries"] = [
    {
      genotypeId: "WT",
      deathHazardPerHour: 0,
      provenance: {
        classification: "engineering",
        sourceKeys: [],
        context: "Test-only inactive background-loss mechanism.",
        limitation: "Zero is an engineering fixture, not a measured death rate.",
      },
    },
    {
      genotypeId: "A",
      deathHazardPerHour: 0.1,
      provenance: {
        classification: "calibrated",
        sourceKeys: ["fixture-calibration"],
        context: "Test-only calibrated background-loss fixture.",
        limitation: "Not flagship biological authority.",
      },
    },
  ],
): BaselineNonDrugLossPolicy {
  return {
    schemaVersion: BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
    id: "fixture-baseline-non-drug-loss-v1",
    rule: EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
    entries,
  };
}

describe("baseline non-drug loss policy", () => {
  it("resolves only explicitly authorized genotype hazards", () => {
    const fixture = policy();

    expect(resolveBaselineNonDrugDeathHazardPerHour(fixture, "WT")).toBe(0);
    expect(resolveBaselineNonDrugDeathHazardPerHour(fixture, "A")).toBe(0.1);
    expect(() =>
      resolveBaselineNonDrugDeathHazardPerHour(fixture, "B"),
    ).toThrow(/no authority for genotype B/);
  });

  it("uses semantic genotype-keyed identity rather than caller entry order", () => {
    const first = policy();
    const second = policy([...first.entries].reverse());

    expect(baselineNonDrugLossPolicyIdentity(second)).toBe(
      baselineNonDrugLossPolicyIdentity(first),
    );

    const changed = policy(
      first.entries.map((entry) =>
        entry.genotypeId === "A"
          ? { ...entry, deathHazardPerHour: 0.2 }
          : entry,
      ),
    );
    expect(baselineNonDrugLossPolicyIdentity(changed)).not.toBe(
      baselineNonDrugLossPolicyIdentity(first),
    );
  });

  it("fails closed on duplicate genotypes and missing sourced provenance", () => {
    const duplicate = policy([
      policy().entries[0]!,
      { ...policy().entries[0]! },
    ]);
    expect(() => validateBaselineNonDrugLossPolicy(duplicate)).toThrow(
      /genotype ids must be unique/,
    );

    const unsourced = policy([
      {
        genotypeId: "A",
        deathHazardPerHour: 0.1,
        provenance: {
          classification: "transferred",
          sourceKeys: [],
          context: "Test transferred fixture.",
          limitation: "Test only.",
        },
      },
    ]);
    expect(() => validateBaselineNonDrugLossPolicy(unsourced)).toThrow(
      /requires source keys/,
    );
  });

  it("rejects malformed or invented-by-default numerical authority", () => {
    expect(() =>
      validateBaselineNonDrugLossPolicy(
        policy([
          {
            ...policy().entries[0]!,
            deathHazardPerHour: Number.NaN,
          },
        ]),
      ),
    ).toThrow(/finite and non-negative/);

    expect(() =>
      validateBaselineNonDrugLossPolicy(
        policy([
          {
            ...policy().entries[0]!,
            provenance: {
              ...policy().entries[0]!.provenance,
              limitation: " ",
            },
          },
        ]),
      ),
    ).toThrow(/canonical non-empty string/);
  });
});
