"use client";

const EXAMPLES = [
  "YTD revenue per product excluding returns",
  "Month-over-month sales growth %",
  "Top 10 customers by lifetime value",
  "Rolling 3-month average of units sold",
];

export default function ExamplePrompts({ onPick }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
        Try an example:
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onPick(ex)}
            className="dax-pill"
            style={{
              border: "1px solid var(--pbi-border)",
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 12,
              background: "transparent",
              color: "var(--pbi-text)",
              cursor: "pointer",
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
