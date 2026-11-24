import type { ReactNode } from "react";

export function Callout({
  title,
  tone = "insight",
  children,
}: {
  title: string;
  tone?: "insight" | "warn";
  children: ReactNode;
}) {
  return (
    <aside className={`kit-callout kit-callout--${tone}`}>
      <div className="kit-callout-title">{title}</div>
      <div>{children}</div>
    </aside>
  );
}

export function StatGrid({
  items,
}: {
  items: readonly { label: string; value: string; sub: string; tone?: "accent" | "emerald" | "cyan" | "amber" | "rose" }[];
}) {
  const colorMap = {
    accent: "var(--accent-strong)",
    emerald: "var(--emerald)",
    cyan: "var(--cyan)",
    amber: "var(--amber)",
    rose: "var(--rose)",
  };
  return (
    <div className="compare-breakout">
      <div className="stat-grid">
        {items.map((item) => (
          <div key={item.label} className="stat-card">
            <div className="stat-label">{item.label}</div>
            <div className="stat-value" style={item.tone ? { color: colorMap[item.tone] } : undefined}>
              {item.value}
            </div>
            <div className="stat-sub">{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
