export class Stats {
  constructor(maxLatencySamples) {
    this.maxLatencySamples = maxLatencySamples;
    this.overall = new Metric(maxLatencySamples);
    this.byEndpoint = new Map();
    this.slowest = [];
  }

  record(sample) {
    this.overall.record(sample);
    let metric = this.byEndpoint.get(sample.endpoint);
    if (!metric) {
      metric = new Metric(this.maxLatencySamples);
      this.byEndpoint.set(sample.endpoint, metric);
    }
    metric.record(sample);
    this.recordSlowSample(sample);
  }

  recordSlowSample(sample) {
    const item = {
      endpoint: sample.endpoint,
      path: sample.path,
      status: sample.status || sample.errorName || "ERR",
      latencyMs: round(sample.latencyMs),
    };
    if (this.slowest.length < 10) {
      this.slowest.push(item);
      this.slowest.sort((left, right) => right.latencyMs - left.latencyMs);
      return;
    }
    const last = this.slowest[this.slowest.length - 1];
    if (item.latencyMs > last.latencyMs) {
      this.slowest[this.slowest.length - 1] = item;
      this.slowest.sort((left, right) => right.latencyMs - left.latencyMs);
    }
  }

  toSummary(elapsedSeconds, context) {
    const endpoints = Array.from(this.byEndpoint.entries())
      .map(([name, metric]) => ({ name, ...metric.toSummary(elapsedSeconds) }))
      .sort((left, right) => right.requests - left.requests);

    return {
      ...context,
      elapsedSeconds: round(elapsedSeconds),
      overall: this.overall.toSummary(elapsedSeconds),
      endpoints,
      statusCounts: Object.fromEntries(this.overall.statusCounts),
      slowest: this.slowest,
    };
  }
}

class Metric {
  constructor(maxLatencySamples) {
    this.maxLatencySamples = maxLatencySamples;
    this.requests = 0;
    this.ok = 0;
    this.http4xx = 0;
    this.http5xx = 0;
    this.networkErrors = 0;
    this.bytes = 0;
    this.totalLatencyMs = 0;
    this.maxLatencyMs = 0;
    this.latencySamplesSeen = 0;
    this.latencies = [];
    this.totalTtftMs = 0;
    this.maxTtftMs = 0;
    this.ttftSamplesSeen = 0;
    this.ttfts = [];
    this.statusCounts = new Map();
  }

  record(sample) {
    this.requests += 1;
    this.bytes += sample.bytes || 0;
    this.totalLatencyMs += sample.latencyMs;
    this.maxLatencyMs = Math.max(this.maxLatencyMs, sample.latencyMs);
    this.recordLatency(sample.latencyMs);
    if (typeof sample.ttftMs === "number" && Number.isFinite(sample.ttftMs) && sample.ttftMs >= 0) {
      this.totalTtftMs += sample.ttftMs;
      this.maxTtftMs = Math.max(this.maxTtftMs, sample.ttftMs);
      this.recordTtft(sample.ttftMs);
    }

    const statusKey = sample.status > 0 ? String(sample.status) : `ERR:${sample.errorName || "network"}`;
    this.statusCounts.set(statusKey, (this.statusCounts.get(statusKey) || 0) + 1);

    if (sample.status >= 200 && sample.status < 400) {
      this.ok += 1;
    } else if (sample.status >= 500) {
      this.http5xx += 1;
    } else if (sample.status >= 400) {
      this.http4xx += 1;
    } else {
      this.networkErrors += 1;
    }
  }

  recordLatency(value) {
    this.latencySamplesSeen += 1;
    if (this.latencies.length < this.maxLatencySamples) {
      this.latencies.push(value);
      return;
    }
    const slot = Math.floor(Math.random() * this.latencySamplesSeen);
    if (slot < this.maxLatencySamples) {
      this.latencies[slot] = value;
    }
  }

  recordTtft(value) {
    this.ttftSamplesSeen += 1;
    if (this.ttfts.length < this.maxLatencySamples) {
      this.ttfts.push(value);
      return;
    }
    const slot = Math.floor(Math.random() * this.ttftSamplesSeen);
    if (slot < this.maxLatencySamples) this.ttfts[slot] = value;
  }

