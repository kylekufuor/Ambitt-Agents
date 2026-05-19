# Ambitt Agents Logo System

## Files

| File | Use For |
|------|---------|
| `ambitt-agents-lockup.svg` | Primary lockup. Headers, marketing, full-identity contexts on light backgrounds. |
| `ambitt-agents-lockup-reverse.svg` | Reverse lockup. On teal or dark backgrounds. |
| `ambitt-agents-mark.svg` | Three-agent mark only, no wordmark. Decorative use, watermarks, repeating patterns. |
| `ambitt-agents-icon.svg` | Single agent app icon (256×256, teal background). iOS/Android app icons, social avatars, square brand tiles. |
| `ambitt-agents-favicon.svg` | Head-only mark in teal rounded square (64×64). Browser favicon. Holds legibility down to 16×16. |

## Quick Decision Guide

- **Wide horizontal space + full brand presence needed** → lockup
- **Square space, brand presence needed** → icon (single agent)
- **Tiny space (browser tab, 16px-32px)** → favicon (head-only)
- **Decorative / pattern / partial mark** → mark (three agents)

## Brand Palette

```
Primary teal      #00b3b3
Primary dark      #009999
Accent cyan       #00d4d4
Text / figure     #171717
Background        #ffffff
Muted bg          #f5f5f5
Border            #e5e5e5
Muted text        #737373
```

## Typography

- **Wordmark:** Geist, weight 700, letter-spacing -0.5, all caps
- **System fallback:** Inter, system-ui, sans-serif (built into the SVGs)

## Notes

- All SVGs use the Geist font loaded from a CDN (`cdn.jsdelivr.net`). For offline use or print, convert the wordmark text to outlines in your design tool.
- The mark, icon, and favicon are pure vector with no text — they will work without font support.
- For print, convert the colors to CMYK in your design tool. Suggested approximate CMYK for #00b3b3: C90 M0 Y40 K10.

## Sibling Brand

This system is a subsidiary identity to **AmbittMedia**. The two share:
- The teal primary color (#00b3b3)
- The rounded, chunky geometric language
- The visor as an "AI eye" is the differentiator unique to Ambitt Agents
