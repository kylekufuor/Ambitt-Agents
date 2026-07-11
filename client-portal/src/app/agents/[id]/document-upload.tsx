"use client";

import { useState, useRef } from "react";
import { KnowledgeIcon } from "@/components/icons";

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
        const n = newDocs.length;
        setResult(`Added ${n} ${n === 1 ? "file" : "files"} — ${agentName}{" "}can work from ${n === 1 ? "it" : "them"} now.`);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  }

  const isError = result?.startsWith("Error") ?? false;
  const displayMsg = isError ? result!.replace(/^Error:\s*/, "") : result;

  return (
    <div className="space-y-4">
      {/* Dropzone — tonal wash, no flat gray outline. */}
      <div
        className="rounded-[12px] px-5 py-5"
        style={{
          background: "linear-gradient(150deg, var(--brand-tint) 0%, var(--surface-2) 70%)",
          boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--brand) 14%, var(--border))",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span className="chip-icon chip-teal shrink-0" style={{ width: 38, height: 38 }}>
            <KnowledgeIcon size={21} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[color:var(--text)]">
              Hand {agentName}{" "}the files it should know
            </p>
            <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 max-w-[520px]">
              SOPs, brand guides, price sheets, target criteria — anything you&apos;d give a new hire.
              PDF, Word, text, CSV, or JSON.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-4">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
            className="text-[13px] text-[color:var(--text-2)] file:mr-3 file:h-9 file:px-3.5 file:rounded-[8px] file:border-0 file:text-[13px] file:font-medium file:bg-[color:var(--surface)] file:text-[color:var(--text)] file:shadow-[0_1px_2px_rgba(45,62,80,0.12)] hover:file:bg-white file:cursor-pointer"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary shrink-0 self-start sm:self-auto disabled:opacity-50"
          >
            {uploading ? "Adding…" : "Add to knowledge"}
          </button>
        </div>

        {result && (
          <span
            className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full mt-3 ${
              isError
                ? "bg-[color:var(--red-tint)] text-[color:var(--red)]"
                : "bg-[color:var(--brand-tint)] text-[color:var(--brand-hover)]"
            }`}
          >
            {!isError && "✓ "}
            {displayMsg}
          </span>
        )}

        <p className="text-[12px] text-[color:var(--text-4)] mt-3">
          Prefer email? Send {agentName}{" "}a message with the subject{" "}
          <strong className="text-[color:var(--text-3)] font-semibold">DOCS</strong> and attach your files.
        </p>
      </div>

      {/* Library — populated vs. warm empty state. */}
      {docs.length > 0 ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-4)] mb-2">
            {docs.length} {docs.length === 1 ? "file" : "files"} in {agentName}&apos;s knowledge
          </p>
          <div className="space-y-1.5">
            {docs.map((doc, i) => (
              <div
                key={`${doc.filename}-${i}`}
                className="flex items-center gap-3 py-2.5 px-3.5 rounded-[10px] bg-[color:var(--surface-2)]"
              >
                <span className="chip-icon chip-indigo shrink-0" style={{ width: 30, height: 30, borderRadius: 8 }}>
                  <FileIcon size={16} />
                </span>
                <span className="text-[13.5px] text-[color:var(--text)] font-medium truncate flex-1">
                  {doc.filename}
                </span>
                <span className="text-[12px] text-[color:var(--text-3)] shrink-0">
                  {new Date(doc.uploadedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[color:var(--text-3)] px-1">
          Nothing here yet — {agentName}{" "}works from what we set up together. Add a file above whenever
          there&apos;s something it should learn.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local duotone file icon (soft body + crisp fold + lit highlight)          */
/* -------------------------------------------------------------------------- */

function FileIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h6l4.5 4.5V19.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5v-15Z" fill="currentColor" opacity="0.2" />
      <path d="M7.5 2.4A2.1 2.1 0 0 0 5.4 4.5v15A2.1 2.1 0 0 0 7.5 21.6h9a2.1 2.1 0 0 0 2.1-2.1V7.9a1 1 0 0 0-.3-.72l-4.4-4.5a1 1 0 0 0-.72-.3H7.5Zm.3 1.8h5.1v3.1a1.4 1.4 0 0 0 1.4 1.4h2.5v11a.3.3 0 0 1-.3.3h-9a.3.3 0 0 1-.3-.3v-15a.3.3 0 0 1 .3-.3Z" fill="currentColor" />
      <rect x="8.6" y="11.4" width="6.8" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="8.6" y="14.4" width="4.8" height="1.6" rx="0.8" fill="currentColor" opacity="0.55" />
      <path d="M7.6 5.1h3a.7.7 0 0 1 0 1.4h-3a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}
