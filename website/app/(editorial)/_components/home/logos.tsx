import { BrandMark, Kicker, TOOLS } from "../primitives";

/**
 * Nuera's two-row logo marquee, opposite directions, 60 seconds a lap
 * (Xtract's speed). Each row is the list twice, so translateX(-50%) loops
 * without a seam. Pauses under the cursor. Vendor marks are the official
 * ones from the sprite; naming them is why the footer carries its disclaimer.
 */
export function Logos() {
  const half = Math.ceil(TOOLS.length / 2);
  const rows = [TOOLS.slice(0, half), TOOLS.slice(half)];
  return (
    <section className="section tight ruled">
      <div className="wrap">
        <div className="logos-label rv">
          <Kicker plain>Works inside the tools you already pay for</Kicker>
        </div>
      </div>
      {rows.map((row, r) => (
        <div key={r} className={r === 1 ? "marquee reverse" : "marquee"} aria-hidden={r === 1 ? true : undefined}>
          <ul>
            {[...row, ...row].map(([id, label], i) => (
              <li key={`${id}-${i}`}>
                <BrandMark id={id} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
