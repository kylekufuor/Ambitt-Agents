# Portal demo narration

The homepage overview and four use-case recordings use ElevenLabs' **Lily —
Velvety Actress**, a British female voice, with **Eleven v3**. The scripts,
voice settings, original scene boundaries, and output paths are recorded in
`demo-narration.json`. Generation happens offline; no voice API credentials or
runtime API calls are included in the website.

The source videos are the silent portal recordings in commit
`6129b80c7b0ad0e17903ba35a522592befca95c1`, under `website/public/demos/`.
Each recording uses an explicitly fictional workspace. The edit retains the
recorded UI actions and extends scene holds to fit the narration.

The published files have the `-narrated.mp4` suffix and H.264 video with AAC
audio. Speech is delayed by 350 ms, normalized around -16 LUFS, and given a
short end hold. Every caption has the same 350 ms offset. English WebVTT cues
use word timings measured from the generated audio with ElevenLabs Scribe v2;
the recognized words are checked against the scripts before the cues are made.
Captions contain the spoken narration, grouped into short readable phrases.

Release verification covers audio decoding with sound enabled, caption display
at the beginning/middle/end, matching script text, ordered/non-overlapping cues,
audio/video duration, and consistent loudness. All five players are checked at
desktop and mobile widths. The players remain native, user-initiated controls
with captions enabled by default.
