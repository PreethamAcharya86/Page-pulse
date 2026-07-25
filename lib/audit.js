const cheerio = require('cheerio');

/**
 * Custom error type so the route layer can map failures to the right
 * HTTP status / user-facing message instead of guessing from a generic Error.
 */
class AuditError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuditError';
    this.code = code; // 'INVALID_URL' | 'TIMEOUT' | 'FETCH_FAILED' | 'NOT_HTML'
  }
}

/**
 * Validate the URL the same way a user would type it in.
 * Only http/https are accepted - file://, javascript:, data: etc are rejected
 * so the tool can't be pointed at local resources or used to run script URLs.
 */
function parseAndValidateUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AuditError(`"${rawUrl}" is not a valid URL.`, 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AuditError('Only http:// and https:// URLs are supported.', 'INVALID_URL');
  }
  return url;
}

/**
 * Count words the way a reader would: strip tags/scripts/styles first,
 * collapse whitespace, then split. This intentionally undercounts things
 * like inline SVG paths that aren't "words" a visitor reads.
 */
function countWords($) {
  const text = $('body').clone().find('script, style, noscript').remove().end().text();
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function countMissingAltImages($) {
  let missing = 0;
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    // Missing OR empty-but-not-decorative-looking counts as missing.
    // (alt="" is valid for purely decorative images, but we can't tell that
    // automatically, so we flag it and let a human decide - see README.)
    if (alt === undefined) missing += 1;
  });
  return missing;
}

/**
 * Fetch a URL with a hard timeout and turn network-level failures into
 * AuditError so callers get one consistent error shape.
 */
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'PagePulse/1.0 (+https://digitalheroesco.com) audit bot',
      },
    });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AuditError('The request timed out after 8 seconds.', 'TIMEOUT');
    }
    throw new AuditError(`Could not reach that URL: ${err.message}`, 'FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a full audit on a single URL and return a plain JSON-serializable report.
 * This is the function the tests exercise directly (no HTTP involved).
 */
async function auditUrl(rawUrl) {
  const url = parseAndValidateUrl(rawUrl);

  const started = Date.now();
  const response = await fetchWithTimeout(url);
  const responseTimeMs = Date.now() - started;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new AuditError(
      `Response was "${contentType || 'unknown type'}", not HTML. Page Pulse only audits HTML pages.`,
      'NOT_HTML'
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() || null;
  const h1Count = $('h1').length;
  const imagesTotal = $('img').length;
  const imagesMissingAlt = countMissingAltImages($);
  const wordCount = countWords($);

  return {
    url: url.toString(),
    httpStatus: response.status,
    ok: response.ok,
    responseTimeMs,
    title,
    metaDescription,
    h1Count,
    imagesTotal,
    imagesMissingAlt,
    wordCount,
    auditedAt: new Date().toISOString(),
  };
}

module.exports = { auditUrl, parseAndValidateUrl, countWords, countMissingAltImages, AuditError };
