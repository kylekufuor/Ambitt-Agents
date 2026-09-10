/**
 * The agent head avatar: the Ambitt mark, tinted and lit per agent.
 *
 * Every instance on the site is this one drawing. Only the three body tones
 * change per agent; the gloss, the eye whites and the drop shadow are shared.
 * Gradient and filter ids must be unique in the document (a duplicate id
 * resolves to whichever copy comes first, and if that copy sits in a hidden
 * subtree the gradient paints nothing), so each instance takes a `uid`.
 */

const TONES = {
  otto: ["#00aca9", "#00807e", "#005453"],
  arthur: ["#3b7dbf", "#2f5d8c", "#1d3d5e"],
  wade: ["#d47648", "#a8552c", "#71371b"],
  priya: ["#7f6cb6", "#5b4a8f", "#3b2f60"],
} as const;

export type AgentName = keyof typeof TONES;

export const AGENT_LABEL: Record<AgentName, string> = {
  otto: "Otto",
  arthur: "Arthur",
  wade: "Wade",
  priya: "Priya",
};

export function AgentAvatar({
  agent,
  uid,
  size,
}: {
  agent: AgentName;
  /** Unique within the page, e.g. "hero-wade". Becomes part of every internal id. */
  uid: string;
  /** Rendered size, e.g. "30px". Omit inside a container that sizes the svg itself. */
  size?: string;
}) {
  const [light, body, shade] = TONES[agent];
  const id = (layer: "b" | "p" | "r" | "e" | "d" | "s") => `${layer}${agent}-${uid}`;
  const url = (layer: "b" | "p" | "r" | "e" | "d" | "s") => `url(#${id(layer)})`;
  return (
    <svg
      className={size ? "agent-av" : undefined}
      style={size ? { "--av": size } : undefined}
      viewBox="0 0 128 116"
      role="img"
      aria-label={AGENT_LABEL[agent]}
    >
      <defs>
        <linearGradient id={id("b")} x1=".12" y1="0" x2=".72" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset=".46" stopColor={body} />
          <stop offset="1" stopColor={shade} />
        </linearGradient>
        <linearGradient id={id("p")} x1=".2" y1="0" x2=".8" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".10" />
          <stop offset="1" stopColor="#00131a" stopOpacity=".13" />
        </linearGradient>
        <linearGradient id={id("r")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".30" />
          <stop offset=".30" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id("e")} cx=".34" cy=".28" r=".92">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".6" stopColor="#e6eff1" />
          <stop offset="1" stopColor="#a9c2c8" />
        </radialGradient>
        <filter id={id("d")} x="-40%" y="-30%" width="180%" height="180%">
          <feDropShadow dx="0" dy="5" stdDeviation="5.5" floodColor={shade} floodOpacity=".38" />
        </filter>
        <filter id={id("s")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <circle cx="64" cy="62" r="60" fill={body} opacity=".12" />
      <circle cx="64" cy="62" r="60" fill={url("p")} />
      <g filter={url("d")}>
        <ellipse cx="64" cy="103" rx="33" ry="5.5" fill={shade} opacity=".26" filter={url("s")} />
        <circle cx="64" cy="14" r="7" fill={body} />
        <rect x="60.5" y="19" width="7" height="16" rx="3.5" fill={body} />
        <rect x="12" y="56" width="12" height="27" rx="6" fill={shade} />
        <rect x="104" y="56" width="12" height="27" rx="6" fill={shade} />
        <rect x="21" y="33" width="86" height="68" rx="24" fill={url("b")} />
        <rect x="21" y="33" width="86" height="68" rx="24" fill={url("r")} />
        <rect x="24" y="36" width="80" height="62" rx="21.5" fill="none" stroke="#fff" strokeOpacity=".17" strokeWidth="1.3" />
        <circle cx="49" cy="68" r="12.5" fill={url("e")} />
        <circle cx="79" cy="68" r="12.5" fill={url("e")} />
        <circle cx="45.7" cy="64.5" r="3.4" fill="#fff" opacity=".95" />
        <circle cx="75.7" cy="64.5" r="3.4" fill="#fff" opacity=".95" />
      </g>
    </svg>
  );
}

/** The avatar with the agent's name and standing job beside it, as it opens each vignette. */
export function AgentByline({
  agent,
  uid,
  size,
  role,
  style,
}: {
  agent: AgentName;
  uid: string;
  size: string;
  role: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="vignette-kicker" style={style}>
      <AgentAvatar agent={agent} uid={uid} size={size} />
      <span>
        <span className="vignette-name">{AGENT_LABEL[agent]}</span>
        <br />
        <span className="vignette-role">{role}</span>
      </span>
    </div>
  );
}
