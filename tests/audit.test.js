const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const cheerio = require('cheerio');
const {
  auditUrl,
  parseAndValidateUrl,
  countWords,
  countMissingAltImages,
  AuditError,
} = require('../lib/audit');

// --- Pure function tests (no network) --------------------------------------

test('countWords counts visible text and ignores script/style content', () => {
  const $ = cheerio.load(`
    <html><body>
      <h1>Hello world</h1>
      <p>This is a short paragraph with six words.</p>
      <script>var shouldNotCount = "these words are code not content";</script>
      <style>.also-not-content { color: red; }</style>
    </body></html>
  `);
  // "Hello world" (2) + "This is a short paragraph with six words." (8) = 10
  assert.equal(countWords($), 10);
});

test('countMissingAltImages flags only images with no alt attribute at all', () => {
  const $ = cheerio.load(`
    <img src="a.jpg" alt="A real description">
    <img src="b.jpg" alt="">
    <img src="c.jpg">
  `);
  // Only the third image has no alt attribute at all.
  assert.equal(countMissingAltImages($), 1);
});

test('parseAndValidateUrl rejects non-http(s) protocols', () => {
  assert.throws(() => parseAndValidateUrl('javascript:alert(1)'), AuditError);
  assert.throws(() => parseAndValidateUrl('file:///etc/passwd'), AuditError);
});

test('parseAndValidateUrl accepts a well-formed https URL', () => {
  const url = parseAndValidateUrl('https://example.com/page');
  assert.equal(url.protocol, 'https:');
});

// --- Failure case 1: malformed input, no network needed --------------------

test('auditUrl rejects a garbage string before ever touching the network', async () => {
  await assert.rejects(
    () => auditUrl('not a url at all'),
    (err) => {
      assert.ok(err instanceof AuditError);
      assert.equal(err.code, 'INVALID_URL');
      return true;
    }
  );
});

// --- Happy path + failure case 2, against a local test server --------------

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/happy') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head>
            <title>Test Page</title>
            <meta name="description" content="A page used for testing.">
          </head>
          <body>
            <h1>Only heading</h1>
            <p>Four simple words here.</p>
            <img src="ok.jpg" alt="described">
            <img src="missing.jpg">
          </body>
        </html>
      `);
    } else if (req.url === '/not-html') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test('auditUrl happy path: returns a complete, correct report for a real HTML page', async () => {
  const report = await auditUrl(`${baseUrl}/happy`);

  assert.equal(report.httpStatus, 200);
  assert.equal(report.ok, true);
  assert.equal(report.title, 'Test Page');
  assert.equal(report.metaDescription, 'A page used for testing.');
  assert.equal(report.h1Count, 1);
  assert.equal(report.imagesTotal, 2);
  assert.equal(report.imagesMissingAlt, 1);
  assert.equal(report.wordCount, 6); // "Only heading" + "Four simple words here."
  assert.ok(typeof report.responseTimeMs === 'number');
});

test('auditUrl failure case: non-HTML response is rejected with NOT_HTML', async () => {
  await assert.rejects(
    () => auditUrl(`${baseUrl}/not-html`),
    (err) => {
      assert.ok(err instanceof AuditError);
      assert.equal(err.code, 'NOT_HTML');
      return true;
    }
  );
});

test('auditUrl failure case: unreachable host is rejected with FETCH_FAILED', async () => {
  await assert.rejects(
    () => auditUrl('http://127.0.0.1:1'), // port 1 - nothing listens there
    (err) => {
      assert.ok(err instanceof AuditError);
      assert.equal(err.code, 'FETCH_FAILED');
      return true;
    }
  );
});
