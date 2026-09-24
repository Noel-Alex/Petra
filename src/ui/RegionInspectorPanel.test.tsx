import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  AuthoritativeRegionInspection,
  MeasuredAuthoritativeRegionInspection,
} from "../sim/regionInspector";
import { RegionInspectorPanel } from "./RegionInspectorPanel";
import {
  acceptRegionInspection,
  beginRegionInspection,
  failRegionInspection,
  unavailableRegionInspector,
  type RegionInspectorPresentationState,
} from "./regionInspectorState";

function readout(
  selectionId: string,
  overrides: Partial<MeasuredAuthoritativeRegionInspection> = {},
): MeasuredAuthoritativeRegionInspection {
  return {
    kind: "measured",
    selectionId,
    stateVersion: 1,
    configurationFingerprint: "config-fingerprint-v1",
    selectedCellCount: 3,
    totalBiomass: 4.25,
    totalResource: 7.5,
    biomassUnit: "model-biomass",
    resourceUnit: "model-resource",
    lineageBiomass: [
      {
        lineageId: "ancestor",
        genotypeId: "WT",
        biomass: 3,
        fractionOfRegionBiomass: 3 / 4.25,
      },
      {
        lineageId: "variant",
        genotypeId: "VAR",
        biomass: 1.25,
        fractionOfRegionBiomass: 1.25 / 4.25,
      },
    ],
    ...overrides,
  };
}

function noCoverage(
  selectionId: string,
): AuthoritativeRegionInspection {
  return {
    kind: "no-grid-coverage",
    selectionId,
    stateVersion: 1,
    configurationFingerprint: "config-fingerprint-v1",
  };
}

function noCoverageState(
  selectionId: string,
): RegionInspectorPresentationState {
  return acceptRegionInspection(
    beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      selectionId,
    ),
    noCoverage(selectionId),
  ).state;
}

function readyState(selectionId: string): RegionInspectorPresentationState {
  return acceptRegionInspection(
    beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      selectionId,
    ),
    readout(selectionId),
  ).state;
}

