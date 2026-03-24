"use client";

import { History, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { clearDaxHistory, loadDaxHistory } from "../../hooks/useDAXGeneration";

export default function DAXHistoryPanel({ onSelect, refreshKey = 0 }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(loadDaxHistory());
  }, [refreshKey]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "pbix-dax-history-v1") setItems(loadDaxHistory());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fmt = (ts) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "";
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid var(--pbi-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
          <History size={18} color="var(--pbi-yellow)" />
          Recent Generations
        </div>
        <button
          type="button"
          onClick={() => {
            clearDaxHistory();
            setItems([]);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "1px solid var(--pbi-border)",
            color: "var(--pbi-muted)",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          <Trash2 size={14} /> Clear
        </button>
      </div>
      <div style={{ maxHeight: 200, overflow: "auto" }}>
        {items.length === 0 ? (
          <div className="muted" style={{ padding: 14, fontSize: 13 }}>
            No history yet.
          </div>
        ) : (
          items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                borderBottom: "1px solid var(--pbi-border)",
                background: "transparent",
                color: "var(--pbi-text)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.query}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {fmt(it.ts)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
