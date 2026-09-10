import "react";

// Lets inline styles set CSS custom properties, e.g. style={{ "--av": "30px" }},
// which the editorial components use to tune one shared stylesheet per instance.
declare module "react" {
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
