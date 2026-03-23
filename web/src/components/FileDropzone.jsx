"use client";

import { motion } from "framer-motion";
import { UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";

export default function FileDropzone({ onUpload, uploading, progress, uploaded }) {
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles?.[0];
    if (file) {
      await onUpload(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/octet-stream": [".pbix"] },
  });

  const hasError = fileRejections.length > 0;

  return (
    <motion.div
      {...getRootProps()}
      className="card"
      style={{
        padding: 18,
        borderStyle: "dashed",
        borderWidth: 2,
        borderColor: hasError ? "#E74C3C" : isDragActive ? "var(--pbi-yellow)" : "var(--pbi-border)",
        cursor: "pointer",
      }}
      animate={{ scale: isDragActive ? 1.01 : 1 }}
    >
      <input {...getInputProps()} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <UploadCloud color="#F2C811" />
        <div>
          <div>{isDragActive ? "Drop .pbix file here" : "Drag and drop .pbix, or click to browse"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            States: idle / dragging / uploading / ready
          </div>
        </div>
      </div>

      {uploading && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Uploading...
          </div>
          <div style={{ height: 8, background: "#101a33", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--pbi-yellow)" }} />
          </div>
        </div>
      )}

      {uploaded && (
        <div className="card" style={{ marginTop: 12, padding: 10 }}>
          <div style={{ fontWeight: 700 }}>{uploaded.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {(uploaded.size / (1024 * 1024)).toFixed(2)} MB
          </div>
        </div>
      )}

      {hasError && (
        <div style={{ color: "#E74C3C", marginTop: 10, fontSize: 13 }}>
          Invalid file type. Please use a .pbix file.
        </div>
      )}
    </motion.div>
  );
}
