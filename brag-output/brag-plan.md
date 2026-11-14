# SiteWatch AI — launch video plan

## Answers

- **What is it?** A construction-site monitoring dashboard that shows which sites went over their vibration, noise and dust limits — with a project-only AI assistant.
- **Who is it for / what does it do for them?** Construction engineers and project managers (built for EnTech's NYC sites): one screen tells them where, when and by how much a limit was exceeded, and turns that into a client report.
- **What sets it apart?** The whole dashboard fits one screen; new readings are validated row by row before they go live (and can be rolled back); the AI only answers from the project's data and cites the file it used.
- **Most impressive / funniest claim?** Someone typed `loud` as a noise reading. SiteWatch rejects it: `INVALID_VALUE · row 4: 'loud'`.
- **Visual hook:** a real exceedance from the starter data — "125 Broad St hit 88 dBA. The limit was 85." — then the compact navy dashboard snapping in.
- **Real UI/flow to show:** compact Operations Dashboard → Data Management (typo file → row-numbered errors → fixed file → activated v1) → AI Assistant (live Groq GPT-OSS 120B answer citing `week46.csv (dataset v1)`) → Reports (Download PDF).
- **Tone:** `polished` with one dry wink (the `'loud'` row). Navy, calm, confident.
- **Share caption:** "125 Broad St hit 88 dBA. The limit was 85. SiteWatch AI puts every site, limit and exceedance on one screen — and its AI cites the exact file it read."

## Angle

The numbers are the story. Open on a real exceedance, reveal the screen that shows it, then prove it stays trustworthy: bad rows are caught (even `'loud'`), the AI answers from the data with a source, and the client gets a PDF.

## Visual identity (from the app)

- Background: navy gradient `#0d2554 → #0a1d45 → #081738`, app dark surface `#0b1222`.
- Accents: primary `#2459d6` / `#5b8cff`, exceeded `#ff6b6b`, normal `#4ade80`, missing `#fbbf5a`.
- Type: Inter (the app's font), bold tight headings; Geist Mono feel for codes.
- All UI imagery is real 2× captures of the running app (dark theme).

## Storyboard — 21.0 s, 1920×1080, 30 fps, 120 BPM (bar = 2 s)

| # | Time | Scene | On screen | Motion | Sound |
|---|---|---|---|---|---|
| 1 | 0.0–3.0 | Hook | "125 Broad St hit **88 dBA**." then "The limit was 85." (88 in red) | Words rise in one by one; 88 counts up from 80; a thin red limit line draws under the text | Soft pad swells; low thump on "88" |
| 2 | 3.0–7.0 | Reveal | SiteWatch AI logo → the compact dashboard (real capture) rises from a tilt to flat; KPI cards (real captures) lift off one by one. Caption: "Every site. Every limit. One screen." | Logo scale-in, dashboard 3D settle, staggered KPI lift with glow | Beat kicks in; light whoosh on the dashboard; soft ticks per KPI |
| 3 | 7.0–11.0 | Upload | Real validation report: "3 blocking errors" with `row 4: 'loud'` ringed. Caption: "Every uploaded row gets checked." → real "v1 · Week 46 readings was saved and is now active" + updated KPIs. Caption: "Fix. Activate. Roll back anytime." | Card slides in; ring pulses on 'loud'; staggered swap to the success notice and v1 KPIs | Muted "error" blip on 'loud'; bright chime on activate |
| 4 | 11.0–15.0 | AI | The real input types "Which sites exceeded their limits?", sends; the real Groq answer card rises; source chip glows. Caption: "Ask in plain English. Answers cite the data." | Typing, send click, answer rise, chip glow | Key clicks under the music; gentle swell on the answer |
| 5 | 15.0–18.0 | Reports | Real Reports page; cursor clicks "Download PDF"; toast "sitewatch-summary-v1.pdf · Downloaded". Caption: "Client-ready PDF and CSV. One click." | Zoom toward the button, click ripple, toast slide | Click + soft confirm |
| 6 | 18.0–21.0 | Outro | Logo + "SiteWatch AI", "Construction-site monitoring on one screen.", small "github.com/subhash48/Entech-site-watch · Next.js · FastAPI · Groq GPT-OSS 120B" | Dashboard recedes and blurs behind; type settles; hold | Final chord, tail |

Readability: every caption is fully visible for at least 0.3 s per word after it settles.
