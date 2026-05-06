import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FundFxRate } from "@/lib/fx/convert";

interface Props {
  rate: FundFxRate | null;
  fromCurrency: string;
  toCurrency?: string;
  updaterName?: string | null;
}

/**
 * Small inline indicator next to converted USD values.
 * - When `rate` is present: shows a subtle dot + tooltip explaining the conversion.
 * - When `rate` is null: amber dot + "FX rate not set".
 */
export function FxBadge({ rate, fromCurrency, toCurrency = "USD", updaterName }: Props) {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return null;

  if (!rate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            FX rate not set for {fromCurrency}→{toCurrency} this quarter. Showing native value.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const updatedAt = new Date(rate.updated_at).toLocaleDateString();
  const who = updaterName ?? "an admin";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 align-middle" />
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          Converted at {rate.rate} {rate.from_currency}→{rate.to_currency} ({rate.source.replace("_", " ")}, set by {who} on {updatedAt})
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
