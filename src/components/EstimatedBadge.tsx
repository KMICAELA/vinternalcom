import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Renders an "Estimated (PCAP pending)" badge when a TWH-share metric is
 * derived from fund_total × ownership %, because the underlying report did
 * not carry TWH-specific allocations (e.g. a GP financial statement without
 * a PCAP).
 */
export default function EstimatedBadge({
  className = "",
  detail,
}: {
  className?: string;
  detail?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-medium ${className}`}
          >
            Estimated · PCAP pending
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[320px] text-xs leading-relaxed">
          <div className="font-semibold mb-1">Estimated TWH share</div>
          <div className="text-muted-foreground">
            {detail ??
              "Derived as fund-level total × TWH ownership %. Will be replaced with the exact TWH allocation once the Capital Account Statement (PCAP) is processed."}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
