"use client";

import { useEffect, useState } from "react";

function sizeLabel(size) {
  if (!size) return "Unknown size";
  const gb = size / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = size / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

export default function useOllamaModels() {
  const [models, setModels] = useState([{ name: "llama3.2:3b", sizeLabel: "Default" }]);

  useEffect(() => {
    const flask = process.env.NEXT_PUBLIC_FLASK_URL || "http://127.0.0.1:5052";
    fetch(`${flask}/api/ollama/models`)
      .then((r) => r.json())
      .then((data) => {
        const tags = data?.models || [];
        if (!Array.isArray(tags) || tags.length === 0) return;
        const normalized = tags.map((m) => ({
          name: m.name,
          sizeLabel: sizeLabel(m.size),
        }));
        setModels(normalized);
      })
      .catch(() => {
        // Keep default fallback model
      });
  }, []);

  return { models };
}
