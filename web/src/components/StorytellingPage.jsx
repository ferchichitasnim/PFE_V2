"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { BookOpenText } from "lucide-react";
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

  const { story, generate, isGenerating, stop, error } = useStoryGeneration();

  const storyInputContext = pbixContext?.storyContext || pbixContext?.rawContext || null;

  const handleGenerate = async () => {
    if (!storyInputContext) {
      toast.error("Upload a PBIX file first");
      return;
    }
    outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    await generate({
      context: storyInputContext,
      model,
    });
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Header
        title="Storytelling"
        subtitle="Generate a clear business narrative from your PBIX model with overview, insights, risk flags, and recommended actions."
        icon={<BookOpenText size={24} color="var(--pbi-primary)" />}
      />

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: 16 }}>
        {!storyInputContext ? (
          <EmptyFileState message="Upload a .pbix file using the bar above to generate a story." />
        ) : (
          <>
            <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
              <ModelSelector models={models} selected={model} onSelect={setModel} />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <GenerateButton
                  disabled={!storyInputContext}
                  loading={isGenerating}
                  onClick={handleGenerate}
                  onStop={stop}
                />
              </div>
            </div>

            {error && (
              <div className="card" style={{ padding: 12, borderColor: "rgba(217, 83, 79, 0.5)", color: "var(--pbi-danger)" }}>
                {error.message}
              </div>
            )}

            <div ref={outputRef}>
              <StoryOutput content={story} loading={isGenerating} />
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
