"use client";

import { useCallback, useRef, useState } from "react";

const LS_KEY = "pbix-dax-history-v1";

const DAX_DEBUG = process.env.NEXT_PUBLIC_DAX_DEBUG === "1";

function daxClientLog(phase, data) {
  const line = { phase, ...data, t: typeof performance !== "undefined" ? Math.round(performance.now()) : 0 };
  if (DAX_DEBUG) {
    console.debug("[dax:client]", line);
  }
}

export function parseDaxSections(full) {
  const text = full || "";
  const daxMatch = text.match(/##\s*DAX Measure\s*([\s\S]*?)(?=##\s*Logic Explanation\b|$)/i);
  const logicMatch = text.match(/##\s*Logic Explanation\s*([\s\S]*?)(?=##\s*Suggested Improvements\b|$)/i);
  const sugMatch = text.match(/##\s*Suggested Improvements\s*([\s\S]*)$/i);

  let daxCode = (daxMatch?.[1] || "").trim();
  daxCode = daxCode.replace(/^```[\w]*\s*/i, "").replace(/```\s*$/i, "").trim();

  const explanation = (logicMatch?.[1] || "").trim();
  const suggestions = (sugMatch?.[1] || "").trim();

  return { daxCode, explanation, suggestions };
}

function parseSSEDataLine(line) {
  if (!line.startsWith("data:")) return null;
  const raw = line.slice(5).trim();
  if (!raw || raw === "[DONE]") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function useDAXGeneration() {
  const [rawText, setRawText] = useState("");
  const [daxCode, setDaxCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const applyParsed = useCallback((full) => {
    const p = parseDaxSections(full);
    setDaxCode(p.daxCode);
    setExplanation(p.explanation);
    setSuggestions(p.suggestions);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRawText("");
    setDaxCode("");
    setExplanation("");
    setSuggestions("");
    setError(null);
    setIsLoading(false);
  }, []);

  const generate = useCallback(
    async ({ query, context = "", model = "llama3.2:3b", pbixContext = "" }) => {
      const q = (query || "").trim();
      if (!q) {
        setError(new Error("Enter a description first."));
        return null;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setRawText("");
      setDaxCode("");
      setExplanation("");
      setSuggestions("");
      setError(null);
      setIsLoading(true);

      const flask = (process.env.NEXT_PUBLIC_FLASK_URL || "http://127.0.0.1:5052").replace(/\/$/, "");
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      let lastMark = t0;

      const mark = (phase, extra = {}) => {
        const now = typeof performance !== "undefined" ? performance.now() : 0;
        const deltaMs = Math.round(now - lastMark);
        const sinceStartMs = Math.round(now - t0);
        lastMark = now;
        console.info("[dax:client]", phase, { deltaMs, sinceStartMs, ...extra });
        daxClientLog(phase, { deltaMs, sinceStartMs, ...extra });
      };

      mark("1_fetch_start", { url: `${flask}/api/dax/generate` });

      try {
        const res = await fetch(`${flask}/api/dax/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({
            query: q,
            context: context.trim(),
            model,
            pbix_context: typeof pbixContext === "string" ? pbixContext : "",
          }),
          signal: ctrl.signal,
        });

        mark("2_fetch_response_headers", { status: res.status, ok: res.ok });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        let sseEvents = 0;
        let chunkEvents = 0;
        let reqId = null;

        const handleLine = (trimmed) => {
          if (!trimmed) return;
          const evt = parseSSEDataLine(trimmed);
          if (!evt) {
            daxClientLog("sse_unparsed_line", { head: trimmed.slice(0, 80) });
            return;
          }
          sseEvents += 1;
          if (evt.req_id) reqId = evt.req_id;
          daxClientLog("sse_event", { type: evt.type, req_id: evt.req_id, sseEvents });

          if (evt.type === "error") throw new Error(evt.message || "Stream error");
          if (evt.type === "start") {
            mark("4_sse_start_event", { req_id: evt.req_id });
          }
          if (evt.type === "chunk" && evt.text) {
            chunkEvents += 1;
            if (chunkEvents === 1) {
              mark("5_first_text_chunk", { req_id: reqId, textLen: evt.text.length });
            }
            acc += evt.text;
            setRawText(acc);
            applyParsed(acc);
          }
          if (evt.type === "done") {
            mark("6_sse_done_event", { req_id: evt.req_id, chunks: chunkEvents });
          }
        };

        let firstReadBytes = true;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            mark("7_reader_done", { sseEvents, chunkEvents, accChars: acc.length });
            break;
          }
          if (firstReadBytes && value?.byteLength) {
            firstReadBytes = false;
            mark("3_first_raw_bytes_from_flask", { bytes: value.byteLength });
          }
          if (DAX_DEBUG && value?.byteLength) {
            daxClientLog("raw_chunk", { bytes: value.byteLength });
          }
          buffer += decoder.decode(value, { stream: true });

          let sep;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of block.split("\n")) {
              handleLine(line.trim());
            }
          }
        }

        for (const line of buffer.split("\n")) {
          handleLine(line.trim());
        }

        applyParsed(acc);
        const parsed = parseDaxSections(acc);
        mark("8_parse_complete", { totalChars: acc.length, sseEvents, chunkEvents });
        return { rawText: acc, ...parsed };
      } catch (e) {
        if (e?.name === "AbortError") {
          console.info("[dax:client]", "aborted");
          return null;
        }
        console.info("[dax:client]", "error", { message: String(e) });
        setError(e instanceof Error ? e : new Error(String(e)));
        return null;
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [applyParsed]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const loadSnapshot = useCallback((snap) => {
    setRawText(snap.rawText || "");
    setDaxCode(snap.daxCode || "");
    setExplanation(snap.explanation || "");
    setSuggestions(snap.suggestions || "");
    setError(null);
  }, []);

  return {
    rawText,
    daxCode,
    explanation,
    suggestions,
    isLoading,
    error,
    generate,
    reset,
    stop,
    loadSnapshot,
  };
}

export function loadDaxHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDaxHistoryEntry(entry) {
  const prev = loadDaxHistory();
  const next = [entry, ...prev.filter((x) => x.id !== entry.id)].slice(0, 5);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}

export function clearDaxHistory() {
  localStorage.removeItem(LS_KEY);
}
