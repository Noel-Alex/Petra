import {
  createAuthoritativeHistoryIndex,
  type AuthoritativeHistoryIndex,
} from "./historicalState";
import {
  createDishReplayPresenter,
  type DishReplayPresenter,
} from "../render/replayPresentation";
import type { RuntimeHistoricalKeyframeTransaction } from "./runtimeHistoricalKeyframe";

export interface RuntimeHistoricalPresentationAuthority {
  readonly runBranchIdentity: string;
  readonly firstAcceptedCommandCount: number;
  readonly lastAcceptedCommandCount: number;
  readonly keyframeCount: number;
  readonly historyIndex: AuthoritativeHistoryIndex;
  readonly dishPresenter: DishReplayPresenter;
}

/**
 * Assemble one caller-selected sparse history into synchronized scientific and
 * dish replay authority.
 *
 * Capture cadence and retention depth intentionally remain caller policy. This
 * boundary only accepts already-atomic runtime transactions and prevents a
 * consumer from independently pairing one scientific history with a different
 * dish history.
 */
export function createRuntimeHistoricalPresentationAuthority(
  transactions: readonly RuntimeHistoricalKeyframeTransaction[],
): RuntimeHistoricalPresentationAuthority {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error(
      "runtime historical presentation authority requires at least one transaction",
    );
  }

  const scientificKeyframes = [];
  const dishKeyframes = [];
  let runBranchIdentity: string | null = null;

  for (let index = 0; index < transactions.length; index += 1) {
    if (!(index in transactions)) {
      throw new Error(
        "runtime historical presentation transactions must be dense",
      );
    }

    const transaction = transactions[index]!;
    validateTransactionPair(transaction);

    const branch = transaction.scientific.runBranchIdentity;
    if (runBranchIdentity === null) {
      runBranchIdentity = branch;
    } else if (branch !== runBranchIdentity) {
      throw new Error(
        "runtime historical presentation authority cannot mix run branches",
      );
    }

    scientificKeyframes.push(transaction.scientific);
    dishKeyframes.push(transaction.dish);
  }

  const historyIndex = createAuthoritativeHistoryIndex(scientificKeyframes);
  const dishPresenter = createDishReplayPresenter(dishKeyframes);

  if (historyIndex.runBranchIdentity !== runBranchIdentity) {
    throw new Error(
      "runtime historical presentation branch identity failed reconciliation",
    );
  }

  return Object.freeze({
    runBranchIdentity,
    firstAcceptedCommandCount: historyIndex.firstCommandCount,
    lastAcceptedCommandCount: historyIndex.lastCommandCount,
    keyframeCount: historyIndex.keyframeCount,
    historyIndex,
    dishPresenter,
  });
}

function validateTransactionPair(
  transaction: RuntimeHistoricalKeyframeTransaction,
): void {
  if (
    transaction === null ||
    typeof transaction !== "object" ||
    transaction.scientific === undefined ||
    transaction.dish === undefined
  ) {
    throw new TypeError(
      "runtime historical presentation requires complete atomic transactions",
    );
  }

  const scientific = transaction.scientific;
  const snapshot = scientific.snapshot;
  const checkpoint = snapshot.checkpoint;
  const dish = transaction.dish;

  if (checkpoint.authority !== "composed") {
    throw new Error(
      "runtime historical presentation requires composed scientific authority",
    );
  }

  if (dish.order.runBranchIdentity !== scientific.runBranchIdentity) {
    throw new Error(
      "runtime historical transaction dish and science belong to different run branches",
    );
  }

  if (dish.order.acceptedCommandCount !== checkpoint.commandCount) {
    throw new Error(
      "runtime historical transaction dish and science accepted-command positions differ",
    );
  }

  if (dish.snapshot.simulationTimeHours !== checkpoint.simulationTimeHours) {
    throw new Error(
      "runtime historical transaction dish and science biological times differ",
    );
  }

  const expectedSnapshotId = `composed-trace:${snapshot.traceHash}`;
  if (dish.snapshot.snapshotId !== expectedSnapshotId) {
    throw new Error(
      "runtime historical transaction dish trace does not match scientific snapshot",
    );
  }

  const expectedSamplingIdentity =
    `runtime-branch:${scientific.runBranchIdentity}`;
  if (dish.snapshot.samplingIdentity !== expectedSamplingIdentity) {
    throw new Error(
      "runtime historical transaction dish sampling identity does not match scientific run branch",
    );
  }
}
