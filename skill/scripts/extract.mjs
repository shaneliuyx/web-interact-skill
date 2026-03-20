#!/usr/bin/env node
// Web page content extraction with automatic fallback chain
// Usage: node extract.mjs <url> [selector]
// Strategy: curl fast-path → agent-browser (no TLS skip) → curl -k retry → error

import { execSync, spawnSync } from 'child_process';

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
    if (!html || html.length < 50) return null;

    // Check for bot detection / challenge pages
    const botPatterns = ['Access Denied', 'cf-challenge', 'Just a moment',
      'captcha', 'security verification', 'checking your browser',
      'verify you are not a bot', 'please wait while we verify',
      'Attention Required', 'Enable JavaScript and cookies'];
    if (botPatterns.some(p => html.toLowerCase().includes(p.toLowerCase()))) {
      return null; // Need browser
    }

    // Simple extraction from raw HTML
    if (selector) {
      // Can't use CSS selectors without DOM — fall through to browser
      return null;
    }

    // Detect non-HTML content (JSON, plain text, XML) — return directly
    const trimmed = html.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      // JSON response — return as-is (truncated)
      return html.substring(0, 10000);
    }
    if (!trimmed.includes('<html') && !trimmed.includes('<HTML') &&
        !trimmed.includes('<!DOCTYPE') && !trimmed.includes('<!doctype') &&
        !trimmed.includes('<head') && !trimmed.includes('<body')) {
      // Plain text or non-HTML — return as-is
      return html.substring(0, 10000);
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

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

    let jsCode;
    if (selector) {
      // Use JSON.stringify for both querySelector arg AND error message to prevent injection
      const safeSelector = JSON.stringify(selector);
      jsCode = `(() => {
        const sel = ${safeSelector};
        const el = document.querySelector(sel);
        if (!el) return 'SELECTOR_NOT_FOUND: ' + sel;
        const title = document.title || '';
        const text = el.innerText.trim();
        return (title ? '# ' + title + '\\n\\n' : '') + '[' + sel + '] ' + text;
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

    const result = evalJS(jsCode);

    // Check if browser also got a bot challenge page
    if (result && (result.toLowerCase().includes('verify you are not a bot') ||
        result.toLowerCase().includes('security verification') ||
        result.toLowerCase().includes('checking your browser') ||
        result.toLowerCase().includes('enable javascript and cookies'))) {
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
  const cdpScript = join(process.env.HOME || '', '.claude/skills/chrome-cdp/scripts/cdp.mjs');

  try {
    // Check if Chrome is running with debugging
    const listResult = spawnSync('node', [cdpScript, 'list'], {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    });
    if (listResult.status !== 0 || !listResult.stdout.trim()) {
      return null; // Chrome not running or no debugging
    }

    // Open a new tab and navigate
    const openResult = spawnSync('node', [cdpScript, 'open', safeUrl], {
      encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe']
    });
    if (openResult.status !== 0) return null;

    // Extract target ID from open output (usually the last line has the target prefix)
    const openOutput = openResult.stdout.trim();
    const targetMatch = openOutput.match(/([A-F0-9]{4,})/i);
    if (!targetMatch) return null;
    const target = targetMatch[1];

    // Wait for page load
    spawnSync('node', [cdpScript, 'nav', target, safeUrl], {
      encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe']
    });

    // Try eval extraction first
    let jsExpr;
    if (selector) {
      jsExpr = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? document.title + '\\n\\n' + el.innerText : null; })()`;
    } else {
      jsExpr = `(() => { const sels = ['article','main','[role=main]','.content','#content']; for (const s of sels) { const el = document.querySelector(s); if (el && el.innerText.trim().length > 100) return document.title + '\\n\\n' + el.innerText.trim(); } const c = document.body.cloneNode(true); c.querySelectorAll('nav,footer,header,script,style,noscript').forEach(e=>e.remove()); return document.title + '\\n\\n' + c.innerText.trim(); })()`;
    }

    const evalResult = spawnSync('node', [cdpScript, 'eval', target, jsExpr], {
      encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Close the tab we opened
    try {
      spawnSync('node', [cdpScript, 'evalraw', target, 'Target.closeTarget', JSON.stringify({targetId: target})], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {}

    if (evalResult.status === 0 && evalResult.stdout.trim().length > 20) {
      const content = evalResult.stdout.trim();
      // Check for bot detection in CDP result too
      const botPatterns = ['verify you are not a bot', 'security verification', 'checking your browser'];
      if (botPatterns.some(p => content.toLowerCase().includes(p))) return null;
      console.error('Extracted via chrome-cdp (real Chrome session)');
      return content;
    }

    // Fallback: try html command
    const htmlArgs = selector ? [cdpScript, 'html', target, selector] : [cdpScript, 'html', target];
    const htmlResult = spawnSync('node', htmlArgs, {
      encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (htmlResult.status === 0 && htmlResult.stdout.trim().length > 20) {
      console.error('Extracted via chrome-cdp html');
      return htmlResult.stdout.trim().substring(0, 10000);
    }

    return null;
  } catch {
    return null;
  }
}

// Execute fallback chain
// Tier 1: curl fast-path
const curlResult = tryCurl(false);
if (curlResult) {
  console.log(curlResult);
  process.exit(0);
}

// Tier 2: headless browser
const browserResult = tryBrowser();
if (browserResult) {
  console.log(browserResult);
  process.exit(0);
}

// Tier 3: chrome-cdp (real Chrome — bypasses bot detection)
const cdpResult = tryCdp();
if (cdpResult) {
  console.log(cdpResult);
  process.exit(0);
}

// Tier 4: retry curl with TLS verification disabled (for self-signed certs)
const curlInsecure = tryCurl(true);
if (curlInsecure) {
  console.error('Warning: TLS verification skipped for', safeUrl);
  console.log(curlInsecure);
  process.exit(0);
}

// All automated methods failed — suggest manual escalation
console.error(`ESCALATE: All extraction methods failed for ${safeUrl}`);
console.error('Try: ghost_context(app="Chrome") → ghost_find → ghost_read for desktop/visual extraction');
process.exit(1);
