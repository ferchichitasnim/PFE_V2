"use client";

export default function NaturalLanguageInput({ value, onChange, id = "nl-query" }) {
  const len = value?.length ?? 0;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label htmlFor={id} style={{ fontWeight: 600, fontSize: 14 }}>
        What do you want to calculate?
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. YTD revenue per product excluding returns..."
        rows={4}
        className="input dax-textarea"
        style={{
          minHeight: 120,
          resize: "vertical",
          lineHeight: 1.5,
          borderColor: "var(--pbi-border)",
          background: "var(--pbi-surface)",
          outline: "none",
          boxShadow: "none",
        }}
      />
      <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
        {len} characters
      </div>
    </div>
  );
}
