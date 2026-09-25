import type {
  LineageTreeEdge,
  LineageTreeLayout,
  LineageTreeNode,
} from "./model";

export const DEFAULT_LINEAGE_TREE_SVG_NODE_BUDGET = 96;

export interface LineageCollapsedFrontier {
  readonly lineageId: string;
  readonly hiddenDescendantCount: number;
}

export interface LineageTreeVisibilityPlan {
  readonly nodes: readonly LineageTreeNode[];
  readonly edges: readonly LineageTreeEdge[];
  readonly collapsedFrontiers: readonly LineageCollapsedFrontier[];
  readonly hiddenLineageCount: number;
  readonly totalLineageCount: number;
  readonly maxVisibleNodes: number;
  readonly budgetExceededForPreservedAncestry: boolean;
}

/**
 * Builds presentation-only lineage visibility for the SVG tree.
 *
 * The plan never creates aggregate/scientific lineage records. Roots and every
 * explicitly preserved lineage's ancestor chain remain visible even if doing so
 * exceeds the presentation budget. Hidden records stay available through the
 * complete semantic ancestry table.
 */
export function buildLineageTreeVisibilityPlan(
  tree: LineageTreeLayout,
  options: {
    readonly maxVisibleNodes: number;
    readonly preserveLineageIds?: readonly string[];
  },
): LineageTreeVisibilityPlan {
  if (
    !Number.isSafeInteger(options.maxVisibleNodes) ||
    options.maxVisibleNodes < 1
  ) {
    throw new RangeError("maxVisibleNodes must be a positive safe integer");
  }

  const byId = new Map<string, LineageTreeNode>();
  for (const node of tree.nodes) {
    if (byId.has(node.lineageId)) {
      throw new RangeError(
        "lineage visibility requires unique lineage ids: " + node.lineageId,
      );
    }
    byId.set(node.lineageId, node);
  }

  for (const node of tree.nodes) {
    if (
      node.parentLineageId !== null &&
      !byId.has(node.parentLineageId)
    ) {
      throw new RangeError(
        "lineage visibility found unknown parent: " + node.parentLineageId,
      );
    }
  }

  const required = new Set<string>();
  for (const node of tree.nodes) {
    if (node.parentLineageId === null) required.add(node.lineageId);
  }

  for (const lineageId of options.preserveLineageIds ?? []) {
    const preserved = byId.get(lineageId);
    if (preserved === undefined) {
      throw new RangeError("unknown preserved lineage id: " + lineageId);
    }

    let current: LineageTreeNode | undefined = preserved;
    while (current !== undefined) {
      required.add(current.lineageId);
      current =
        current.parentLineageId === null
          ? undefined
          : byId.get(current.parentLineageId);
    }
  }

  const visibleIds = new Set(required);
  const budgetExceededForPreservedAncestry =
    visibleIds.size > options.maxVisibleNodes;

  for (const node of tree.nodes) {
    if (visibleIds.has(node.lineageId)) continue;
    if (visibleIds.size >= options.maxVisibleNodes) break;
    if (
      node.parentLineageId === null ||
      visibleIds.has(node.parentLineageId)
    ) {
      visibleIds.add(node.lineageId);
    }
  }

  const nodes = tree.nodes.filter((node) => visibleIds.has(node.lineageId));
  const edges = tree.edges.filter(
    (edge) =>
      visibleIds.has(edge.parentLineageId) &&
      visibleIds.has(edge.childLineageId),
  );

  const hiddenByFrontier = new Map<string, number>();
  for (const node of tree.nodes) {
    if (visibleIds.has(node.lineageId)) continue;

    let ancestorId = node.parentLineageId;
    while (ancestorId !== null && !visibleIds.has(ancestorId)) {
      ancestorId = byId.get(ancestorId)?.parentLineageId ?? null;
    }
    if (ancestorId === null) {
      throw new RangeError(
        "hidden lineage has no visible authoritative ancestor: " +
          node.lineageId,
      );
    }
    hiddenByFrontier.set(
      ancestorId,
      (hiddenByFrontier.get(ancestorId) ?? 0) + 1,
    );
  }

  return {
    nodes,
    edges,
    collapsedFrontiers: nodes.flatMap((node) => {
      const hiddenDescendantCount =
        hiddenByFrontier.get(node.lineageId) ?? 0;
      return hiddenDescendantCount === 0
        ? []
        : [{ lineageId: node.lineageId, hiddenDescendantCount }];
    }),
    hiddenLineageCount: tree.nodes.length - nodes.length,
    totalLineageCount: tree.nodes.length,
    maxVisibleNodes: options.maxVisibleNodes,
    budgetExceededForPreservedAncestry,
  };
}
