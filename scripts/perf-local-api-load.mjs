#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { createScenarioRuntime, perfSessionToken } from "./perf-local-api-load-scenarios.mjs";
import { Stats, printSummary, violatesBudget } from "./perf-local-api-load-stats.mjs";

const LOAD_PROFILES = {
  smoke: { durationSeconds: 15, concurrency: 10, warmupSeconds: 2, sessionUsers: 20, users: 200 },
  medium: { durationSeconds: 60, concurrency: 50, warmupSeconds: 5, sessionUsers: 100, users: 5_000 },
  heavy: { durationSeconds: 300, concurrency: 200, warmupSeconds: 10, sessionUsers: 500, users: 20_000 },
};

const USER_ID_START = readIntegerEnv("PERF_USER_ID_START", 10_000_000, 1, Number.MAX_SAFE_INTEGER - 1);
const profileName = String(process.env.PERF_PROFILE || "smoke").trim().toLowerCase();
const profile = LOAD_PROFILES[profileName] || LOAD_PROFILES.smoke;
const selectedProfileName = LOAD_PROFILES[profileName] ? profileName : "smoke";

const config = {
  baseUrl: normalizeBaseUrl(process.env.PERF_BASE_URL || "http://127.0.0.1:8787"),
  scenario: String(process.env.PERF_SCENARIO || (process.env.PERF_ADMIN_KEY ? "mixed" : "public")).trim().toLowerCase(),
  durationSeconds: readIntegerEnv("PERF_DURATION_SECONDS", profile.durationSeconds, 1, 24 * 3600),
  concurrency: readIntegerEnv("PERF_CONCURRENCY", profile.concurrency, 1, 5000),
  warmupSeconds: readIntegerEnv("PERF_WARMUP_SECONDS", profile.warmupSeconds, 0, 3600),
  timeoutMs: readIntegerEnv("PERF_TIMEOUT_MS", 15_000, 100, 120_000),
  thinkMs: readIntegerEnv("PERF_THINK_MS", 0, 0, 60_000),
  rotateIps: readBooleanEnv("PERF_ROTATE_IPS", true),
  ipCount: readIntegerEnv("PERF_IP_COUNT", Math.max(profile.concurrency * 20, 1000), 1, 187_500),
  adminKey: String(process.env.PERF_ADMIN_KEY || "").trim(),
  adminUsername: String(process.env.PERF_ADMIN_USERNAME || "admin").trim() || "admin",
  sessionUsers: readIntegerEnv("PERF_SESSION_USERS", profile.sessionUsers, 0, 50_000),
  users: readIntegerEnv("PERF_USERS", profile.users, 1, 2_000_000),
  maxLatencySamples: readIntegerEnv("PERF_MAX_LATENCY_SAMPLES", 500_000, 1000, 10_000_000),
  failOnBudget: readBooleanEnv("PERF_FAIL_ON_BUDGET", false),
  maxHttpErrorRate: readNumberEnv("PERF_MAX_HTTP_ERROR_RATE", 0.05, 0, 1),
  maxServerErrorRate: readNumberEnv("PERF_MAX_SERVER_ERROR_RATE", 0.01, 0, 1),
  p95BudgetMs: readIntegerEnv("PERF_P95_BUDGET_MS", 0, 0, 600_000),
  p95TtftBudgetMs: readIntegerEnv("PERF_P95_TTFT_BUDGET_MS", 0, 0, 600_000),
  chatModelId: String(process.env.PERF_CHAT_MODEL_ID || "perf-model-000001").trim() || "perf-model-000001",
  chatStream: readBooleanEnv("PERF_CHAT_STREAM", false),
  json: readBooleanEnv("PERF_JSON", false),
};

const sessionTokens = Array.from(
  { length: Math.max(0, config.sessionUsers) },
  (_, index) => perfSessionToken(index + 1)
);
const scenarioRuntime = createScenarioRuntime(config, sessionTokens, selectedProfileName, USER_ID_START);

let endpoints = [];
let interrupted = false;
process.on("SIGINT", () => {
  interrupted = true;
  console.error("\nStopping after in-flight requests finish...");
});

