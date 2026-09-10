import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The editorial pages are long-form copy: apostrophes and quotes stay as
    // literal characters, not &apos;/&quot;. Beyond readability, Next's SWC
    // compiler drops the leading space of a multi-line JSX text run that
    // contains an entity ("a flat {fee} on" rendered as "$5,000on"), so an
    // entity in running copy is a real bug here, not a style choice.
    //
    // Links between the two editorial pages are plain anchors on purpose: a
    // full page load, exactly as the approved build behaved.
    files: ["app/(editorial)/**/*.tsx"],
    rules: { "react/no-unescaped-entities": "off", "@next/next/no-html-link-for-pages": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
