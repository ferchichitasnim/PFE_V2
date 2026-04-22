"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import toast from "react-hot-toast";

function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 || n >= 10 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}

const PBIXContext = createContext(null);

export function PBIXProvider({ children }) {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [pbixContext, setPbixContext] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadVersion, setUploadVersion] = useState(0);

  const clearFile = useCallback(() => {
    setFile(null);
    setFileName("");
    setFileSize("");
    setPbixContext(null);
    setError(null);
    setUploadProgress(0);
    setIsLoading(false);
  }, []);

  const uploadFile = useCallback((f) => {
    if (!f) return;
    if (!f.name?.toLowerCase().endsWith(".pbix")) {
      setError("Only .pbix files are supported.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setUploadProgress(5);
    setFile(f);
    setFileName(f.name);
    setFileSize(formatFileSize(f.size));

    const flask = (process.env.NEXT_PUBLIC_FLASK_URL || "http://127.0.0.1:5052").replace(/\/$/, "");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${flask}/api/pbix/upload`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.max(10, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      setIsLoading(false);
      setUploadProgress(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.ok) {
            setPbixContext({
              tables: data.tables || [],
              columns: data.columns || {},
              measures: data.measures || [],
              relationships: data.relationships || [],
              sources: data.sources || [],
              documentation: data.documentation || null,
              rawContext: data.rawContext || "",
              storyContext: data.context || null,
            });
            setFileName(data.uploaded_name || data.file_name || f.name);
            setUploadVersion((v) => v + 1);
            toast.success("Model loaded");
          } else {
            setError(data.error || "Upload failed");
            setPbixContext(null);
          }
        } catch {
          setError("Invalid response from server");
          setPbixContext(null);
        }
      } else {
        setError(`Upload failed (${xhr.status})`);
        setPbixContext(null);
      }
    };

    xhr.onerror = () => {
      setIsLoading(false);
      setError("Network error during upload");
      setPbixContext(null);
    };

    const form = new FormData();
    form.append("file", f);
    xhr.send(form);
  }, []);

  const value = useMemo(
    () => ({
      file,
      fileName,
      fileSize,
      pbixContext,
      isLoading,
      error,
      uploadProgress,
      uploadVersion,
      uploadFile,
      clearFile,
      setError,
    }),
    [file, fileName, fileSize, pbixContext, isLoading, error, uploadProgress, uploadVersion, uploadFile, clearFile]
  );

  return <PBIXContext.Provider value={value}>{children}</PBIXContext.Provider>;
}

export function usePBIX() {
  const ctx = useContext(PBIXContext);
  if (!ctx) throw new Error("usePBIX must be used within PBIXProvider");
  return ctx;
}

export { formatFileSize, PBIXContext };
