#!/usr/bin/env node
/**
 * CWV lab harness (OpenSpec change f5-gps-mode-cwv-hardening, task 4.1).
 *
 * Measures LCP / CLS / INP for `/login` and `/map` against the PRODUCTION
 * build using system Chrome (playwright-core, `channel: 'chrome'` — no browser
 * download), a fixed 4x CPU throttle (CDP Emulation.setCPUThrottlingRate),
 * a fixed viewport, and the `web-vitals` library already shipped by
 * territory-frontend.
 *
 * Modes:
 *   default     gate against territory-frontend/performance-budgets.json
 *               exit 0 = all metrics within budget, exit 1 = violation
 *               (output names route, metric, limit and measured value)
 *   --print     print measurements without gating (exit 0 unless the harness
 *               itself fails; operational errors exit 2)
 *   BASE_URL=x  measure an already-running server instead of starting the
 *               production SSR server ourselves
 *
 * No-backend reference mode (design.md D3, user-approved): when BASE_URL is
 * not set we start `territory-frontend/dist/.../server/server.mjs` ourselves
 * with GATEWAY_URL pointed at a dead port, so every /api/v1 call gets a 502
 * from the SSR proxy. A dummy `territory_role` is seeded in localStorage so
 * `profileGuard` finds a UI token, and `AuthService.validateSession()` fails
 * open on the 502 (only 401 closes the session) — `/map` loads shell +
 * basemap without any backend. The server's logs are printed on failure and
 * the server is always killed.
 *
 * Usage (from territory-frontend/):  pnpm run cwv:check [-- --print]
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FRONTEND_DIR = path.join(REPO_ROOT, 'territory-frontend');
const DIST_SERVER = path.join(FRONTEND_DIR, 'dist', 'territory-frontend', 'server', 'server.mjs');
const BUDGETS_FILE = path.join(FRONTEND_DIR, 'performance-budgets.json');
const WEB_VITALS_FILE = path.join(FRONTEND_DIR, 'node_modules', 'web-vitals', 'dist', 'web-vitals.umd.cjs');

/** Fixed lab profile — do not vary between runs (determinism). */
const VIEWPORT = { width: 1366, height: 768 };
const CPU_THROTTLE_RATE = 4;
/** Nothing listens here: the SSR proxy answers 502 -> validateSession fails open. */
const DEAD_GATEWAY = 'http://127.0.0.1:9';
const SERVER_READY_TIMEOUT_MS = 60_000;
const NAV_TIMEOUT_MS = 45_000;
const METRIC_WAIT_MS = 15_000;
const METRICS = ['lcpMs', 'inpMs', 'cls'];

// playwright-core must resolve from territory-frontend/node_modules — never
// from the repo root (no package.json / node_modules may exist there).
const requireFromFrontend = createRequire(path.join(FRONTEND_DIR, 'package.json'));
const { chromium } = requireFromFrontend('playwright-core');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  const error = new Error(message);
  error.operational = true;
  throw error;
}

function parseArgs(argv) {
  return { printOnly: argv.includes('--print') };
}

