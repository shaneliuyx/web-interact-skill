#!/usr/bin/env node
// PostToolUse hook for WebFetch — detects empty/blocked results and suggests web-interact fallback
// Installed as a PostToolUse hook on WebFetch in Claude Code settings

import { readFileSync } from 'fs';

// Read hook input from stdin
let input = '';
try {
  input = readFileSync('/dev/stdin', 'utf-8');
} catch { process.exit(0); }

let hookData;
try {
  hookData = JSON.parse(input);
} catch { process.exit(0); }

const toolName = hookData?.tool_name || '';
if (toolName !== 'WebFetch') process.exit(0);

const result = hookData?.tool_result || '';
const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

// Detect failure patterns
const FAIL_PATTERNS = [
  'failed to fetch',
  'connection refused',
  'timeout',
  'access denied',
  '403 forbidden',
  '401 unauthorized',
  'login required',
  'sign in',
  'please log in',
  'authentication required',
  'cloudflare ray id',
  'cf-challenge',
  'just a moment',
  'checking your browser',
];

const isEmpty = !resultStr || resultStr.trim().length < 100;
const isBlocked = FAIL_PATTERNS.some(p => resultStr.toLowerCase().includes(p));

if (isEmpty || isBlocked) {
  // Output suggestion as system message
  const reason = isEmpty ? 'empty/minimal content' : 'blocked/auth-required';
  console.log(JSON.stringify({
    result: `WebFetch returned ${reason}. Try the web-interact skill which can use your real Chrome session (with existing logins) via CDP, or headless browser for JS-rendered pages. Run: node ~/.claude/skills/web-interact/scripts/extract.mjs "<URL>"`,
  }));
} else {
  // WebFetch succeeded — no action needed
  process.exit(0);
}
