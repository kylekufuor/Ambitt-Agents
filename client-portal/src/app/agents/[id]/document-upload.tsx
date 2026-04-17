"use client";

import { useState, useRef } from "react";

interface DocumentItem {
  filename: string;
  uploadedAt: string;
}

export function DocumentUpload({
  agentId,
  agentName,
  initialDocs,
}: {
  agentId: string;
  agentName: string;
  initialDocs: DocumentItem[];
}) {
  const [docs, setDocs] = useState(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch(`/api/agents/${agentId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        setResult(`Error: ${body.error ?? res.statusText}`);
      } else {
        const data = await res.json();
        const newDocs = data.documents as DocumentItem[];
        setDocs((prev) => [...prev, ...newDocs]);
        setResult(`${newDocs.length} document(s) uploaded successfully`);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="border border-dashed border-zinc-300 rounded-lg px-4 py-3">
        <p className="text-sm text-zinc-600 mb-2">
          Upload SOPs, brand guides, or any docs to help {agentName} understand your business better.
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
            className="text-sm text-zinc-600 file:mr-3 file:h-9 file:px-3 file:rounded file:border file:border-zinc-300 file:text-sm file:font-medium file:bg-zinc-50 file:text-zinc-900 hover:file:bg-zinc-100 file:cursor-pointer"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="h-9 px-4 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        {result && (
          <p className={`text-sm mt-2 ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
            {result}
          </p>
        )}
        <p className="text-xs text-zinc-500 mt-2">
          Or email your agent with subject <strong>DOCS</strong> and attach your files.
        </p>
      </div>

      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map((doc, i) => (
            <div
              key={`${doc.filename}-${i}`}
              className="flex items-center justify-between py-2 px-3 rounded bg-zinc-50"
            >
              <span className="text-sm text-zinc-900 font-medium">{doc.filename}</span>
              <span className="text-xs text-zinc-500">
                {new Date(doc.uploadedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
