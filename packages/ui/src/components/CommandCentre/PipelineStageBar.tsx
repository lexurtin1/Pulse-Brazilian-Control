import type { PipelineStageSliceDto } from "@pulse-brazil/application";
import { formatCurrency } from "../../utils/formatNumbers";
import "./PipelineStageBar.css";

interface PipelineStageBarProps {
  /** Always the four open stages in funnel order — see GetPipelineSummary.stageBreakdown. */
  stages: PipelineStageSliceDto[];
  /** The headline figure the bar spans. Passed rather than re-summed so the bar can never disagree with the number printed above it. */
  total: number;
}

/**
 * Where the open pipeline is sitting in the funnel, as one stacked bar the
 * width of the headline figure above it.
 *
 * A stacked bar rather than four separate ones because the point is
 * part-to-whole: these four slices ARE the number printed above, and four
 * bars would lose that. Not a pie, for the usual reason — a 0.5% slice is
 * unreadable as an angle and merely thin as a segment.
 *
 * Colour is a one-hue sequential ramp (--color-stage-1..4), because stage is
 * ordinal: pale is early, deep is nearly closed, so the funnel's direction is
 * legible without reading a single label. Identity is never carried by colour
 * alone — every slice is named and valued in the legend below.
 */
export function PipelineStageBar({ stages, total }: PipelineStageBarProps) {
  // A stage can legitimately be empty, and an all-empty pipeline would divide
  // by zero. Nothing to draw either way.
  if (total <= 0) return null;

  const present = stages.filter((slice) => slice.value > 0);

  return (
    <div className="stage-bar">
      <div className="stage-bar__track" role="img" aria-label={ariaSummary(stages, total)}>
        {present.map((slice, index) => (
          <div
            key={slice.stage}
            className="stage-bar__segment"
            data-stage={stageIndex(stages, slice)}
            style={{ flexGrow: slice.value }}
            title={`${slice.stage} — ${formatCurrency(slice.value)} across ${slice.dealCount} ${
              slice.dealCount === 1 ? "deal" : "deals"
            } (${percent(slice.value, total)})`}
            data-first={index === 0 || undefined}
            data-last={index === present.length - 1 || undefined}
          />
        ))}
      </div>

      {/* The legend is also the table view: it carries every number in the
          bar, so the two palest steps sitting under 3:1 against the card
          never leave a slice identifiable by colour alone. */}
      <ul className="stage-bar__legend">
        {stages.map((slice) => (
          <li key={slice.stage} className="stage-bar__legend-row" data-empty={slice.value === 0 || undefined}>
            <span className="stage-bar__swatch" data-stage={stageIndex(stages, slice)} aria-hidden="true" />
            <span className="stage-bar__stage">{slice.stage}</span>
            <span className="stage-bar__value">{slice.value > 0 ? formatCurrency(slice.value) : "—"}</span>
            <span className="stage-bar__count">
              {slice.dealCount > 0 ? `${slice.dealCount} ${slice.dealCount === 1 ? "deal" : "deals"}` : "none"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Position in the funnel, which is what the colour ramp encodes — never the slice's rank by value. */
function stageIndex(stages: PipelineStageSliceDto[], slice: PipelineStageSliceDto): number {
  return stages.findIndex((candidate) => candidate.stage === slice.stage) + 1;
}

function percent(value: number, total: number): string {
  const share = (value / total) * 100;
  // Whole numbers everywhere on this dashboard (see formatNumbers), except
  // that a slice under 1% would round to "0%" and read as nothing at all.
  return share < 1 ? "<1%" : `${Math.round(share)}%`;
}

/** The canvas has no text of its own, so screen readers get the whole breakdown in one line. */
function ariaSummary(stages: PipelineStageSliceDto[], total: number): string {
  const parts = stages
    .filter((slice) => slice.value > 0)
    .map((slice) => `${slice.stage} ${formatCurrency(slice.value)}, ${percent(slice.value, total)}`);
  return `Open pipeline by stage: ${parts.join("; ")}`;
}
