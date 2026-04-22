"use client";

import { useCallback, useRef, useState } from "react";

function parseSSEEvents(buffer, onEvent) {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  for (const evt of parts) {
    const lines = evt.split("\n").map((line) => line.trim());
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        // Ignore malformed lines.
      }
    }
  }
  return remainder;
}

export default function useStoryGeneration() {
  const [story, setStory] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const generate = useCallback(async ({ context, model = "llama3.2:3b", focus = "" }) => {
    const hasStringContext = typeof context === "string" && context.trim().length > 0;
    const hasObjectContext =
      !!context && typeof context === "object" && !Array.isArray(context) && Object.keys(context).length > 0;
    if (!hasStringContext && !hasObjectContext) {
      const err = new Error("Missing PBIX context for storytelling.");
      setError(err);
      return null;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStory("");
    setError(null);
    setIsGenerating(true);

    const flaskUrl = (process.env.NEXT_PUBLIC_FLASK_URL || "http://127.0.0.1:5052").replace(/\/$/, "");
    let acc = "";
    try {
      const res = await fetch(`${flaskUrl}/api/story/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, model, focus }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text || `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error && typeof parsed.error === "string") message = parsed.error;
        } catch {
          // Keep raw text.
        }
        throw new Error(message);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSSEEvents(buffer, (evt) => {
          if (evt?.type === "chunk" && typeof evt.text === "string") {
            acc += evt.text;
            setStory(acc);
          } else if (evt?.type === "error") {
            throw new Error(typeof evt.message === "string" ? evt.message : "Story generation failed.");
          }
        });
      }
      return acc;
    } catch (e) {
      if (e?.name === "AbortError") return null;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      return null;
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { story, isGenerating, error, generate, stop };
}
