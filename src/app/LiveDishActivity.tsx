import { useEffect, useId, useState } from "react";
import type { SimulationSnapshot } from "../sim/protocol";
import { resolveOrganismPresentationForRun } from "./organismPresentationBinding";
import { InterventionIllustration } from "./InterventionIllustration";

interface Sample { readonly time: number; readonly biomass: number; }

/** Recent received checkpoints only. Never estimates missed samples or growth rates. */
export function LiveDishActivity({ snapshot, overview = false }: {
  readonly snapshot: SimulationSnapshot | null;
  readonly overview?: boolean;
}) {
  const gradientId = useId();
  const [samples, setSamples] = useState<readonly Sample[]>([]);
  const checkpoint = snapshot?.checkpoint;
  const composed = checkpoint?.authority === "composed" ? checkpoint : null;
  const organism = resolveOrganismPresentationForRun(composed?.identity ?? null);
  useEffect(() => {
    if (composed === null) { setSamples([]); return; }
    setSamples(previous => {
      const last = previous.at(-1);
      const next = { time: composed.simulationTimeHours, biomass: composed.metrics.totalBiomass };
      if (last?.time === next.time && last.biomass === next.biomass) return previous;
      if (last && next.time < last.time) return [next];
      // Bound this visible rolling window; canonical event/checkpoint history lives in runtime.
      return [...previous.slice(-179), next];
    });
  }, [composed]);
  const maximum = Math.max(...samples.map(sample => sample.biomass), Number.EPSILON);
  const start = samples[0]?.time ?? 0;
  const end = samples.at(-1)?.time ?? start;
  const points = samples.map(sample => `${8 + (end === start ? 0 : (sample.time - start) / (end - start)) * 284},${92 - sample.biomass / maximum * 76}`).join(" ");
  return <>
    {overview && composed ? <section className="colony-overview" aria-label="Whole dish population">
      <div className="colony-overview__identity">
        <span className="colony-overview__portrait"><InterventionIllustration tool="inoculate" /></span>
        <div><h3>{organism?.scientificName ?? "Current population"}</h3><p>{organism?.background ?? "Simulation overview"}</p><span className="colony-tag">{organism?.organismKind ?? "Aggregate biomass"}</span></div>
      </div>
      <h4>Overview</h4>
      <p className="colony-overview__description">{organism ? "A spatial E. coli culture with resource competition and ciprofloxacin response. Select the dish to inspect a local region." : "Select the dish to inspect a local region of this simulation."}</p>
      <dl className="colony-overview__metrics">
        <div><dt>Total biomass</dt><dd>{composed.metrics.totalBiomass.toPrecision(4)} <small>model-biomass</small></dd></div>
        <div><dt>Resource remaining</dt><dd>{composed.metrics.totalResource.toPrecision(4)} <small>model-resource</small></dd></div>
        <div><dt>Lineages</dt><dd>{Object.keys(composed.metrics.lineageBiomass).length}</dd></div>
        <div><dt>Occupied grid cells</dt><dd>{composed.metrics.occupiedCells}</dd></div>
      </dl>
    </section> : null}
    <section className="inspector-activity" aria-label="Live activity">
      <div className="inspector-activity__heading"><h3>Live activity</h3><span>{composed ? "Total biomass" : "Awaiting run"}</span></div>
      {samples.length > 1 ? <>
        <svg className="live-biomass-chart" viewBox="0 0 300 104" role="img" aria-label={`Recent total biomass, ${start.toFixed(2)} to ${end.toFixed(2)} hours. Latest plotted ${samples.at(-1)?.biomass.toPrecision(4)} model-biomass. Vertical scale zero to ${maximum.toPrecision(4)} model-biomass.`}>
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--petra-color-coral)" stopOpacity=".3"/><stop offset="100%" stopColor="var(--petra-color-coral)" stopOpacity=".02"/></linearGradient></defs>
          <path d="M8 10V94H292" fill="none" stroke="var(--petra-color-cream-muted)" strokeOpacity=".18"/>
          <polygon points={`8,94 ${points} 292,94`} fill={`url(#${gradientId})`}/>
          <polyline points={points} fill="none" stroke="var(--petra-color-coral)" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
        <div className="live-biomass-chart__axis"><span>{start.toFixed(1)} h</span><span>{end.toFixed(1)} h</span></div>
        <p>Recent checkpoints · model-biomass · auto-scaled</p>
      </> : <p>Press Play to follow biomass over time.</p>}
    </section>
  </>;
}
