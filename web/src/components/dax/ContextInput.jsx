"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

export default function ContextInput({ value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "var(--pbi-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          color: "var(--pbi-text)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        <span>Add table/column context (optional)</span>
        <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }} />
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", display: "grid", gap: 8 }}>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Table: Sales, Columns: Date, ProductID, Amount, IsReturn"
            rows={4}
            className="input"
            style={{ minHeight: 96, resize: "vertical", background: "#101a33" }}
          />
          <div className="muted" style={{ fontSize: 12 }}>
            Paste relevant table and column names to improve accuracy
          </div>
        </div>
      )}
    </div>
  );
}