async function main() {
  assertLocalBaseUrl(config.baseUrl);
  endpoints = scenarioRuntime.buildScenario(config.scenario);
  scenarioRuntime.validateScenario(endpoints);

  if (!config.json) {
    console.log(`Local API load test: profile=${selectedProfileName}, scenario=${config.scenario}`);
    console.log(`Target: ${config.baseUrl}`);
    console.log(
      `Concurrency=${config.concurrency}, duration=${config.durationSeconds}s, warmup=${config.warmupSeconds}s, timeout=${config.timeoutMs}ms, rotateIps=${config.rotateIps ? "yes" : "no"}`
    );
  }

  if (config.warmupSeconds > 0) {
    if (!config.json) console.log(`Warming up for ${config.warmupSeconds}s...`);
    await runPhase({ durationSeconds: config.warmupSeconds, collect: false, stats: null });
  }

  const stats = new Stats(config.maxLatencySamples);
  const measuredStartedAt = performance.now();
  await runPhase({ durationSeconds: config.durationSeconds, collect: true, stats });
  const elapsedSeconds = Math.max(0.001, (performance.now() - measuredStartedAt) / 1000);
  const summary = stats.toSummary(elapsedSeconds, {
    profile: selectedProfileName,
    scenario: config.scenario,
    baseUrl: config.baseUrl,
    concurrency: config.concurrency,
    durationSeconds: config.durationSeconds,
    warmupSeconds: config.warmupSeconds,
    rotateIps: config.rotateIps,
    interrupted,
  });

  if (config.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
  }

  if (config.failOnBudget && violatesBudget(summary, config)) {
    process.exitCode = 1;
  }
}

async function runPhase({ durationSeconds, collect, stats }) {
  const deadline = performance.now() + durationSeconds * 1000;
  const workers = Array.from({ length: config.concurrency }, (_, workerId) =>
    runWorker({ workerId, deadline, collect, stats })
  );
  await Promise.all(workers);
}

async function runWorker({ workerId, deadline, collect, stats }) {
  let requestIndex = 0;
  while (!interrupted && performance.now() < deadline) {
    const endpoint = scenarioRuntime.pickEndpoint(endpoints);
    const request = scenarioRuntime.buildRequest(endpoint, workerId, requestIndex);
    const startedAt = performance.now();
    let status = 0;
    let bytes = 0;
    let ttftMs = null;
    let errorName = "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      scenarioRuntime.maybeUpdateSessionToken(request.sessionIndex, response.headers.get("x-app-session-token"));
      status = response.status;
      if (request.measureTtft && response.body) {
        const reader = response.body.getReader();
        let firstChunkSeen = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!firstChunkSeen && value.byteLength > 0) {
            firstChunkSeen = true;
            ttftMs = performance.now() - startedAt;
          }
          bytes += value.byteLength;
        }
      } else {
        const body = await response.arrayBuffer();
        bytes = body.byteLength;
      }
    } catch (error) {
      errorName = formatFetchError(error);
    } finally {
      clearTimeout(timeout);
    }

    if (collect && stats) {
      stats.record({
        endpoint: endpoint.name,
        path: request.path,
        status,
        bytes,
        latencyMs: performance.now() - startedAt,
        ttftMs,
        errorName,
      });
    }

    requestIndex += 1;
    if (config.thinkMs > 0) {
      await sleep(config.thinkMs);
    }
  }
}

function formatFetchError(error) {
  if (!(error instanceof Error)) return String(error).slice(0, 160);
  const cause = error.cause instanceof Error
    ? ` cause=${error.cause.message}`
    : error.cause
      ? ` cause=${String(error.cause)}`
      : "";
  return `${error.name || "Error"}:${error.message || "fetch failed"}${cause}`.slice(0, 160);
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function assertLocalBaseUrl(value) {
  if (readBooleanEnv("PERF_ALLOW_REMOTE", false)) return;
  const url = new URL(value);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!localHosts.has(url.hostname)) {
    throw new Error(`Refusing to load test non-local URL ${value}. Set PERF_ALLOW_REMOTE=1 to override.`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readIntegerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function readNumberEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readBooleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !/^(0|false|no|off)$/i.test(raw.trim());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
