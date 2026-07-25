# Page Pulse

A tiny tool that audits any URL. Paste a link, get back HTTP status, response
time, title, meta description, H1 count, images missing `alt` text, and an
approximate word count.

Built for the Digital Heroes SDE internship task kit (Role 03, Tasks A & B).

## Stack

- **Backend:** Node.js + Express, native `fetch` (Node 18+), `cheerio` for HTML parsing
- **Frontend:** vanilla HTML/CSS/JS, no build step, no framework
- **Tests:** Node's built-in test runner (`node --test`), no extra test framework needed

## Setup

```bash
npm install
npm start          # serves on http://localhost:3000
```

Requires Node 18+ (uses the built-in global `fetch`). Tested on Node 22.

Run the test suite:

```bash
npm test
```

## API contract

### `POST /api/audit`

Request body:

```json
{ "url": "https://example.com" }
```

Success response — `200 OK`:

```json
{
  "url": "https://example.com/",
  "httpStatus": 200,
  "ok": true,
  "responseTimeMs": 184,
  "title": "Example Domain",
  "metaDescription": null,
  "h1Count": 1,
  "imagesTotal": 0,
  "imagesMissingAlt": 0,
  "wordCount": 28,
  "auditedAt": "2026-07-25T10:22:47.100Z"
}
```

Error responses share one shape, `{ "error": string, "code": string }`, with
the HTTP status chosen to match the failure:

| `code` | HTTP status | Meaning |
|---|---|---|
| `INVALID_URL` | 400 | Malformed URL, or a scheme other than `http`/`https` |
| `NOT_HTML` | 422 | The response wasn't `text/html` (e.g. a JSON API, an image, a PDF) |
| `TIMEOUT` | 504 | No response within 8 seconds |
| `FETCH_FAILED` | 502 | DNS failure, connection refused, TLS error, etc. |

### `GET /api/health`

Returns `{ "ok": true }`. Used for uptime checks on whatever free host this
is deployed to.

## Design decisions

**1. Business logic lives outside the HTTP layer.**
`lib/audit.js` exports `auditUrl()` as a plain async function that takes a
string and returns a report or throws an `AuditError`. `server.js` only
translates that into HTTP. This is why the test suite (Task B) can call
`auditUrl()` directly with a real local HTTP server instead of spinning up
Express and doing string-matching on responses — the tests exercise the
actual logic, not a simulation of it.

**2. Errors are typed, not stringly-matched.**
Every failure mode (bad input, non-HTML response, timeout, network failure)
throws an `AuditError` with a `code`. The route handler maps codes to HTTP
statuses with a lookup table. The alternative — parsing `err.message` for
keywords to decide the status code — is exactly the kind of thing that
silently breaks the first time an error message wording changes. This also
makes the failure modes directly testable without needing a real broken
network.

**3. `alt=""` is not treated the same as a missing `alt` attribute.**
An empty `alt=""` is the *correct* markup for a purely decorative image —
it tells a screen reader to skip it. Counting it as "missing" would push
teams toward stuffing junk text into decorative images just to make the
audit number look better, which makes accessibility worse, not better. Only
images with no `alt` attribute at all count as "missing." This can't be
made fully accurate without knowing which images are decorative, which is
flagged as a known limitation below rather than quietly assumed away.

## What I'd change with another day

Alt-text detection is a real limitation: an image with `alt="image123.jpg"`
or `alt="img"` currently counts as "has alt text" even though it's not
meaningfully descriptive. A next pass would flag alt text that's empty,
suspiciously short, or looks like a filename, rather than just checking
attribute presence. I'd also add a small on-page-weight check (total
transferred bytes, image sizes) since page speed and page weight are usually
asked about in the same breath, and cache recent audits for a few minutes
so hammering the same URL doesn't re-fetch it every time.

## AI use

I used Claude to scaffold the Express/cheerio boilerplate and the test file
structure, then revised the error-handling design (typed `AuditError` +
status-code lookup table instead of message-matching) and the alt-text
counting rule myself, since the first draft treated empty `alt=""` as
"missing," which would have penalized correct accessibility markup.