describe("RegionInspectorPanel", () => {
  it("renders unavailable state without placeholder scientific values", () => {
    const html = renderToStaticMarkup(
      <RegionInspectorPanel
        state={unavailableRegionInspector(
          "Authoritative simulation is not connected.",
        )}
      />,
    );

    expect(html).toContain('data-region-inspector-status="unavailable"');
    expect(html).toContain("Authoritative simulation is not connected.");
    expect(html).toContain('data-readout-empty="true"');
    expect(html).not.toContain("model-biomass");
    expect(html).not.toContain("config-fingerprint-v1");
  });

  it("renders pending selection identity without reusing old values", () => {
    const state = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-new",
    );
    const html = renderToStaticMarkup(<RegionInspectorPanel state={state} />);

    expect(html).toContain('data-region-inspector-status="pending"');
    expect(html).toContain('data-active-selection-id="region-new"');
    expect(html).toContain(
      "Waiting for an authoritative readout for selection region-new.",
    );
    expect(html).toContain(
      "No prior authoritative readout is being reused",
    );
    expect(html).not.toContain("model-resource");
  });

  it("renders ready authoritative model-unit values and lineage composition", () => {
    const html = renderToStaticMarkup(
      <RegionInspectorPanel state={readyState("region-a")} />,
    );

    expect(html).toContain('data-region-inspector-status="ready"');
    expect(html).toContain('data-readout-selection-id="region-a"');
    expect(html).toContain('data-readout-stale="false"');
    expect(html).toContain("Selected simulation grid cells");
    expect(html).toContain("4.25 model-biomass");
    expect(html).toContain("7.5 model-resource");
    expect(html).toContain("Composed state schema version");
    expect(html).toContain("config-fingerprint-v1");
    expect(html).toContain('data-lineage-id="ancestor"');
    expect(html).toContain('data-genotype-id="WT"');
    expect(html).toContain('data-lineage-id="variant"');
    expect(html).toContain('data-genotype-id="VAR"');
    expect(html).toContain("<th>Genotype</th>");
    expect(html).toContain("70.6%");
    expect(html).toContain("29.4%");
    expect(html).toContain(
      "Model units are not relabelled as physical cell counts",
    );
    expect(html).not.toContain("Simulation time");
    expect(html).not.toContain(" h");
  });

  it("renders explicit no-grid coverage without numeric scientific measurements", () => {
    const html = renderToStaticMarkup(
      <RegionInspectorPanel state={noCoverageState("region-empty")} />,
    );

    expect(html).toContain('data-region-inspector-status="ready"');
    expect(html).toContain('data-readout-kind="no-grid-coverage"');
    expect(html).toContain('data-readout-selection-id="region-empty"');
    expect(html).toContain("No grid coverage");
    expect(html).toContain("No authoritative grid cells");
    expect(html).toContain(
      "No biomass or resource measurement is reported.",
    );
    expect(html).toContain("config-fingerprint-v1");
    expect(html).not.toContain("Total biomass");
    expect(html).not.toContain("Total resource");
    expect(html).not.toContain("model-biomass");
    expect(html).not.toContain("model-resource");
    expect(html).not.toContain("Lineage composition");
  });

  it("keeps a no-grid-coverage result explicitly stale when selection changes", () => {
    const state = beginRegionInspection(
      noCoverageState("region-empty"),
      "region-next",
    );
    const html = renderToStaticMarkup(<RegionInspectorPanel state={state} />);

    expect(html).toContain('data-region-inspector-status="stale"');
    expect(html).toContain('data-active-selection-id="region-next"');
    expect(html).toContain('data-readout-selection-id="region-empty"');
    expect(html).toContain('data-readout-kind="no-grid-coverage"');
    expect(html).toContain('data-readout-stale="true"');
    expect(html).toContain("The result below still belongs");
    expect(html).not.toContain("Total biomass");
    expect(html).not.toContain("model-biomass");
  });

  it("keeps an old readout visibly owned by the old selection while a new one is pending", () => {
    const state = beginRegionInspection(readyState("region-old"), "region-new");
    const html = renderToStaticMarkup(<RegionInspectorPanel state={state} />);

    expect(html).toContain('data-region-inspector-status="stale"');
    expect(html).toContain('data-active-selection-id="region-new"');
    expect(html).toContain('data-readout-selection-id="region-old"');
    expect(html).toContain('data-readout-stale="true"');
    expect(html).toContain("Selection region-new is pending");
    expect(html).toContain("earlier selection region-old");
    expect(html).toContain("Stale readout");
  });

  it("uses alert semantics and preserves explicit stale ownership after a query error", () => {
    let state = beginRegionInspection(readyState("region-old"), "region-new");
    state = failRegionInspection(
      state,
      "region-new",
      "Authoritative region query failed.",
    ).state;

    const html = renderToStaticMarkup(<RegionInspectorPanel state={state} />);

    expect(html).toContain('data-region-inspector-status="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Authoritative region query failed.");
    expect(html).toContain("Query for selection region-new failed.");
    expect(html).toContain('data-readout-selection-id="region-old"');
    expect(html).toContain('data-readout-stale="true"');
  });

  it("withholds metrics when an error has no authoritative stale readout", () => {
    const state: RegionInspectorPresentationState = {
      status: "error",
      selectionId: "region-a",
      message: "Query failed before a readout existed.",
      staleReadout: null,
    };
    const html = renderToStaticMarkup(<RegionInspectorPanel state={state} />);

    expect(html).toContain("No authoritative scientific readout is shown.");
    expect(html).toContain('data-readout-empty="true"');
    expect(html).not.toContain("Total biomass");
    expect(html).not.toContain("model-biomass");
  });
});
