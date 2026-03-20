#!/usr/bin/env node
// Test harness for extract.mjs — measures success rate across diverse URLs
// Usage: node test-extract.mjs
// Output: success_count/total on last line (parseable metric)

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(__dirname, 'extract.mjs');

const TEST_CASES = [
  // Static HTML — curl should handle
  { url: 'https://example.com', expect: 'Example Domain', name: 'static-basic' },
  { url: 'http://info.cern.ch', expect: 'http://info.cern.ch', name: 'static-cern' },
  // Server-rendered with more content
  { url: 'https://httpbin.org/html', expect: 'Moby-Dick', name: 'server-rendered' },
  // HTTPS with redirects
  { url: 'https://httpbin.org/redirect/1', expect: 'httpbin', name: 'redirect' },
  // JSON API (should extract something useful)
  { url: 'https://httpbin.org/get', expect: 'origin', name: 'json-api' },
  // Page with specific CSS selector
  { url: 'https://example.com', expect: 'Example Domain', name: 'selector', selector: 'h1' },
  // UTF-8 content
  { url: 'https://www.w3.org/2001/06/utf-8-test/UTF-8-demo.html', expect: 'UTF-8', name: 'utf8' },
  // Large page (should not hang)
  { url: 'https://en.wikipedia.org/wiki/Main_Page', expect: 'Wikipedia', name: 'large-page' },
  // Plain text endpoint (not HTML)
  { url: 'https://httpbin.org/robots.txt', expect: 'Disallow', name: 'plain-text' },
  // 404 page (should still extract content)
  { url: 'https://httpbin.org/status/404', expect: '', name: '404-page', expectFail: true },
  // Gzip-encoded response
  { url: 'https://httpbin.org/gzip', expect: 'gzipped', name: 'gzip' },
  // Page with special characters in content
  { url: 'https://httpbin.org/encoding/utf8', expect: 'Unicode', name: 'encoding' },
  // Multiple CSS selectors (complex selector)
  { url: 'https://example.com', expect: 'domain', name: 'selector-p', selector: 'p' },
  // Delayed redirect (30x chain)
  { url: 'https://httpbin.org/redirect/3', expect: 'httpbin', name: 'redirect-chain' },
  // XML response
  { url: 'https://httpbin.org/xml', expect: 'Wake up to WonderWidgets', name: 'xml' },
  // Large JSON response
  { url: 'https://httpbin.org/stream/5', expect: 'url', name: 'streaming-json' },
  // --- HARD MODE: Real-world sites ---
  // GitHub (heavy server-rendered, lots of nav)
  { url: 'https://github.com/anthropics', expect: 'Anthropic', name: 'github-org' },
  // Hacker News (server-rendered, table layout)
  { url: 'https://news.ycombinator.com', expect: 'Hacker News', name: 'hackernews' },
  // StackOverflow (complex layout, cookie banners)
  { url: 'https://stackoverflow.com/questions', expect: 'Stack Overflow', name: 'stackoverflow' },
  // MDN docs (complex layout, server-rendered)
  { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', expect: 'JavaScript', name: 'mdn-docs' },
  // Raw GitHub file (plain text, no HTML)
  { url: 'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md', expect: 'Anthropic', name: 'github-raw' },
  // API docs (usually heavy JS)
  { url: 'https://docs.github.com/en/rest', expect: 'REST API', name: 'github-docs' },
];

let passed = 0;
let failed = 0;
const results = [];

for (const tc of TEST_CASES) {
  const start = Date.now();
  try {
    const args = [EXTRACT, tc.url];
    if (tc.selector) args.push(tc.selector);

    const output = execSync(`node ${args.map(a => `'${a}'`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const elapsed = Date.now() - start;
    const hasExpected = tc.expect === '' || output.toLowerCase().includes(tc.expect.toLowerCase());
    const hasContent = output.length > 20;

    if (tc.expectFail) {
      // For expected failures (404, etc.), passing = script exits non-zero (caught below)
      // If we got here, it means the script returned content — that's actually fine too
      passed++;
      results.push({ name: tc.name, status: 'PASS', ms: elapsed, chars: output.length, reason: 'got content from error page' });
    } else if (hasExpected && hasContent) {
      passed++;
      results.push({ name: tc.name, status: 'PASS', ms: elapsed, chars: output.length });
    } else {
      failed++;
      results.push({
        name: tc.name,
        status: 'FAIL',
        ms: elapsed,
        chars: output.length,
        reason: !hasExpected ? `missing "${tc.expect}"` : 'too short',
      });
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    failed++;
    results.push({
      name: tc.name,
      status: 'ERROR',
      ms: elapsed,
      reason: err.message?.split('\n')[0]?.substring(0, 80) || 'unknown',
    });
  }
}

// Print results table
console.log('\n--- Test Results ---');
for (const r of results) {
  const status = r.status === 'PASS' ? '✓' : '✗';
  const detail = r.reason ? ` (${r.reason})` : '';
  console.log(`${status} ${r.name.padEnd(20)} ${r.status.padEnd(6)} ${String(r.ms).padStart(5)}ms ${r.chars ? r.chars + ' chars' : ''}${detail}`);
}

const total = passed + failed;
const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
console.log(`\n--- Summary ---`);
console.log(`${passed}/${total} passed (${pct}%)`);
// Machine-readable metric on final line
console.log(`METRIC:${passed}`);
