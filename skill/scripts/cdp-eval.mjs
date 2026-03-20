#!/usr/bin/env node
// cdp-eval.mjs — minimal CDP WebSocket helper for evaluating JS in a Chrome tab
// Usage: node cdp-eval.mjs <webSocketDebuggerUrl> <jsExpression> [waitMs]

const [,, wsUrl, expression, waitMsArg] = process.argv;
const waitMs = parseInt(waitMsArg ?? '3000', 10);

if (!wsUrl || !expression) {
  console.error('Usage: node cdp-eval.mjs <webSocketDebuggerUrl> <jsExpression> [waitMs]');
  process.exit(1);
}

const TIMEOUT_MS = 20_000;
let msgId = 0;

function send(ws, method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return id;
}

async function main() {
  const ws = new WebSocket(wsUrl);

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout: no response within 20 seconds'));
    }, TIMEOUT_MS);

    ws.addEventListener('error', (ev) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error: ${ev.message ?? 'connection failed'}`));
    });

    ws.addEventListener('open', () => {
      send(ws, 'Page.enable');
    });

    let evalId = null;
    let evalScheduled = false;

    const scheduleEval = () => {
      if (evalScheduled) return;
      evalScheduled = true;
      const doEval = () => {
        evalId = send(ws, 'Runtime.evaluate', { expression, returnByValue: true });
      };
      if (waitMs > 0) setTimeout(doEval, waitMs); else doEval();
    };

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      // Page.enable ack — set fallback in case loadEventFired never fires
      if (msg.id === 1) {
        setTimeout(scheduleEval, waitMs + 1000).unref();
      }

      // Page.loadEventFired — preferred trigger
      if (msg.method === 'Page.loadEventFired') {
        scheduleEval();
      }

      // Runtime.evaluate response
      if (evalId !== null && msg.id === evalId) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) {
          reject(new Error(`CDP error: ${msg.error.message}`));
        } else if (msg.result?.result?.subtype === 'error') {
          reject(new Error(`Eval error: ${msg.result.result.description}`));
        } else {
          resolve(msg.result?.result?.value);
        }
      }
    });
  });

  // Output strings directly (no JSON wrapping) for seamless piping
  if (typeof result === 'string') {
    console.log(result);
  } else {
    console.log(result === undefined ? '' : JSON.stringify(result, null, 2));
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
