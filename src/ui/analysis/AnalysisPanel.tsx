import {
  useId,
  type CSSProperties,
  type ReactElement,
} from "react";

import type { MotionPreference } from "../motion/policy";
import {
  resolveAnalysisMotion,
  type LineageTreeLayout,
  type LineageTreeNode,
  type ScientificChartProjection,
  type ScientificSeriesProjection,
} from "./model";

import "./analysisPanel.css";

export interface AnalysisPanelProps {
  readonly chart: ScientificChartProjection;
  readonly lineageTree: LineageTreeLayout;
  readonly motion: MotionPreference;
  readonly title?: string;
  readonly className?: string;
}

const CHART = {
  width: 720,
  height: 300,
  left: 70,
  right: 28,
  top: 24,
  bottom: 54,
} as const;

const TREE = {
  width: 720,
  left: 70,
  right: 32,
  top: 34,
  bottom: 42,
  rowHeight: 48,
} as const;

/**
 * Judge-facing scientific analysis surface over already-authoritative samples.
 *
 * SVG geometry is presentation-only. This component never interpolates new
 * scientific samples, mutates lineage state, or interprets animation wall time
 * as biological time.
 */
export function AnalysisPanel({
  chart,
  lineageTree,
  motion,
  title = "Live analysis",
  className,
}: AnalysisPanelProps): ReactElement {
  const titleId = useId();
  const chartTitleId = useId();
  const treeTitleId = useId();
  const motionPlan = resolveAnalysisMotion(motion);
  const style = {
    "--analysis-panel-ms": `${motionPlan.panel.durationMs}ms`,
    "--analysis-chart-ms": `${motionPlan.chart.durationMs}ms`,
    "--analysis-ease": motionPlan.chartEasing.join(", "),
  } as CSSProperties;

  return (
    <section
      className={["analysis-panel", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      data-motion={motion}
      data-panel-treatment={motionPlan.panel.treatment}
      data-chart-treatment={motionPlan.chart.treatment}
      style={style}
    >
      <header className="analysis-panel__header">
        <div>
          <p className="analysis-panel__kicker">Authoritative readout</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <p className="analysis-panel__honesty">
          Source samples only · no invented intermediate values
        </p>
      </header>

      <div className="analysis-panel__grid">
        <section
          className="analysis-card analysis-card--chart"
          aria-labelledby={chartTitleId}
        >
          <header className="analysis-card__header">
            <div>
              <p className="analysis-card__eyebrow">Population trajectory</p>
              <h3 id={chartTitleId}>Scientific time series</h3>
            </div>
            <span className="analysis-card__unit">{chart.unit}</span>
          </header>

          <ScientificChart chart={chart} />

          <p className="analysis-card__note">
            Markers are authoritative samples. Connecting segments are visual
            guides only; Petra does not create interpolated scientific samples.
          </p>
        </section>

        <section
          className="analysis-card analysis-card--lineage"
          aria-labelledby={treeTitleId}
        >
          <header className="analysis-card__header">
            <div>
              <p className="analysis-card__eyebrow">Ancestry</p>
              <h3 id={treeTitleId}>Lineage tree</h3>
            </div>
            <LineageStatusLegend />
          </header>

          <LineageTree tree={lineageTree} />

          <p className="analysis-card__note">
            Horizontal position is lineage creation time. Circle means extant;
            diamond means extinct. Ancestry comes from simulation records.
          </p>
        </section>
      </div>
    </section>
  );
}

function ScientificChart({
  chart,
}: {
  readonly chart: ScientificChartProjection;
}): ReactElement {
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const yBottom = CHART.top + plotHeight;

  return (
    <div className="analysis-chart">
      <svg
        className="analysis-chart__svg"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={`Scientific time series in ${chart.unit}. Simulation time from ${formatNumber(chart.timeMinimumHours)} to ${formatNumber(chart.timeMaximumHours)} hours. Values from ${formatNumber(chart.valueMinimum)} to ${formatNumber(chart.valueMaximum)} ${chart.unit}.`}
        data-interpolation={chart.interpolation}
      >
        <g className="analysis-chart__grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={`grid-y-${fraction}`}
              x1={CHART.left}
              x2={CHART.left + plotWidth}
              y1={CHART.top + plotHeight * fraction}
              y2={CHART.top + plotHeight * fraction}
            />
          ))}
        </g>

        <g className="analysis-chart__axes" aria-hidden="true">
          <line
            x1={CHART.left}
            x2={CHART.left}
            y1={CHART.top}
            y2={yBottom}
          />
          <line
            x1={CHART.left}
            x2={CHART.left + plotWidth}
            y1={yBottom}
            y2={yBottom}
          />
          <text x={CHART.left} y={CHART.height - 16} textAnchor="start">
            {formatNumber(chart.timeMinimumHours)} h
          </text>
          <text
            x={CHART.left + plotWidth}
            y={CHART.height - 16}
            textAnchor="end"
          >
            {formatNumber(chart.timeMaximumHours)} h
          </text>
          <text
            x={16}
            y={CHART.top}
            textAnchor="start"
            transform={`rotate(-90 16 ${CHART.top})`}
          >
            {chart.unit}
          </text>
          <text x={CHART.left - 10} y={CHART.top + 5} textAnchor="end">
            {formatNumber(chart.valueMaximum)}
          </text>
          <text x={CHART.left - 10} y={yBottom} textAnchor="end">
            {formatNumber(chart.valueMinimum)}
          </text>
          <text
            x={CHART.left + plotWidth / 2}
            y={CHART.height - 16}
            textAnchor="middle"
          >
            Simulation time
          </text>
        </g>

        {chart.series.map((series, seriesIndex) => (
          <ScientificSeries
            key={series.id}
            series={series}
            seriesIndex={seriesIndex}
            plotWidth={plotWidth}
            plotHeight={plotHeight}
          />
        ))}
      </svg>

      <ol className="analysis-chart__legend" aria-label="Series legend">
        {chart.series.map((series, index) => (
          <li
            key={series.id}
            data-series-id={series.id}
            data-pattern-token={series.patternToken}
          >
            <span
              className="analysis-chart__series-number"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span>
              <strong>{series.label}</strong>
              <small>
                {series.sourcePointCount} source sample
                {series.sourcePointCount === 1 ? "" : "s"}
              </small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScientificSeries({
  series,
  seriesIndex,
  plotWidth,
  plotHeight,
}: {
  readonly series: ScientificSeriesProjection;
  readonly seriesIndex: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
}): ReactElement {
  const projected = series.points.map((point) => ({
    ...point,
    px: CHART.left + point.x * plotWidth,
    py: CHART.top + point.y * plotHeight,
  }));
  const path = projected
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.px.toFixed(2)} ${point.py.toFixed(2)}`,
    )
    .join(" ");
  const dash = DASH_PATTERNS[seriesIndex % DASH_PATTERNS.length]!;
  const last = projected[projected.length - 1]!;
  const seriesStyle = {
    "--analysis-series": `var(--${safeCssToken(series.appearanceToken)}, currentColor)`,
  } as CSSProperties;

  return (
    <g
      className="analysis-series"
      style={seriesStyle}
      data-series-id={series.id}
      data-pattern-token={series.patternToken}
      aria-label={`${series.label}, ${series.sourcePointCount} authoritative source samples`}
    >
      <path
        className="analysis-series__line"
        d={path}
        strokeDasharray={dash}
        pathLength={1}
      />
      {projected.map((point, pointIndex) => (
        <circle
          key={`${series.id}-${pointIndex}`}
          className="analysis-series__sample"
          cx={point.px}
          cy={point.py}
          r={3.6}
          data-time-hours={point.timeHours}
          data-value={point.value}
        >
          <title>
            {`${series.label}: ${formatNumber(point.value)} ${series.unit} at ${formatNumber(point.timeHours)} h`}
          </title>
        </circle>
      ))}
      <g
        className="analysis-series__endpoint"
        transform={`translate(${last.px} ${last.py})`}
        aria-hidden="true"
      >
        <circle r={10} />
        <text y={0.5}>{seriesIndex + 1}</text>
      </g>
    </g>
  );
}

function LineageTree({
  tree,
}: {
  readonly tree: LineageTreeLayout;
}): ReactElement {
  if (tree.nodes.length === 0) {
    return (
      <div className="analysis-lineage__empty">
        No authoritative lineage ancestry records yet.
      </div>
    );
  }

  const height =
    TREE.top +
    TREE.bottom +
    Math.max(1, tree.nodes.length - 1) * TREE.rowHeight;
  const plotWidth = TREE.width - TREE.left - TREE.right;
  const positions = new Map(
    tree.nodes.map((node) => [
      node.lineageId,
      {
        x: TREE.left + node.x * plotWidth,
        y:
          tree.nodes.length === 1
            ? TREE.top
            : TREE.top + node.y * (height - TREE.top - TREE.bottom),
      },
    ]),
  );

  return (
    <div className="analysis-lineage">
      <svg
        className="analysis-lineage__svg"
        viewBox={`0 0 ${TREE.width} ${height}`}
        role="img"
        aria-label={`Lineage ancestry with ${tree.nodes.length} lineages from ${formatNumber(tree.timeMinimumHours)} to ${formatNumber(tree.timeMaximumHours)} hours`}
      >
        <g className="analysis-lineage__time-axis" aria-hidden="true">
          <line
            x1={TREE.left}
            x2={TREE.left + plotWidth}
            y1={height - 16}
            y2={height - 16}
          />
          <text x={TREE.left} y={height - 2} textAnchor="start">
            {formatNumber(tree.timeMinimumHours)} h
          </text>
          <text x={TREE.left + plotWidth} y={height - 2} textAnchor="end">
            {formatNumber(tree.timeMaximumHours)} h
          </text>
          <text
            x={TREE.left + plotWidth / 2}
            y={height - 2}
            textAnchor="middle"
          >
            Creation time
          </text>
        </g>

        <g className="analysis-lineage__edges" aria-hidden="true">
          {tree.edges.map((edge) => {
            const parent = positions.get(edge.parentLineageId)!;
            const child = positions.get(edge.childLineageId)!;
            const bendX = parent.x + (child.x - parent.x) * 0.5;
            return (
              <path
                key={`${edge.parentLineageId}-${edge.childLineageId}`}
                d={`M ${parent.x.toFixed(2)} ${parent.y.toFixed(2)} L ${bendX.toFixed(2)} ${parent.y.toFixed(2)} L ${bendX.toFixed(2)} ${child.y.toFixed(2)} L ${child.x.toFixed(2)} ${child.y.toFixed(2)}`}
              />
            );
          })}
        </g>

        {tree.nodes.map((node) => {
          const position = positions.get(node.lineageId)!;
          return (
            <LineageNode
              key={node.lineageId}
              node={node}
              x={position.x}
              y={position.y}
            />
          );
        })}
      </svg>
    </div>
  );
}

function LineageNode({
  node,
  x,
  y,
}: {
  readonly node: LineageTreeNode;
  readonly x: number;
  readonly y: number;
}): ReactElement {
  return (
    <g
      className="analysis-lineage__node"
      data-lineage-id={node.lineageId}
      data-lineage-status={node.status}
      role="img"
      aria-label={node.ariaLabel}
      transform={`translate(${x} ${y})`}
    >
      {node.status === "extant" ? (
        <circle className="analysis-lineage__node-shape" r={8} />
      ) : (
        <polygon
          className="analysis-lineage__node-shape"
          points="0,-9 9,0 0,9 -9,0"
        />
      )}
      <text className="analysis-lineage__node-id" x={14} y={-3}>
        {node.lineageId}
      </text>
      <text className="analysis-lineage__node-genotype" x={14} y={11}>
        {node.genotypeId}
      </text>
    </g>
  );
}

function LineageStatusLegend(): ReactElement {
  return (
    <div className="analysis-lineage__legend" aria-label="Lineage status legend">
      <span>
        <i className="analysis-lineage__legend-circle" aria-hidden="true" />
        Extant
      </span>
      <span>
        <i className="analysis-lineage__legend-diamond" aria-hidden="true" />
        Extinct
      </span>
    </div>
  );
}

const DASH_PATTERNS = [
  undefined,
  "10 5",
  "2 5",
  "10 4 2 4",
  "14 5 3 5 3 5",
  "6 4",
] as const;

function safeCssToken(token: string): string {
  const normalized = token.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return normalized.length === 0 ? "analysis-series-fallback" : normalized;
}

function formatNumber(value: number): string {
  const magnitude = Math.abs(value);
  if ((magnitude !== 0 && magnitude < 0.001) || magnitude >= 10_000) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}
