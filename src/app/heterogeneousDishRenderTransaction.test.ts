import { describe, expect, it } from "vitest";

import { projectAuthoritativeComposedDishSnapshot } from "./composedDishProjection";
import {
  createFungalSurfaceFrontRenderCompanion,
  createHeterogeneousDishRenderTransaction,
  HETEROGENEOUS_DISH_RENDER_TRANSACTION_SCHEMA_VERSION,
  type AuthoritativeRenderTransactionPosition,
} from "./heterogeneousDishRenderTransaction";
import { projectAspergillusNo10SurfaceFrontForRender } from "./fungalSurfaceRenderProjection";
import {
  advanceAspergillusNo10SurfaceCheckpoint,
  createAspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import { buildFlagshipComposedRunPlan } from "../sim/flagshipComposition";
import type { ComposedSimulationSnapshot } from "../sim/protocol";

const RUN_BRANCH_IDENTITY = "heterogeneous-render-transaction:test-branch";

function authoritativeFixture(): {
  readonly snapshot: ComposedSimulationSnapshot;
  readonly dish: ReturnType<typeof projectAuthoritativeComposedDishSnapshot>;
  readonly position: AuthoritativeRenderTransactionPosition;
} {
  const plan = buildFlagshipComposedRunPlan({
    seed: 0x976,
    initialResourceLevel: 8,
    inocula: [
      {
        lineageId: "founder-wt",
        x: 80,
        y: 80,
        biomass: 1,
      },
    ],
  });
  const engine = new ComposedSimulationEngine(plan.identity, plan.config);
  const snapshot = engine.snapshot();
  const dish = projectAuthoritativeComposedDishSnapshot(
    snapshot,
    RUN_BRANCH_IDENTITY,
  );
  return {
    snapshot,
    dish,
    position: {
      runBranchIdentity: RUN_BRANCH_IDENTITY,
      acceptedCommandCount: snapshot.checkpoint.commandCount,
      simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    },
  };
}

describe("heterogeneous dish render transaction", () => {
  it("keeps the existing bacterial render projection byte-for-byte untouched", () => {
    const { snapshot, dish } = authoritativeFixture();
    const transaction = createHeterogeneousDishRenderTransaction({
      runBranchIdentity: RUN_BRANCH_IDENTITY,
      simulationSnapshot: snapshot,
      dishSnapshot: dish,
    });

    expect(transaction.schemaVersion).toBe(
      HETEROGENEOUS_DISH_RENDER_TRANSACTION_SCHEMA_VERSION,
    );
    expect(transaction.authority).toBe(
      "heterogeneous-authoritative-render-transaction",
    );
    expect(transaction.position).toEqual({
      runBranchIdentity: RUN_BRANCH_IDENTITY,
      acceptedCommandCount: snapshot.checkpoint.commandCount,
      simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    });
    expect(transaction.traceHash).toBe(snapshot.traceHash);
    expect(transaction.dishSnapshot).toBe(dish);
    expect(transaction.dishSnapshot.dishMask).toBe(dish.dishMask);
    expect(transaction.dishSnapshot.biomass).toBe(dish.biomass);
    expect(transaction.dishSnapshot.fields[0]?.values).toBe(
      dish.fields[0]?.values,
    );
    expect(transaction.dishSnapshot.lineages[0]?.density).toBe(
      dish.lineages[0]?.density,
    );
    expect(transaction.fungalSurfaceFronts).toEqual([]);
    expect(transaction.crossSpeciesInteractionAuthority).toBe("absent");
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.position)).toBe(true);
    expect(Object.isFrozen(transaction.fungalSurfaceFronts)).toBe(true);
  });

  it("carries a detached zero-radius fungal front at the exact same runtime position", () => {
    const { snapshot, dish, position } = authoritativeFixture();
    const sourceProjection = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(70),
    );
    expect(sourceProjection.biologicalTimeHours).toBe(
      position.simulationTimeHours,
    );
    expect(sourceProjection.front.radiusUm).toBe(0);

    const companion = createFungalSurfaceFrontRenderCompanion({
      position,
      projection: sourceProjection,
    });
    const transaction = createHeterogeneousDishRenderTransaction({
      runBranchIdentity: RUN_BRANCH_IDENTITY,
      simulationSnapshot: snapshot,
      dishSnapshot: dish,
      fungalSurfaceFronts: [companion],
    });

    expect(transaction.fungalSurfaceFronts).toHaveLength(1);
    const projected = transaction.fungalSurfaceFronts[0]!;
    expect(projected.position).toEqual(position);
    expect(projected.projection).not.toBe(sourceProjection);
    expect(projected.projection.front).not.toBe(sourceProjection.front);
    expect(projected.projection.front).toEqual({
      radiusUm: 0,
      normalizedRadius: 0,
      atDishBoundary: false,
    });
    expect(projected.projection.unsupportedScientificSemantics).toContain(
      "spatial-density",
    );
    expect(projected.projection.unsupportedScientificSemantics).toContain(
      "bacteria-fungus-interaction",
    );
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.position)).toBe(true);
    expect(Object.isFrozen(projected.projection)).toBe(true);
    expect(Object.isFrozen(projected.projection.front)).toBe(true);
  });

  it("rejects fungal companions from another branch, command position, or biological time", () => {
    const { snapshot, dish, position } = authoritativeFixture();
    const zeroFront = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(70),
    );

    const wrongBranch = createFungalSurfaceFrontRenderCompanion({
      position: {
        ...position,
        runBranchIdentity: "heterogeneous-render-transaction:other-branch",
      },
      projection: zeroFront,
    });
    expect(() =>
      createHeterogeneousDishRenderTransaction({
        runBranchIdentity: RUN_BRANCH_IDENTITY,
        simulationSnapshot: snapshot,
        dishSnapshot: dish,
        fungalSurfaceFronts: [wrongBranch],
      }),
    ).toThrow(/same runtime branch, accepted command position, and biological time/);

    const wrongOrder = createFungalSurfaceFrontRenderCompanion({
      position: {
        ...position,
        acceptedCommandCount: position.acceptedCommandCount + 1,
      },
      projection: zeroFront,
    });
    expect(() =>
      createHeterogeneousDishRenderTransaction({
        runBranchIdentity: RUN_BRANCH_IDENTITY,
        simulationSnapshot: snapshot,
        dishSnapshot: dish,
        fungalSurfaceFronts: [wrongOrder],
      }),
    ).toThrow(/same runtime branch, accepted command position, and biological time/);

    const laterFront = projectAspergillusNo10SurfaceFrontForRender(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(70),
        1,
      ),
    );
    const wrongTime = createFungalSurfaceFrontRenderCompanion({
      position: {
        ...position,
        simulationTimeHours: laterFront.biologicalTimeHours,
      },
      projection: laterFront,
    });
    expect(() =>
      createHeterogeneousDishRenderTransaction({
        runBranchIdentity: RUN_BRANCH_IDENTITY,
        simulationSnapshot: snapshot,
        dishSnapshot: dish,
        fungalSurfaceFronts: [wrongTime],
      }),
    ).toThrow(/same runtime branch, accepted command position, and biological time/);
  });

  it("rejects stale bacterial projection identity and duplicate fungal source-front identity", () => {
    const { snapshot, dish, position } = authoritativeFixture();
    const companion = createFungalSurfaceFrontRenderCompanion({
      position,
      projection: projectAspergillusNo10SurfaceFrontForRender(
        createAspergillusNo10SurfaceCheckpoint(40),
      ),
    });

    expect(() =>
      createHeterogeneousDishRenderTransaction({
        runBranchIdentity: RUN_BRANCH_IDENTITY,
        simulationSnapshot: snapshot,
        dishSnapshot: {
          ...dish,
          snapshotId: "composed-trace:foreign",
        },
      }),
    ).toThrow(/same authoritative trace/);

    expect(() =>
      createHeterogeneousDishRenderTransaction({
        runBranchIdentity: RUN_BRANCH_IDENTITY,
        simulationSnapshot: snapshot,
        dishSnapshot: {
          ...dish,
          samplingIdentity: "runtime-branch:foreign",
        },
      }),
    ).toThrow(/same runtime branch/);

    expect(() =>
      createHeterogeneousDishRenderTransaction({
        runBranchIdentity: RUN_BRANCH_IDENTITY,
        simulationSnapshot: snapshot,
        dishSnapshot: dish,
        fungalSurfaceFronts: [companion, companion],
      }),
    ).toThrow(/duplicate fungal source-front identity/);
  });

  it("fails closed if a fungal companion loses physical-front or refusal-surface integrity", () => {
    const { position } = authoritativeFixture();
    const sourceProjection = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(120),
    );

    const radiusDrift = structuredClone(sourceProjection);
    (
      radiusDrift as {
        front: {
          radiusUm: number;
          normalizedRadius: number;
          atDishBoundary: boolean;
        };
      }
    ).front.normalizedRadius = 0.5;
    expect(() =>
      createFungalSurfaceFrontRenderCompanion({
        position,
        projection: radiusDrift,
      }),
    ).toThrow(/normalized radius must match/);

    const refusalDrift = structuredClone(sourceProjection);
    (
      refusalDrift as {
        unsupportedScientificSemantics: string[];
      }
    ).unsupportedScientificSemantics.pop();
    expect(() =>
      createFungalSurfaceFrontRenderCompanion({
        position,
        projection: refusalDrift as typeof sourceProjection,
      }),
    ).toThrow(/unsupported-science refusal surface/);
  });
});
