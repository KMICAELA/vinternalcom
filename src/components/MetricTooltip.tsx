import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Part = { label: string; value: string };

export type MetricTooltipProps = {
  children: React.ReactNode;
  kind: "derived" | "input" | "missing";
  title: string;
  /** For derived: ordered formula parts to render as "label = value" lines. */
  formula?: { expression: string; parts?: Part[]; result?: string };
  /** For input: source description. */
  source?: string;
  /** For missing: list of inputs not yet available. */
  missingInputs?: string[];
  className?: string;
  align?: "start" | "center" | "end";
};

export default function MetricTooltip({
  children,
  kind,
  title,
  formula,
  source,
  missingInputs,
  className,
  align = "end",
}: MetricTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align={align}
        className="max-w-[380px] p-3 text-xs leading-relaxed"
      >
        <div className="font-semibold text-foreground mb-1.5">{title}</div>
        {kind === "derived" && formula && (
          <div className="space-y-1 font-mono text-[11px]">
            <div className="text-muted-foreground">{formula.expression}</div>
            {formula.parts && formula.parts.length > 0 && (
              <div className="pl-2 border-l border-border space-y-0.5">
                {formula.parts.map((p) => (
                  <div key={p.label} className="text-muted-foreground">
                    <span className="text-foreground/70">{p.label}</span> = {p.value}
                  </div>
                ))}
              </div>
            )}
            {formula.result && (
              <div className="pt-1 mt-1 border-t border-border text-foreground">
                = {formula.result}
              </div>
            )}
          </div>
        )}
        {kind === "input" && source && (
          <div className="text-muted-foreground whitespace-pre-line">
            <span className="text-foreground/70">Source:</span> {source}
          </div>
        )}
        {kind === "missing" && (
          <div className="text-muted-foreground">
            Not yet computed
            {missingInputs && missingInputs.length > 0 && (
              <>
                <span> — required inputs:</span>
                <ul className="mt-1 ml-3 list-disc">
                  {missingInputs.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Format a raw USD value with full precision (no compact) for tooltips. */
export const fmtUsdFull = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

export const fmtPctFull = (v: number | null | undefined, decimals = 2): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
};

export const fmtMultFull = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
};
