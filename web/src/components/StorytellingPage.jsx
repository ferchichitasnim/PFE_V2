"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import GenerateButton from "./GenerateButton";
import Header from "./Header";
import ModelSelector from "./ModelSelector";
import StoryOutput from "./StoryOutput";
import EmptyFileState from "./shared/EmptyFileState";
import { usePBIX } from "../context/PBIXContext";
import useOllamaModels from "../hooks/useOllamaModels";
import useStoryGeneration from "../hooks/useStoryGeneration";

export default function StorytellingPage() {
  const { pbixContext } = usePBIX();
  const { models } = useOllamaModels();
  const [model, setModel] = useState("llama3.2:3b");
  const outputRef = useRef(null);

  const { completion, complete, isLoading, stop, error } = useStoryGeneration(model);

  const handleGenerate = async () => {
    if (!pbixContext?.storyContext) {
      toast.error("Upload a PBIX file first");
      return;
    }
    outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    await complete(
      "Generate the Power BI storytelling narrative with these sections: Overview, Key Insights, Risks or Data Quality Concerns, Recommended Actions.",
      { body: { context: pbixContext.storyContext, model } }
    );
  };

  return (
    <div className="container" style={{ maxWidth: "100%", margin: 0, padding: "20px 20px 28px" }}>
      <Header />

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: 14 }}>
        {!pbixContext?.storyContext ? (
          <EmptyFileState message="Upload a .pbix file using the bar above to generate a story." />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
              <ModelSelector models={models} selected={model} onSelect={setModel} />
              <div className="card" style={{ padding: 12, display: "grid", alignItems: "end" }}>
                <GenerateButton
                  disabled={!pbixContext?.storyContext}
                  loading={isLoading}
                  onClick={handleGenerate}
                  onStop={stop}
                />
              </div>
            </div>

            {error && (
              <div className="card" style={{ padding: 12, borderColor: "#E74C3C", color: "#ffc6c6" }}>
                {error.message}
              </div>
            )}

            <div ref={outputRef}>
              <StoryOutput content={completion} loading={isLoading} />
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
