"use client";
import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./workspace";
type RecordRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  watchedMs: number;
  status: string;
  consentOrigin: string | null;
  tool: { name: string };
};
type Observation = {
  id: string;
  startedAt: string;
  endedAt: string;
  watchedMs: number;
  origin: string;
  capture: {
    title: string;
    text: string;
    events: Array<{ action: string; label: string }>;
  } | null;
};
const time = (ms: number) =>
  `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m ${Math.floor(ms / 1000) % 60}s`;
export function WatchRecords({ compact = false }: { compact?: boolean }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [usage, setUsage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Observation[] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    workspaceApi("records")
      .then((d) => {
        setRecords(d.sessions);
        setUsage(d.monthWatchedMs);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (detail) dialog.current?.showModal();
    else dialog.current?.close();
  }, [detail]);
  return (
    <section className="ws-records">
      <header>
        <div>
          <h2>Browser watch log</h2>
          <p>Recorded watching time this month</p>
        </div>
        <strong>{time(usage)}</strong>
      </header>
      <small>
        Time is counted only while watching is on and the portal is visible.
        This is a usage record; it does not add a watching charge to your
        current subscription.
      </small>
      {error && <p role="alert">{error}</p>}
      {loaded && records.length === 0 && (
        <p className="mt-4">
          No browser sessions yet. Open a tool from your workspace to begin.
        </p>
      )}
      <div className="ws-record-list">
        {records.slice(0, compact ? 3 : 50).map((row) => (
          <button
            key={row.id}
            onClick={() =>
              workspaceApi(`records/${row.id}`)
                .then((d) => setDetail(d.observations))
                .catch((e) => setError(e.message))
            }
          >
            <span>
              <strong>{row.tool.name}</strong>
              <small className="block">
                {new Date(row.startedAt).toLocaleString()} ·{" "}
                {row.endedAt
                  ? `Ended ${new Date(row.endedAt).toLocaleTimeString()}`
                  : row.status}
              </small>
            </span>
            <span>{time(row.watchedMs)}</span>
            <span>Review steps →</span>
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="ws-dialog"
        aria-label="Recorded browser steps"
        onClose={() => setDetail(null)}
      >
        <div className="ws-dialog-head">
          <h2>Recorded steps</h2>
          <button
            onClick={() => setDetail(null)}
            aria-label="Close recorded steps"
          >
            ×
          </button>
        </div>
        <p>
          These are structural learning notes, not a screen video. Input values
          are excluded. Page notes expire after 7 days; start, stop and duration
          remain in your log.
        </p>
        {detail?.length === 0 && (
          <p>No watching time was recorded in this session.</p>
        )}
        {detail
          ?.filter(
            (row, i) =>
              !row.capture ||
              row.capture.events?.length ||
              row.capture.text !== detail[i - 1]?.capture?.text,
          )
          .map((row) => (
            <div className="ws-record-step" key={row.id}>
              <small>
                {new Date(row.startedAt).toLocaleTimeString()} –{" "}
                {new Date(row.endedAt).toLocaleTimeString()} · {row.origin}
              </small>
              {row.capture ? (
                <>
                  <h3>{row.capture.title}</h3>
                  {row.capture.events?.map((e, i) => (
                    <p key={i}>
                      {e.action}: {e.label}
                    </p>
                  ))}
                  <details>
                    <summary>Observed page context</summary>
                    <p>{row.capture.text}</p>
                  </details>
                </>
              ) : (
                <p>
                  Watching interval · {time(row.watchedMs)}. No retained page
                  notes.
                </p>
              )}
            </div>
          ))}
      </dialog>
    </section>
  );
}

export function SavedWebTools() {
  const [tools, setTools] = useState<
    Array<{ id: string; name: string; kind: string }>
  >([]);
  const [error, setError] = useState("");
  const refresh = () =>
    workspaceApi("state").then((d) =>
      setTools(d.tools.filter((t: { kind: string }) => t.kind === "web")),
    );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Web tools</h2>
        <a className="ws-primary" href="/?add=1">
          Integrations
        </a>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="ws-web-tools">
        {tools.map((t) => (
          <div key={t.id}>
            <a href={`/?tool=${t.id}`}>{t.name} ↗</a>
            <button
              aria-label={`Remove ${t.name}`}
              onClick={() =>
                workspaceApi(`tools/${t.id}`, {}, "DELETE")
                  .then(refresh)
                  .catch((e) => setError(e.message))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
