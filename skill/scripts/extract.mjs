#!/usr/bin/env node
// Web page content extraction with automatic fallback chain
// Usage: node extract.mjs <url> [selector]
// Strategy: curl fast-path → agent-browser (no TLS skip) → curl -k retry → error

import { execSync, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const BOT_PATTERNS = ['cf-challenge', 'just a moment', 'checking your browser', 'captcha', 'cloudflare ray id', 'bot protection', 'access denied'];

const url = process.argv[2];
const selector = process.argv[3];

if (!url) {
  console.error('Usage: extract.mjs <url> [css-selector]');
  process.exit(1);
}

// Validate URL to prevent command injection
function validateUrl(u) {
  try {
    const parsed = new URL(u);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.error('Only http/https URLs are supported');
      process.exit(1);
    }
    return parsed.href;
  } catch {
    console.error('Invalid URL:', u);
    process.exit(1);
  }
}

const safeUrl = validateUrl(url);

function buildContentJS(selector) {
  if (selector) {
    return `JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map(el => el.innerText || el.textContent).filter(Boolean))`;
  }
  return `(function(){const s=['article','main','[role="main"]','.content','#content'];for(const q of s){const el=document.querySelector(q);if(el&&el.innerText.trim().length>100)return el.innerText.trim();}return document.body?document.body.innerText.trim():'';})()`;
}

function evalJS(code) {
  const b64 = Buffer.from(code).toString('base64');
  return execSync(`agent-browser eval -b "${b64}"`, {
    encoding: 'utf-8',
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024
  }).trim();
}

// Strategy 1: Try curl fast-path (1-2s, no browser)
// skipTls=true only used as fallback after cert error
function tryCurl(skipTls = false) {
  try {
    const args = ['curl', '-sL', '-m', '10', '--compressed',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'];
    if (skipTls) args.push('-k');
    args.push(safeUrl);

    const result = spawnSync(args[0], args.slice(1), {
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024
    });

    const html = result.stdout;
    if (!html || html.length === 0) return null;

    // Detect non-HTML content (JSON, plain text, XML) — return directly even if short
    const trimmed = html.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return html.substring(0, 10000);
    }
    if (!trimmed.includes('<html') && !trimmed.includes('<HTML') &&
        !trimmed.includes('<!DOCTYPE') && !trimmed.includes('<!doctype') &&
        !trimmed.includes('<head') && !trimmed.includes('<body')) {
      // Plain text or non-HTML — return as-is (no min-length for non-HTML)
      return html.substring(0, 10000);
    }

    // HTML responses need minimum content to be useful
    if (html.length < 50) return null;

    // Check for bot detection / challenge pages
    if (BOT_PATTERNS.some(p => html.toLowerCase().includes(p))) {
      return null; // Need browser
    }

    // Simple extraction from raw HTML
    if (selector) {
      // Can't use CSS selectors without DOM — fall through to browser
      return null;
    }

    // Extract title (decode common HTML entities)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim()
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      : '';

    // Detect SPA shell pages (React, Next.js, Vue, Nuxt, Angular) — no real content in HTML
    const SPA_MARKERS = ['id="react-root"', 'id="__next"', 'id="__nuxt"', 'id="app"', 'id="root"', 'ng-app', 'data-reactroot'];
    if (SPA_MARKERS.some(m => html.includes(m))) {
      // SPA detected — curl can't render JS, fall through to browser
      return null;
    }

    // Extract main content (rough heuristic)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (!bodyMatch) return (title ? `# ${title}\n\n` : '') + html.substring(0, 5000);

    let body = bodyMatch[1];
    // Strip scripts, styles, nav, footer
    body = body.replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // Strip tags
    body = body.replace(/<[^>]+>/g, ' ');
    // Normalize whitespace
    body = body.replace(/\s+/g, ' ').trim();

    if (body.length > 100) {
      return (title ? `# ${title}\n\n` : '') + body.substring(0, 10000);
    }
    return null; // Too little content — try browser
  } catch {
    return null;
  }
}

