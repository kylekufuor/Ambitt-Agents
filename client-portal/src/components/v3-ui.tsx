import * as React from "react";

/* ---------------------------------------------------------------------------
   The handful of primitives every v3 page repeats. Kept here so the pages are
   their content and nothing else, and so a spacing or type change lands
   everywhere at once instead of in eight places.
   --------------------------------------------------------------------------- */

export function PageHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 flex-wrap mb-5">
      <div className="min-w-0">
        <h1 className="text-[24px] font-medium tracking-[-0.01em]">{title}</h1>
        {sub && <p className="text-[14px] text-[color:var(--text-3)] mt-1 max-w-[68ch]">{sub}</p>}
      </div>
      {right && <div className="ml-auto shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`v3-panel p-[17px] ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
      {children}
    </p>
  );
}

/**
 * Label / value pair. `wide` switches to a stacked block for values that are
 * sentences rather than scalars — the right-aligned mono treatment is built for
 * "1987" and turns a sentence into ragged prose against the column edge.
 */
export function Row({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  if (wide) {
    return (
      <div className="py-2 border-b border-[color:var(--border)] last:border-b-0">
        <p className="text-[12.5px] text-[color:var(--text-3)]">{label}</p>
        <div className="text-[14px] text-[color:var(--text-2)] leading-relaxed mt-0.5">{value}</div>
      </div>
    );
  }
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-[color:var(--border)] last:border-b-0">
      <span className="text-[12.5px] text-[color:var(--text-3)] shrink-0">{label}</span>
      <span className="text-[14px] text-[color:var(--text)] text-right">{value}</span>
    </div>
  );
}

/**
 * An empty state that is a good state. Every one of these names what happens
 * next or when — a screen that only says "nothing here" makes the client
 * wonder whether the product is broken or just quiet.
 */
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="max-w-[62ch]">
      <p className="text-[16px] font-medium">{title}</p>
      <p className="text-[14px] text-[color:var(--text-2)] mt-2 leading-relaxed">{children}</p>
    </Panel>
  );
}

/** For anything the client changes by talking to the agent rather than a form. */
export function AskNote({ agentName, children }: { agentName: string; children?: React.ReactNode }) {
  return (
    <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 leading-relaxed">
      {children ?? <>Reply to any of {agentName}&apos;s emails to change this. He confirms before anything takes effect.</>}
    </p>
  );
}
