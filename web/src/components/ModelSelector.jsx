"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

export default function ModelSelector({ models, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.name === selected) || models[0];

  return (
    <div className="card" style={{ padding: 12, position: "relative" }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        Ollama model
      </div>
      <button
        className="input"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.name || "llama3.2:3b"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          className="card"
          style={{ position: "absolute", zIndex: 10, top: 74, left: 12, right: 12, maxHeight: 220, overflow: "auto" }}
        >
          {models.map((m) => (
            <button
              key={m.name}
              onClick={() => {
                onSelect(m.name);
                setOpen(false);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                color: "var(--pbi-text)",
                border: "none",
                borderBottom: "1px solid var(--pbi-border)",
                padding: 10,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--pbi-surface-alt)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{ fontWeight: 700 }}>{m.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {m.sizeLabel}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
