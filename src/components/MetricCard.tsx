import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  variant?: "default" | "positive" | "negative" | "neutral";
  size?: "sm" | "lg";
}

const MetricCard = ({ label, value, sublabel, variant = "default", size = "sm" }: MetricCardProps) => {
  return (
    <div className={cn(
      "rounded-lg border border-border bg-card p-4 transition-all duration-200",
      size === "lg" && "p-6 metric-glow",
    )}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      <p className={cn(
        "font-mono font-semibold tracking-tight",
        size === "lg" ? "text-2xl" : "text-lg",
        variant === "positive" && "text-positive",
        variant === "negative" && "text-negative",
        variant === "neutral" && "text-foreground",
        variant === "default" && "text-foreground",
      )}>
        {value}
      </p>
      {sublabel && (
        <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
      )}
    </div>
  );
};

export default MetricCard;
