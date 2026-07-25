const express = require('express');
const path = require('path');
const { auditUrl, AuditError } = require('./lib/audit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Map internal error codes to HTTP statuses so clients get a sensible code,
// not a blanket 500 for everything.
const STATUS_BY_CODE = {
  INVALID_URL: 400,
  NOT_HTML: 422,
  TIMEOUT: 504,
  FETCH_FAILED: 502,
};

app.post('/api/audit', async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Request body must include a "url" string.' });
  }

  try {
    const report = await auditUrl(url);
    return res.json(report);
  } catch (err) {
    if (err instanceof AuditError) {
      return res.status(STATUS_BY_CODE[err.code] || 400).json({ error: err.message, code: err.code });
    }
    // Anything unexpected: log it server-side, never leak internals to the client.
    console.error('Unexpected audit failure:', err);
    return res.status(500).json({ error: 'Something went wrong auditing that page.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Page Pulse running on http://localhost:${PORT}`);
});

module.exports = app;
