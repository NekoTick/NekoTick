import assert from "node:assert/strict";
import test from "node:test";

import { createScenarioRuntime } from "./perf-local-api-load-scenarios.mjs";
import { Stats } from "./perf-local-api-load-stats.mjs";

function createRuntime(chatStream) {
  return createScenarioRuntime({
    adminKey: "",
    adminUsername: "admin",
    baseUrl: "http://127.0.0.1:8787",
    chatModelId: "perf-model-000001",
    chatStream,
    ipCount: 1000,
    rotateIps: false,
    sessionUsers: 1,
    users: 10,
  }, ["nts_test"], "smoke", 10_000_000);
}

test("performance scenarios mark streaming chat for TTFT measurement", () => {
  const runtime = createRuntime(true);
  const [endpoint] = runtime.buildScenario("chat");
  const request = runtime.buildRequest(endpoint, 0, 0);

  assert.equal(endpoint.measureTtft, true);
  assert.equal(request.measureTtft, true);
  assert.equal(request.headers.Accept, "text/event-stream");
  assert.equal(JSON.parse(request.body).stream, true);
});

test("performance scenarios include authenticated web search requests", () => {
  const runtime = createRuntime(false);
  const [endpoint] = runtime.buildScenario("web-search");
  const request = runtime.buildRequest(endpoint, 0, 0);

  assert.equal(request.path, "/v1/web-search");
  assert.equal(request.method, "POST");
  assert.deepEqual(JSON.parse(request.body), {
    action: "search",
    query: "local performance test query",
  });
});

test("performance statistics report TTFT percentiles separately from total latency", () => {
  const stats = new Stats(1000);
  stats.record({ endpoint: "chat", path: "/v1/chat/completions", status: 200, bytes: 10, latencyMs: 500, ttftMs: 100 });
  stats.record({ endpoint: "chat", path: "/v1/chat/completions", status: 200, bytes: 20, latencyMs: 900, ttftMs: 200 });
  const summary = stats.toSummary(1, {});

  assert.equal(summary.overall.p95Ms, 900);
  assert.equal(summary.overall.ttftSamples, 2);
  assert.equal(summary.overall.ttftP50Ms, 100);
  assert.equal(summary.overall.ttftP95Ms, 200);
});
