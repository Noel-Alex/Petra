import { useEffect, useMemo, useRef, useState } from "react";
import { createRendererFixtureSnapshot } from "../render/fixture";
import {
  mountPixiDishScene,
  type PixiDishSceneController,
  type RendererMotionMode,
} from "../render/pixiScene";
import type {
  DishRenderSnapshot,
  SemanticZoomLevel,
} from "../render/model";

export interface PixiDishProps {
  readonly motionPreference: RendererMotionMode;
  readonly snapshot?: DishRenderSnapshot;
}

export function PixiDish({
  motionPreference,
  snapshot,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<PixiDishSceneController | null>(null);
  const latestSnapshotRef = useRef<DishRenderSnapshot | null>(null);
  const fixture = useMemo(() => createRendererFixtureSnapshot(), []);
  const activeSnapshot = snapshot ?? fixture;
  const activeOverlay =
    activeSnapshot.fields.find((field) => field.kind === "antibiotic") ??
    activeSnapshot.fields[0];
  const [semanticZoom, setSemanticZoom] =
    useState<SemanticZoomLevel>("dish");

  latestSnapshotRef.current = activeSnapshot;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;

    void mountPixiDishScene({
      host,
      snapshot: latestSnapshotRef.current ?? fixture,
      motionMode: motionPreference,
      onSemanticZoomChange: setSemanticZoom,
    }).then((controller) => {
      if (disposed) {
        controller.destroy();
        return;
      }
      controllerRef.current = controller;
      const latest = latestSnapshotRef.current;
      if (latest !== null) controller.setSnapshot(latest);
    });

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [fixture]);

  useEffect(() => {
    controllerRef.current?.setSnapshot(activeSnapshot);
  }, [activeSnapshot]);

  useEffect(() => {
    controllerRef.current?.setMotionMode(motionPreference);
  }, [motionPreference]);

  return (
    <div className="pixi-dish-shell">
      <div
        ref={hostRef}
        className="pixi-dish-host"
        role="img"
        aria-label={
          snapshot === undefined
            ? "Synthetic Petra renderer fixture in a Petri dish"
            : "Petra authoritative Petri dish visualization"
        }
      />
      <div className="pixi-overlay-legend">
        <span className="overlay-swatch" aria-hidden="true" />
        <span>
          {activeOverlay === undefined
            ? "No overlay"
            : `${activeOverlay.label} · ${activeOverlay.unit}`}
        </span>
      </div>
      <div className="pixi-dish-hud" aria-live="polite">
        <span className="renderer-badge">
          {snapshot === undefined ? "visual fixture" : "live snapshot"}
        </span>
        <span>{semanticZoom.replace("-", " ")}</span>
        <button
          type="button"
          className="dish-reset"
          onClick={() => controllerRef.current?.resetCamera()}
        >
          Dish
        </button>
      </div>
      {snapshot === undefined ? (
        <p className="fixture-disclosure">
          Synthetic renderer fixture only — no displayed values are biological
          measurements or simulation output.
        </p>
      ) : null}
    </div>
  );
}