// Strategy 2: Browser-based extraction
function tryBrowser() {
  try {
    // Use spawnSync to avoid shell injection with URL
    spawnSync('agent-browser', ['open', safeUrl], { stdio: 'pipe' });

    // Robust wait: load event + settle delay (no networkidle — hangs on heavy sites)
    try {
      execSync(`agent-browser wait --load load`, { stdio: 'pipe', timeout: 20000 });
    } catch {}
    execSync(`agent-browser wait 2000`, { stdio: 'pipe' });

    const result = evalJS(buildContentJS(selector));

    // Check if browser also got a bot challenge page
    if (result && BOT_PATTERNS.some(p => result.toLowerCase().includes(p))) {
      console.error('BOT_DETECTED: Site requires real browser session. Use chrome-cdp or ghost-os.');
      return null;
    }

    return result;
  } catch (err) {
    return null;
  } finally {
    try { execSync('agent-browser close', { stdio: 'pipe' }); } catch {}
  }
}

// Strategy 3: chrome-cdp (real Chrome session — bypasses bot detection)
function tryCdp() {
  // cdp-eval.mjs requires Node 22+ (built-in WebSocket). Find it.
  function findNode22() {
    const candidates = [
      '/opt/homebrew/opt/node@22/bin/node',
      '/usr/local/opt/node@22/bin/node',
      '/usr/local/bin/node22',
      process.execPath,
    ];
    return candidates.find(p => {
      try {
        const v = spawnSync(p, ['--version'], { encoding: 'utf-8', timeout: 3000 });
        return v.status === 0 && parseInt(v.stdout.trim().replace('v', '')) >= 22;
      } catch { return false; }
    }) ?? null;
  }
  const node22 = findNode22();
  if (!node22) return null; // No Node 22 available, skip cdp tier

  try {
    // Use HTTP API to check if Chrome debugging is available (not WebSocket)
    const checkResult = spawnSync('curl', ['-s', '-m', '2', 'http://localhost:9222/json/version'], {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    });
    if (checkResult.status !== 0 || !checkResult.stdout.includes('Browser')) {
      return null; // Chrome not running with debugging
    }

    // Open new tab via HTTP API and navigate to URL
    const newTabResult = spawnSync('curl', ['-s', '-X', 'PUT', '-m', '5', `http://localhost:9222/json/new?${encodeURIComponent(safeUrl)}`], {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
    });
    if (newTabResult.status !== 0) return null;

    let tabInfo;
    try { tabInfo = JSON.parse(newTabResult.stdout); } catch { return null; }
    const target = tabInfo.id;
    if (!target) return null;

    // Get WebSocket URL for this tab (already in /json/new response)
    const wsUrl = tabInfo.webSocketDebuggerUrl || `ws://localhost:9222/devtools/page/${target}`;

    // Build JS expression for content extraction
    const jsExpr = buildContentJS(selector);

    const cdpEvalScript = join(dirname(fileURLToPath(import.meta.url)), 'cdp-eval.mjs');
    const evalResult = spawnSync(node22, [cdpEvalScript, wsUrl, jsExpr, '5000'], {
      encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Close the tab we opened via HTTP API
    try {
      spawnSync('curl', ['-s', '-X', 'PUT', '-m', '2', `http://localhost:9222/json/close/${target}`], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {}

    if (evalResult.status === 0 && evalResult.stdout.trim().length > 20) {
      const content = evalResult.stdout.trim();
      // Check for bot detection in CDP result too
      if (BOT_PATTERNS.some(p => content.toLowerCase().includes(p))) return null;
      console.error('Extracted via chrome-cdp (real Chrome session)');
      return content;
    }

    return null;
  } catch {
    return null;
  }
}

// Execute fallback chain
const strategies = [
  () => tryCurl(false),
  () => tryBrowser(),
  () => tryCdp(),
  () => { const r = tryCurl(true); if (r) console.error('Warning: TLS verification skipped for', safeUrl); return r; },
];
for (const fn of strategies) {
  const result = fn();
  if (result) { console.log(result); process.exit(0); }
}

// All automated methods failed — suggest manual escalation
console.error(`ESCALATE: All extraction methods failed for ${safeUrl}`);
console.error('Try: ghost_context(app="Chrome") → ghost_find → ghost_read for desktop/visual extraction');
process.exit(1);
