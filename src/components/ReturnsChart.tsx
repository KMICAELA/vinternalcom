import { grossReturns } from "@/data/portfolioData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";

const chartData = grossReturns.map(r => ({
  date: r.date,
  nav: r.nav,
  contributed: Math.abs(r.contribution),
  tvpi: parseFloat(r.grossTVPI.replace("x", "")),
}));

const formatY = (v: number) => {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xl">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono font-medium text-foreground">
            {entry.name === "TVPI" ? `${entry.value}x` : formatY(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const ReturnsChart = () => {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Gross Returns — NAV vs Contributions</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215 15% 55%)" }} axisLine={{ stroke: "hsl(220 14% 18%)" }} />
          <YAxis tickFormatter={formatY} tick={{ fontSize: 11, fill: "hsl(215 15% 55%)" }} axisLine={{ stroke: "hsl(220 14% 18%)" }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="contributed" name="Contributed" fill="hsl(215 15% 35%)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="nav" name="NAV" fill="hsl(160 60% 45%)" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="tvpi" name="TVPI" stroke="hsl(38 92% 55%)" yAxisId={0} strokeWidth={0} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ReturnsChart;