  toSummary(elapsedSeconds) {
    const sorted = [...this.latencies].sort((left, right) => left - right);
    const sortedTtft = [...this.ttfts].sort((left, right) => left - right);
    const requests = this.requests;
    const httpErrors = this.http4xx + this.http5xx;
    return {
      requests,
      rps: round(requests / elapsedSeconds),
      ok: this.ok,
      http4xx: this.http4xx,
      http5xx: this.http5xx,
      networkErrors: this.networkErrors,
      httpErrorRate: rate(httpErrors, requests),
      serverErrorRate: rate(this.http5xx + this.networkErrors, requests),
      avgMs: requests > 0 ? round(this.totalLatencyMs / requests) : 0,
      p50Ms: percentile(sorted, 50),
      p90Ms: percentile(sorted, 90),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      maxMs: round(this.maxLatencyMs),
      ttftSamples: this.ttftSamplesSeen,
      ttftAvgMs: this.ttftSamplesSeen > 0 ? round(this.totalTtftMs / this.ttftSamplesSeen) : 0,
      ttftP50Ms: percentile(sortedTtft, 50),
      ttftP95Ms: percentile(sortedTtft, 95),
      ttftP99Ms: percentile(sortedTtft, 99),
      ttftMaxMs: round(this.maxTtftMs),
      mbReceived: round(this.bytes / 1024 / 1024),
      sampledLatencies: sorted.length,
      latencySampled: this.latencySamplesSeen > sorted.length,
    };
  }
}

export function printSummary(summary) {
  console.log("\nOverall");
  console.log(formatTable([
    ["requests", "rps", "ok", "4xx", "5xx", "net err", "http err", "server err", "avg", "p50", "p90", "p95", "p99", "max", "TTFT p50", "TTFT p95", "MiB"],
    [
      summary.overall.requests,
      summary.overall.rps,
      summary.overall.ok,
      summary.overall.http4xx,
      summary.overall.http5xx,
      summary.overall.networkErrors,
      percent(summary.overall.httpErrorRate),
      percent(summary.overall.serverErrorRate),
      `${summary.overall.avgMs}ms`,
      `${summary.overall.p50Ms}ms`,
      `${summary.overall.p90Ms}ms`,
      `${summary.overall.p95Ms}ms`,
      `${summary.overall.p99Ms}ms`,
      `${summary.overall.maxMs}ms`,
      summary.overall.ttftSamples > 0 ? `${summary.overall.ttftP50Ms}ms` : "-",
      summary.overall.ttftSamples > 0 ? `${summary.overall.ttftP95Ms}ms` : "-",
      summary.overall.mbReceived,
    ],
  ]));

  console.log("\nBy endpoint");
  console.log(formatTable([
    ["endpoint", "requests", "rps", "ok", "4xx", "5xx", "net err", "p50", "p95", "p99", "max", "TTFT p50", "TTFT p95", "MiB"],
    ...summary.endpoints.map((item) => [
      item.name,
      item.requests,
      item.rps,
      item.ok,
      item.http4xx,
      item.http5xx,
      item.networkErrors,
      `${item.p50Ms}ms`,
      `${item.p95Ms}ms`,
      `${item.p99Ms}ms`,
      `${item.maxMs}ms`,
      item.ttftSamples > 0 ? `${item.ttftP50Ms}ms` : "-",
      item.ttftSamples > 0 ? `${item.ttftP95Ms}ms` : "-",
      item.mbReceived,
    ]),
  ]));

  console.log("\nStatus counts");
  console.log(Object.entries(summary.statusCounts).map(([status, count]) => `${status}:${count}`).join(" "));

  if (summary.slowest.length > 0) {
    console.log("\nSlowest samples");
    console.log(formatTable([
      ["latency", "status", "endpoint", "path"],
      ...summary.slowest.map((item) => [`${item.latencyMs}ms`, item.status, item.endpoint, item.path]),
    ]));
  }

  if (summary.overall.latencySampled) {
    console.log(`\nLatency percentiles used reservoir sampling (${summary.overall.sampledLatencies} samples).`);
  }
}

function formatTable(rows) {
  const widths = rows[0].map((_, columnIndex) =>
    Math.max(...rows.map((row) => String(row[columnIndex] ?? "").length))
  );
  return rows
    .map((row) =>
      row
        .map((cell, columnIndex) => String(cell ?? "").padEnd(widths[columnIndex]))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

export function violatesBudget(summary, config) {
  if (summary.overall.httpErrorRate > config.maxHttpErrorRate) {
    console.error(`HTTP error rate ${percent(summary.overall.httpErrorRate)} exceeded ${percent(config.maxHttpErrorRate)}.`);
    return true;
  }
  if (summary.overall.serverErrorRate > config.maxServerErrorRate) {
    console.error(`Server/network error rate ${percent(summary.overall.serverErrorRate)} exceeded ${percent(config.maxServerErrorRate)}.`);
    return true;
  }
  if (config.p95BudgetMs > 0 && summary.overall.p95Ms > config.p95BudgetMs) {
    console.error(`p95 ${summary.overall.p95Ms}ms exceeded ${config.p95BudgetMs}ms.`);
    return true;
  }
  if (
    config.p95TtftBudgetMs > 0 &&
    summary.overall.ttftSamples > 0 &&
    summary.overall.ttftP95Ms > config.p95TtftBudgetMs
  ) {
    console.error(`TTFT p95 ${summary.overall.ttftP95Ms}ms exceeded ${config.p95TtftBudgetMs}ms.`);
    return true;
  }
  return false;
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return round(sorted[index]);
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percent(value) {
  return `${round(value * 100)}%`;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
