#!/usr/bin/env node
// Web page content extraction with automatic fallback chain
// Usage: node extract.mjs <url> [selector]
// Strategy: curl fast-path → agent-browser → error

import { execSync } from 'child_process';

const url = process.argv[2];
const selector = process.argv[3];

if (!url) {
  console.error('Usage: extract.mjs <url> [css-selector]');
  process.exit(1);
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
function tryCurl() {
  try {
    const html = execSync(
      `curl -sL -m 10 -k -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" "${url}"`,
      { encoding: 'utf-8', timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    );

    if (!html || html.length < 50) return null;

    // Check for bot detection / challenge pages
    if (html.includes('Access Denied') || html.includes('cf-challenge') ||
        html.includes('Just a moment') || html.includes('captcha')) {
      return null; // Need browser
    }

    // Simple extraction from raw HTML
    if (selector) {
      // Can't use CSS selectors without DOM — fall through to browser
      return null;
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract main content (rough heuristic)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (!bodyMatch) return html.substring(0, 5000);

    let body = bodyMatch[1];
    // Strip scripts, styles, nav, footer
    body = body.replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // Strip tags
    body = body.replace(/<[^>]+>/g, ' ');
    // Normalize whitespace
    body = body.replace(/\s+/g, ' ').trim();

    if (body.length > 100) {
      return body.substring(0, 10000);
    }
    return null; // Too little content — try browser
  } catch {
    return null;
  }
}

// Strategy 2: Browser-based extraction
function tryBrowser() {
  try {
    execSync(`agent-browser open "${url}"`, { stdio: 'pipe' });

    // Robust wait: load event + settle delay (no networkidle — hangs on heavy sites)
    try {
      execSync(`agent-browser wait --load load`, { stdio: 'pipe', timeout: 20000 });
    } catch {}
    execSync(`agent-browser wait 2000`, { stdio: 'pipe' });

    let jsCode;
    if (selector) {
      jsCode = `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return 'SELECTOR_NOT_FOUND: ${selector}';
        return el.innerText;
      })()`;
    } else {
      jsCode = `(() => {
        const selectors = ['article', 'main', '[role="main"]', '.content', '#content', '.post-content', '.entry-content'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim().length > 100) return el.innerText.trim();
        }
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('nav, footer, header, script, style, noscript').forEach(el => el.remove());
        return clone.innerText.trim();
      })()`;
    }

    return evalJS(jsCode);
  } catch (err) {
    return null;
  } finally {
    try { execSync('agent-browser close', { stdio: 'pipe' }); } catch {}
  }
}

// Execute fallback chain
const curlResult = tryCurl();
if (curlResult) {
  console.log(curlResult);
  process.exit(0);
}

const browserResult = tryBrowser();
if (browserResult) {
  console.log(browserResult);
  process.exit(0);
}

console.error('All extraction methods failed for:', url);
process.exit(1);
