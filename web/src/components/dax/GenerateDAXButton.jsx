"use client";

import { Loader2, Zap } from "lucide-react";

export default function GenerateDAXButton({ disabled, loading, onClick }) {
  return (
    <button
      type="button"
      className="button"
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        width: "100%",
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontSize: 15,
        border: "none",
      }}
    >
      {loading ? <Loader2 size={20} className="dax-spin" /> : <Zap size={20} />}
      {loading ? "Generating DAX..." : "Generate DAX"}
    </button>
  );
}
