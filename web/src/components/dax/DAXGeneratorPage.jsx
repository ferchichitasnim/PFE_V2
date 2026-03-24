"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, Zap } from "lucide-react";
import toast from "react-hot-toast";
import ModelSelector from "../ModelSelector";
import EmptyFileState from "../shared/EmptyFileState";
import { usePBIX } from "../../context/PBIXContext";
import useOllamaModels from "../../hooks/useOllamaModels";
import useDAXGeneration, { saveDaxHistoryEntry } from "../../hooks/useDAXGeneration";
import { formatDaxContextSnippet } from "../../utils/pbixFormat";
import NaturalLanguageInput from "./NaturalLanguageInput";
import ContextInput from "./ContextInput";
import ExamplePrompts from "./ExamplePrompts";
import GenerateDAXButton from "./GenerateDAXButton";
import DAXOutputCard from "./DAXOutputCard";
import DAXHistoryPanel from "./DAXHistoryPanel";

export default function DAXGeneratorPage() {
  const { pbixContext, fileName, uploadVersion } = usePBIX();
  const [query, setQuery] = useState("");
  const [ctx, setCtx] = useState("");
  const { models } = useOllamaModels();
  const [model, setModel] = useState("llama3.2:3b");
  const [histKey, setHistKey] = useState(0);

  const { daxCode, explanation, suggestions, isLoading, error, generate, stop, loadSnapshot } = useDAXGeneration();

  useEffect(() => {
    if (!pbixContext?.tables?.length) {
      setCtx("");
      return;
    }
    setCtx(formatDaxContextSnippet(pbixContext));
  }, [uploadVersion, pbixContext]);

  const onGenerate = async () => {
    const result = await generate({
      query,
      context: ctx,
      model,
      pbixContext: pbixContext?.rawContext || "",
    });
    if (result?.rawText) {
      saveDaxHistoryEntry({
        id: `${Date.now()}`,
        query,
        context: ctx,
        model,
        ts: Date.now(),
        daxCode: result.daxCode,
        explanation: result.explanation,
        suggestions: result.suggestions,
        rawText: result.rawText,
      });
      setHistKey((k) => k + 1);
    }
  };

  const onPickHistory = (it) => {
    setQuery(it.query || "");
    setCtx(it.context || "");
    if (it.model) setModel(it.model);
    loadSnapshot({
      rawText: it.rawText || "",
      daxCode: it.daxCode || "",
      explanation: it.explanation || "",
      suggestions: it.suggestions || "",
    });
    toast.success("Loaded from history");
  };

  const hasModel = Boolean(pbixContext?.tables?.length);

  const header = (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <Zap size={26} color="var(--pbi-yellow)" />
        <h1 style={{ margin: 0, fontSize: 24 }}>DAX Generator</h1>
      </div>
      {hasModel && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid var(--pbi-border)",
            background: "#101a33",
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "var(--pbi-success)",
            }}
          />
          <FileSpreadsheet size={16} color="var(--pbi-yellow)" />
          <span>
            Using: <strong>{fileName}</strong>
          </span>
        </div>
      )}
      <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
        Describe what you want to measure in plain English
      </p>
    </div>
  );

  if (!hasModel) {
    return (
      <div style={{ padding: "20px 20px 28px", maxWidth: "100%" }}>
        {header}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 20 }}>
          <EmptyFileState message="Upload a .pbix file using the bar above so DAX can use your real tables and columns." />
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 20px 28px", maxWidth: "100%" }}>
      <div
        style={{
          display: "grid",
          gap: 24,
          alignItems: "stretch",
          minHeight: "calc(100vh - 120px)",
        }}
        className="dax-page-grid"
      >
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: "grid", gap: 16, alignContent: "start" }}
        >
          {header}

          <NaturalLanguageInput value={query} onChange={setQuery} />
          <ContextInput value={ctx} onChange={setCtx} />
          <ExamplePrompts onPick={setQuery} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <ModelSelector models={models} selected={model} onSelect={setModel} />
            <GenerateDAXButton disabled={!query.trim()} loading={isLoading} onClick={onGenerate} />
            {isLoading && (
              <button
                type="button"
                className="button"
                style={{ background: "#101a33", color: "var(--pbi-text)", border: "1px solid var(--pbi-border)" }}
                onClick={stop}
              >
                Stop
              </button>
            )}
          </div>

          {error && (
            <div className="card" style={{ padding: 12, borderColor: "#E74C3C", color: "#ffc6c6" }}>
              {error.message}
            </div>
          )}

          <DAXHistoryPanel refreshKey={histKey} onSelect={onPickHistory} />
        </motion.div>

        <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <DAXOutputCard
            daxCode={daxCode}
            explanation={explanation}
            suggestions={suggestions}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
