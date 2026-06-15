/**
 * Ambitt Agents brand marks — inline JSX so they render even when the CDN
 * blips and so they color-shift with text-color tokens. Two variants:
 *   <BrandLockup />  — three-agent mark + wordmark, used in headers
 *   <AgentSilhouette /> — single-agent mark used as hero/avatar
 */

export function BrandLockup({ height = 22, className = "" }: { height?: number; className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 86 42" width={height * 2.05} height={height} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <g transform="translate(43, 22)">
          <g transform="translate(-28, 0)">
            <rect x={-9} y={-2} width={18} height={18} rx={5} fill="currentColor" />
            <circle cx={0} cy={-11} r={6.5} fill="currentColor" />
            <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
          </g>
          <g>
            <rect x={-9} y={-2} width={18} height={18} rx={5} fill="currentColor" />
            <circle cx={0} cy={-11} r={6.5} fill="currentColor" />
            <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
          </g>
          <g transform="translate(28, 0)">
            <rect x={-9} y={-2} width={18} height={18} rx={5} fill="currentColor" />
            <circle cx={0} cy={-11} r={6.5} fill="currentColor" />
            <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
          </g>
        </g>
      </svg>
      <span className="font-display tracking-tight text-[15px] font-semibold" style={{ color: "var(--text)" }}>
        Ambitt
        <span style={{ color: "var(--brand)" }}> Agents</span>
      </span>
    </div>
  );
}

export function AgentSilhouette({ width = 28, height = 40, color = "currentColor" }: { width?: number; height?: number; color?: string }) {
  return (
    <svg viewBox="0 0 28 40" width={width} height={height} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x={5} y={19} width={18} height={18} rx={5} fill={color} />
      <circle cx={14} cy={10} r={6.5} fill={color} />
      <rect x={9.5} y={8.75} width={9} height={2.5} rx={1.25} fill="#00b3b3" />
    </svg>
  );
}