function loadBudgets() {
  if (!existsSync(BUDGETS_FILE)) {
    fail(`Budgets file not found: ${BUDGETS_FILE}`);
  }
  let budgets;
  try {
    budgets = JSON.parse(readFileSync(BUDGETS_FILE, 'utf8'));
  } catch (error) {
    fail(`Budgets file is not valid JSON: ${BUDGETS_FILE} (${String(error)})`);
  }
  for (const route of ['/login', '/map']) {
    const entry = budgets.routes?.[route];
    if (!entry || METRICS.some((m) => typeof entry[m] !== 'number')) {
      fail(`Budgets file must define numeric ${METRICS.join('/')} for "${route}"`);
    }
  }
  return budgets;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Production SSR server management (skipped when BASE_URL is provided). */
function createServerRunner() {
  const logs = [];
  const pushLog = (chunk, stream) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim() === '') continue;
      logs.push(`[${stream}] ${line}`);
      if (logs.length > 200) logs.shift();
    }
  };

  let proc = null;
  let baseUrl = null;

  return {
    get logs() {
      return logs;
    },
    get baseUrl() {
      return baseUrl;
    },
    async start() {
      if (!existsSync(DIST_SERVER)) {
        fail(`Production build not found at ${DIST_SERVER} — run \`pnpm run build\` first (or set BASE_URL).`);
      }
      const port = await findFreePort();
      proc = spawn(process.execPath, [DIST_SERVER], {
        cwd: FRONTEND_DIR,
        env: {
          ...process.env,
          PORT: String(port),
          GATEWAY_URL: DEAD_GATEWAY,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.stdout.on('data', (chunk) => pushLog(chunk, 'out'));
      proc.stderr.on('data', (chunk) => pushLog(chunk, 'err'));

      let exited = null;
      proc.on('exit', (code, signal) => {
        exited = `server exited early (code=${code}, signal=${signal})`;
      });

      baseUrl = `http://127.0.0.1:${port}`;
      const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
      // Any HTTP response means the server is listening.
      while (Date.now() < deadline) {
        if (exited) {
          fail(`SSR server failed to start: ${exited}`);
        }
        try {
          const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
          if (response.status > 0) return;
        } catch {
          // not listening yet
        }
        await delay(250);
      }
      fail(`SSR server did not become ready within ${SERVER_READY_TIMEOUT_MS / 1000}s`);
    },
    async stop() {
      if (!proc || proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      const deadline = Date.now() + 3000;
      while (proc.exitCode === null && Date.now() < deadline) await delay(100);
      if (proc.exitCode === null) proc.kill('SIGKILL');
    },
  };
}

/** Injects web-vitals (UMD from territory-frontend/node_modules) + seeds the UI role. */
async function preparePage(page) {
  const webVitalsSource = readFileSync(WEB_VITALS_FILE, 'utf8');
  await page.addInitScript(webVitalsSource);
  await page.addInitScript(() => {
    // profileGuard requires a UI role token; the backend session probe fails
    // open on the 502 that the dead gateway produces (see design.md D3).
    try {
      localStorage.setItem('territory_role', 'encargado');
    } catch {
      // storage may be unavailable; the guard then redirects and the flow fails loudly
    }
    window.__cwv = { lcpMs: null, inpMs: null, cls: null };
    const record = (key) => (metric) => {
      window.__cwv[key] = { value: metric.value, rating: metric.rating, id: metric.id };
    };
    // reportAllChanges keeps the latest value in __cwv at all times; the
    // harness additionally waits for input/idle so LCP and INP finalize.
    window.webVitals.onLCP(record('lcpMs'), { reportAllChanges: true });
    window.webVitals.onCLS(record('cls'), { reportAllChanges: true });
    window.webVitals.onINP(record('inpMs'), { reportAllChanges: true });
  });
}

async function applyLabConditions(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
}

async function readMetrics(page) {
  // INP only reports after an interaction settles (rIC / page hide). Wait for
  // it, then give CLS session windows a beat to report late shifts.
  try {
    await page.waitForFunction(() => window.__cwv && window.__cwv.inpMs !== null, {
      timeout: METRIC_WAIT_MS,
    });
  } catch {
    // leave inpMs null; the gate reports it as missing data
  }
  await page.waitForFunction(() => window.__cwv && window.__cwv.lcpMs !== null, {
    timeout: METRIC_WAIT_MS,
  }).catch(() => undefined);
  await delay(1200);
  const raw = await page.evaluate(() => window.__cwv);
  return {
    lcpMs: raw.lcpMs ? raw.lcpMs.value : null,
    inpMs: raw.inpMs ? raw.inpMs.value : null,
    cls: raw.cls ? raw.cls.value : null,
  };
}

/**
 * Waits until web-vitals has observed at least one LCP candidate and the value
 * has stopped changing. Interacting before the page settles finalizes LCP
 * early (web-vitals disconnects its observer on first input), which would
 * under-measure cold-load LCP; a stable value means the initial paints are in.
 */
async function waitForLcpStable(page, { stableMs = 1200, timeoutMs = 12_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  let lastChangeAt = Date.now();
  while (Date.now() < deadline) {
    // metric.id is constant per page; the VALUE is what changes per report.
    const currentValue = await page.evaluate(() => window.__cwv?.lcpMs?.value ?? null);
    if (currentValue !== lastValue) {
      lastValue = currentValue;
      lastChangeAt = Date.now();
    } else if (lastValue !== null && Date.now() - lastChangeAt >= stableMs) {
      return;
    }
    await delay(200);
  }
}

async function flowLogin(page, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector('#telefono', { state: 'visible', timeout: NAV_TIMEOUT_MS });
  // Under 4x CPU throttle the element can be visible before the first LCP
  // entry arrives; interacting first finalizes LCP with no entry reported
  // (web-vitals disconnects its observer on first input). Wait for the paint
  // to be observed, then let hydration settle so INP reflects interactions on
  // a loaded page instead of the hydration burst.
  await waitForLcpStable(page);
  await delay(700);
  await page.locator('#telefono').pressSequentially('912345678', { delay: 25 });
  await page.locator('.btn-primary').click();
  // Submit hits the dead gateway (502, suppressed toast, no redirect); let it settle.
  await delay(1500);
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== '/login') {
    fail(`/login flow navigated away unexpectedly to ${currentPath}`);
  }
}

async function flowMap(page, baseUrl) {
  await page.goto(`${baseUrl}/map`, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
  // The canvas only exists once profileGuard passed and MapPage booted —
  // a redirect back to /login means the no-backend mode is broken.
  await page.waitForSelector('#map canvas', { timeout: NAV_TIMEOUT_MS });
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== '/map') {
    fail(`no-backend reference mode broken: /map redirected to ${currentPath}`);
  }
  // The loading overlay must clear even though metadata/tiles fail with 502.
  await page.waitForSelector('.loading-overlay', { state: 'detached', timeout: NAV_TIMEOUT_MS });

  const gl = await page.evaluate(() => {
    const canvas = document.querySelector('#map canvas');
    if (!canvas) return { ok: false, reason: 'canvas not found' };
    let context = null;
    try {
      context = canvas.getContext('webgl2');
    } catch (error) {
      return { ok: false, reason: String(error) };
    }
    return { ok: Boolean(context), width: canvas.width, height: canvas.height, reason: context ? null : 'WebGL2 context is null (headless GPU flags?)' };
  });
  if (!gl.ok) {
    fail(`MapLibre canvas did not initialise without WebGL: ${gl.reason ?? 'unknown reason'}`);
  }
  if (!gl.width || !gl.height) {
    fail(`MapLibre canvas has zero size (${gl.width}x${gl.height})`);
  }

  // Let the style load, first tiles settle, and the first LCP candidate be
  // observed before interacting (same rationale as the /login flow).
  await waitForLcpStable(page);
  await delay(1000);

  const box = await page.locator('#map canvas').boundingBox();
  if (!box) fail('#map canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Pan (drag)
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 220, cy - 140, { steps: 12 });
  await page.mouse.move(cx - 60, cy - 20, { steps: 8 });
  await page.mouse.up();
  await delay(300);

  // Zoom (wheel)
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -480);
  await delay(400);
  await page.mouse.wheel(0, 480);
  await delay(400);

  // Toggle the satellite/layers control twice (exercises INP on a control)
  const toggle = page.locator('[aria-label="Vista satélite"]');
  await toggle.click();
  await delay(500);
  const restore = page.locator('[aria-label="Vista normal"]');
  if ((await restore.count()) > 0) {
    await restore.click();
    await delay(300);
  }
}

const ROUTES = [
  { route: '/login', flow: flowLogin },
  { route: '/map', flow: flowMap },
];

async function measureRoute(browser, baseUrl, routeDef) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  try {
    await applyLabConditions(page);
    await preparePage(page);
    await routeDef.flow(page, baseUrl);
    const metrics = await readMetrics(page);
    return { route: routeDef.route, metrics, error: null };
  } catch (error) {
    return { route: routeDef.route, metrics: { lcpMs: null, inpMs: null, cls: null }, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await context.close().catch(() => undefined);
  }
}

const METRIC_LABELS = { lcpMs: 'LCP', inpMs: 'INP', cls: 'CLS' };

function formatMetric(metric, value) {
  if (value === null) return 'n/a';
  return metric === 'cls' ? value.toFixed(3) : `${Math.round(value)} ms`;
}

function buildTable(results, budgets) {
  const header = ['Route', 'Metric', 'Budget', 'Measured', 'Result'];
  const rows = [header];
  const violations = [];
  for (const result of results) {
    if (result.error) {
      rows.push([result.route, '(flow)', 'n/a', 'ERROR', 'FAIL']);
      violations.push({ route: result.route, metric: '(flow)', budget: null, measured: result.error, ok: false });
      continue;
    }
    for (const metric of METRICS) {
      const limit = budgets.routes[result.route][metric];
      const measured = result.metrics[metric];
      const ok = measured !== null && measured <= limit;
      rows.push([
        result.route,
        METRIC_LABELS[metric],
        formatMetric(metric, limit),
        formatMetric(metric, measured),
        ok ? 'PASS' : 'FAIL',
      ]);
      if (!ok) {
        violations.push({ route: result.route, metric: METRIC_LABELS[metric], budget: limit, measured, ok, unit: metric });
      }
    }
  }
  const widths = header.map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  const lines = rows.map((row) => row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd());
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  lines.splice(1, 0, separator);
  return { text: lines.join('\n'), violations };
}

async function main() {
  const { printOnly } = parseArgs(process.argv.slice(2));
  const budgets = loadBudgets();
  const externalBaseUrl = process.env['BASE_URL']?.trim() || null;
  const server = externalBaseUrl ? null : createServerRunner();
  const baseUrl = externalBaseUrl ?? null;

  let browser = null;
  let exitCode = 0;
  try {
    let target = baseUrl;
    if (!server) {
      process.stdout.write('[cwv] using BASE_URL override — not starting a local server\n');
    } else {
      await server.start();
      target = server.baseUrl;
      process.stdout.write(`[cwv] production SSR server ready at ${target} (no-backend reference mode, GATEWAY_URL=${DEAD_GATEWAY})\n`);
    }

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: [
        // Headless CI boxes have no GPU: allow SwiftShader WebGL fallback and
        // keep the GPU blocklist off so MapLibre's WebGL2 context initialises.
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
      ],
    });
    process.stdout.write(`[cwv] ${browser.version()} | CPU throttle ${CPU_THROTTLE_RATE}x | viewport ${VIEWPORT.width}x${VIEWPORT.height}\n`);

    const results = [];
    for (const routeDef of ROUTES) {
      process.stdout.write(`[cwv] measuring ${routeDef.route} ...\n`);
      const result = await measureRoute(browser, target, routeDef);
      results.push(result);
      if (result.error) {
        process.stdout.write(`[cwv] ${routeDef.route} flow failed: ${result.error}\n`);
      } else {
        process.stdout.write(
          `[cwv] ${routeDef.route}: LCP ${formatMetric('lcpMs', result.metrics.lcpMs)}, INP ${formatMetric('inpMs', result.metrics.inpMs)}, CLS ${formatMetric('cls', result.metrics.cls)}\n`,
        );
      }
    }

    const { text, violations } = buildTable(results, budgets);
    process.stdout.write(`\n${text}\n`);

    if (printOnly) {
      process.stdout.write('\n--print mode: measurements only, no gating.\n');
    } else if (violations.length === 0) {
      process.stdout.write('\nCWV budget gate: PASS (all metrics within budget).\n');
    } else {
      process.stdout.write('\nCWV budget gate: FAIL\n');
      for (const v of violations) {
        if (v.budget === null) {
          process.stdout.write(`  - ${v.route} ${v.metric}: ${v.measured}\n`);
        } else if (v.measured === null) {
          process.stdout.write(`  - route=${v.route} metric=${v.metric} limit=${v.budget} measured=NO_DATA (metric never reported)\n`);
        } else {
          process.stdout.write(
            `  - route=${v.route} metric=${v.metric} limit=${formatMetric(v.unit, v.budget)} measured=${formatMetric(v.unit, v.measured)}\n`,
          );
        }
      }
      exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n[cwv] harness error: ${message}\n`);
    if (server && server.logs.length > 0) {
      process.stderr.write('[cwv] --- server log (last 200 lines) ---\n');
      for (const line of server.logs) process.stderr.write(`${line}\n`);
      process.stderr.write('[cwv] --- end server log ---\n');
    }
    exitCode = 2;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await server.stop();
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

await main();
