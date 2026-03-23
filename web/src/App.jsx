"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import FileDropzone from "./components/FileDropzone";
import GenerateButton from "./components/GenerateButton";
import Header from "./components/Header";
import ModelSelector from "./components/ModelSelector";
import StoryOutput from "./components/StoryOutput";
import ToastNotifications from "./components/ToastNotifications";
import useOllamaModels from "./hooks/useOllamaModels";
import useStoryGeneration from "./hooks/useStoryGeneration";

export default function App() {
  const [uploaded, setUploaded] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [context, setContext] = useState(null);
  const [pbixPath, setPbixPath] = useState("");
  const { models } = useOllamaModels();
  const [model, setModel] = useState("llama3.2:3b");
  const outputRef = useRef(null);

  const { completion, complete, isLoading, stop, error } = useStoryGeneration(model);

  const handleUpload = (file) =>
    new Promise((resolve) => {
      setUploading(true);
      setProgress(5);

      const flask = process.env.NEXT_PUBLIC_FLASK_URL || "http://127.0.0.1:5052";
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${flask}/api/pbix/upload`);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          setProgress(Math.max(10, Math.round((evt.loaded / evt.total) * 100)));
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          if (data.ok) {
            setUploaded({ name: file.name, size: file.size });
            setContext(data.context);
            setPbixPath(data.pbix_path || "");
            setProgress(100);
            toast.success("PBIX ready");
          } else {
            toast.error(data.error || "Upload failed");
          }
        } else {
          toast.error(`Upload failed (${xhr.status})`);
        }
        resolve();
      };

      xhr.onerror = () => {
        setUploading(false);
        toast.error("Network error during upload");
        resolve();
      };

      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    });

  const handleGenerate = async () => {
    if (!context) {
      toast.error("Upload a PBIX file first");
      return;
    }
    outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    await complete(
      "Generate the Power BI storytelling narrative with these sections: Overview, Key Insights, Risks or Data Quality Concerns, Recommended Actions.",
      { body: { context, pbixPath, model } }
    );
  };

  return (
    <div className="container">
      <ToastNotifications />
      <Header />

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: 14 }}>
        <FileDropzone onUpload={handleUpload} uploading={uploading} progress={progress} uploaded={uploaded} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              PBIX path (optional fallback)
            </div>
            <input className="input" value={pbixPath} onChange={(e) => setPbixPath(e.target.value)} />
          </div>
          <ModelSelector models={models} selected={model} onSelect={setModel} />
          <div className="card" style={{ padding: 12, display: "grid", alignItems: "end" }}>
            <GenerateButton disabled={!context} loading={isLoading} onClick={handleGenerate} onStop={stop} />
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
      </motion.div>
    </div>
  );
}
