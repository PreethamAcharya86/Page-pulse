# Loom demo script (Task B) — target 2 minutes

Record your screen with `npm start` running. Structure:

**0:00–0:20 — Show it working**
Open `localhost:3000` (or your deployed URL). Paste a real site, hit Audit.
Say: "This is Page Pulse — you give it a URL, it fetches the page and reports
status, load time, title, meta description, H1 count, image alt-text
coverage, and word count."

**0:20–0:45 — Show the error states**
Paste something invalid (e.g. `not-a-url`) → show the inline error, no crash.
Paste a URL to a non-HTML resource (e.g. a raw JSON endpoint or a PDF link)
→ show it's rejected with a clear message instead of a broken report.
Say: "Errors are typed on the backend — invalid URL, timeout, network
failure, non-HTML — so the frontend always knows what actually went wrong."

**0:45–1:15 — Walk through one design decision**
Open `lib/audit.js`, point at the `alt=""` handling in `countMissingAltImages`.
Say: "The one decision I'd defend is that an empty `alt=""` doesn't count as
missing — that's valid markup for a decorative image. Counting it as missing
would push people toward stuffing junk text into decorative images just to
pass the audit, which makes accessibility worse, not better."

**1:15–2:00 — What you'd change with another day**
Say: "Alt-text detection is the honest limitation — `alt=\"img123.jpg\"`
currently reads as present even though it's not useful. Next pass I'd flag
alt text that's empty, too short, or filename-shaped. I'd also add page
weight and a short cache so re-auditing the same URL isn't a fresh fetch
every time."

Keep it conversational — reading this word-for-word will sound stiff, use it
as a beat sheet, not a script to memorize.
