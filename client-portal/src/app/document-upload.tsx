"use client";

import { useState, useRef } from "react";

interface DocumentItem {
  filename: string;
  uploadedAt: string;
}

export function DocumentUpload({ agentId, agentName, initialDocs }: { agentId: string; agentName: string; initialDocs: DocumentItem[] }) {
  const [docs, setDocs] = useState(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";

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
      const res = await fetch(`${oracleUrl}/agents/${agentId}/documents`, {
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
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-zinc-500 hover:text-zinc-700 transition flex items-center gap-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>Documents ({docs.length})</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Upload area */}
          <div className="border border-dashed border-zinc-300 rounded-lg p-4">
            <p className="text-zinc-500 text-xs mb-2">
              Upload SOPs, brand guides, or any docs to help {agentName} understand your business better.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
                className="text-xs text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-zinc-300 file:text-xs file:font-medium file:bg-zinc-50 file:text-zinc-700 hover:file:bg-zinc-100 file:cursor-pointer"
              />
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="text-xs font-medium px-3 py-1 rounded bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            {result && (
              <p className={`text-xs mt-2 ${result.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>
                {result}
              </p>
            )}
            <p className="text-zinc-400 text-[11px] mt-2">
              Or email your agent with the subject line <strong>DOCS</strong> and attach your files.
            </p>
          </div>

          {/* Doc list */}
          {docs.length > 0 && (
            <div className="space-y-1">
              {docs.map((doc, i) => (
                <div key={`${doc.filename}-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded bg-zinc-50">
                  <span className="text-xs text-zinc-700 font-medium">{doc.filename}</span>
                  <span className="text-[10px] text-zinc-400">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
