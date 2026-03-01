import { fundHoldings, formatCurrency } from "@/data/portfolioData";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "hsl(45, 90%, 55%)",
  "hsl(45, 60%, 40%)",
  "hsl(0, 0%, 60%)",
  "hsl(0, 0%, 45%)",
  "hsl(0, 0%, 35%)",
  "hsl(145, 60%, 45%)",
  "hsl(210, 70%, 55%)",
  "hsl(38, 80%, 50%)",
  "hsl(0, 0%, 25%)",
];

const data = fundHoldings
  .filter(f => f.twhNAV > 0)
  .map((f, i) => ({
    name: f.name.split(",")[0].split(" LP")[0].trim(),
    value: f.twhNAV,
    color: COLORS[i % COLORS.length],
  }))
  .sort((a, b) => b.value - a.value);

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="text-sm font-medium text-foreground mb-1">{d.name}</p>
      <p className="font-mono text-sm text-primary">{formatCurrency(d.value, true)}</p>
    </div>
  );
};

const FundAllocationChart = () => {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1">NAV Allocation</h3>
      <p className="text-xs text-muted-foreground mb-4">Distribution across funds</p>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-muted-foreground truncate flex-1">{d.name}</span>
              <span className="font-mono text-foreground">{formatCurrency(d.value, true)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FundAllocationChart;
