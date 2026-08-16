import { createHash } from "node:crypto";

export function perfSessionToken(index) {
  return `nts_${sha256Hex(`vlaina-perf-session-${index}`)}`;
}

export function createScenarioRuntime(config, sessionTokens, selectedProfileName, userIdStart) {
  function buildScenario(name) {
    const scenarios = {
      public: publicEndpoints(),
      "public-models": publicEndpoints(),
      "managed-client": managedClientEndpoints(),
      models: [endpoint("GET /v1/models", () => "/v1/models", 100)],
      session: sessionEndpoints(false),
      "session-budget": sessionEndpoints(true),
      budget: budgetEndpoints(),
      chat: chatEndpoints(),
      "web-search": webSearchEndpoints(),
      analytics: adminAnalyticsEndpoints(),
      "analytics-ranges": adminAnalyticsEndpoints(),
      "analytics-page": adminAnalyticsPageEndpoints(),
      "admin-open": adminOpenEndpoints(),
      "admin-models": adminModelEndpoints(),
      "admin-users": adminUserEndpoints(),
      "admin-logs": adminLogEndpoints(),
      "admin-tables": adminTableEndpoints(),
      admin: [...adminAnalyticsEndpoints(), ...adminTableEndpoints()],
      "admin-heavy": [...weighted(adminAnalyticsEndpoints(), 2), ...adminTableEndpoints()],
      "mixed-open": [...weighted(publicEndpoints(), 2), ...budgetEndpoints(), ...adminAnalyticsPageEndpoints(), ...adminOpenEndpoints()],
      "mixed-open-client": [...weighted(managedClientEndpoints(), 2), ...budgetEndpoints(), ...adminAnalyticsPageEndpoints(), ...adminOpenEndpoints()],
      "mixed-chat": [...weighted(managedClientEndpoints(), 2), ...chatEndpoints(), ...budgetEndpoints()],
      mixed: [...weighted(publicEndpoints(), 2), ...budgetEndpoints(), ...adminAnalyticsEndpoints(), ...adminTableEndpoints()],
    };
    return scenarios[name] || scenarios.mixed;
  }

  function validateScenario(items) {
    if (!items.length) {
      throw new Error("No endpoints selected for scenario.");
    }
    const needsAdmin = items.some((item) => item.admin);
    if (needsAdmin && !config.adminKey) {
      throw new Error("This scenario includes admin endpoints. Set PERF_ADMIN_KEY to the local ADMIN_API_KEY.");
    }
    const needsSession = items.some((item) => item.session);
    if (needsSession && config.sessionUsers <= 0) {
      throw new Error("This scenario includes authenticated endpoints. Seed sessions first or set PERF_SESSION_USERS > 0.");
    }
  }

  function buildRequest(endpointConfig, workerId, requestIndex) {
    const path = endpointConfig.pathFactory();
    const method = endpointConfig.method || "GET";
    const sessionIndex = endpointConfig.session && config.sessionUsers > 0
      ? (workerId + requestIndex) % config.sessionUsers
      : null;
    const headers = {
      Accept: endpointConfig.accept || "application/json",
      "User-Agent": `vlaina-local-api-load/${selectedProfileName}`,
      "CF-Connecting-IP": ipFor(workerId, requestIndex),
    };

    if (endpointConfig.admin) {
      headers.Authorization = `Bearer ${config.adminKey}`;
      headers["x-admin-username"] = config.adminUsername;
    } else if (endpointConfig.session) {
      headers.Authorization = `Bearer ${sessionTokens[sessionIndex] || perfSessionToken(sessionIndex + 1)}`;
    }

    let body;
    if (endpointConfig.bodyFactory) {
      body = JSON.stringify(endpointConfig.bodyFactory({ workerId, requestIndex, sessionIndex }));
      headers["Content-Type"] = "application/json";
    }

    return {
      path,
      method,
      headers,
      body,
      measureTtft: endpointConfig.measureTtft,
      sessionIndex,
      url: new URL(path, `${config.baseUrl}/`).toString(),
    };
  }

  function maybeUpdateSessionToken(sessionIndex, token) {
    if (sessionIndex === null || sessionIndex === undefined || !isValidSessionToken(token)) {
      return;
    }
    sessionTokens[sessionIndex] = token;
  }

  function randomPerfUserId() {
    return userIdStart + Math.floor(Math.random() * config.users);
  }

  function ipFor(workerId, requestIndex) {
    if (!config.rotateIps) return "10.222.0.1";
    const slot = Math.abs((workerId * 1_000_003 + requestIndex * 97) % config.ipCount);
    const second = 222 + Math.floor(slot / 62_500);
    const remainder = slot % 62_500;
    const third = Math.floor(remainder / 250);
    const fourth = (remainder % 250) + 1;
    return `10.${second}.${third}.${fourth}`;
  }

  function chatEndpoints() {
    return [
      endpoint("POST /v1/chat/completions", () => "/v1/chat/completions", 100, {
        session: true,
        method: "POST",
        accept: config.chatStream ? "text/event-stream" : "application/json",
        measureTtft: config.chatStream,
        bodyFactory: () => ({
          model: config.chatModelId,
          stream: config.chatStream,
          messages: [{ role: "user", content: "Return a short local performance test response." }],
        }),
      }),
    ];
  }

  function webSearchEndpoints() {
    return [
      endpoint("POST /v1/web-search", () => "/v1/web-search", 100, {
        session: true,
        method: "POST",
        bodyFactory: () => ({
          action: "search",
          query: "local performance test query",
        }),
      }),
    ];
  }

  function adminAnalyticsEndpoints() {
    return [
      endpoint("GET /admin/analytics", () => `/admin/analytics?range=${randomRange()}`, 28, { admin: true }),
      endpoint("GET /admin/analytics/overview", () => `/admin/analytics/overview?range=${randomRange()}`, 24, { admin: true }),
      endpoint("GET /admin/analytics/top-users", () => `/admin/analytics/top-users?range=${randomRange()}`, 12, { admin: true }),
      endpoint("GET /admin/analytics/top-models", () => `/admin/analytics/top-models?range=${randomRange()}`, 12, { admin: true }),
      endpoint("GET /admin/analytics/users-summary", () => `/admin/analytics/users-summary?range=${randomRange()}&kind=${randomUserSummaryKind()}&limit=100`, 14, { admin: true }),
      endpoint("GET /admin/analytics/users/:id", () => `/admin/analytics/users/${randomPerfUserId()}?range=${randomRange()}`, 10, { admin: true }),
    ];
  }

  function adminAnalyticsPageEndpoints() {
    return [
      endpoint("GET /admin/analytics", () => `/admin/analytics?range=${randomRange()}`, 72, { admin: true }),
      endpoint("GET /admin/analytics/users-summary", () => `/admin/analytics/users-summary?range=${randomRange()}&kind=${randomUserSummaryKind()}&limit=100`, 20, { admin: true }),
      endpoint("GET /admin/analytics/users/:id", () => `/admin/analytics/users/${randomPerfUserId()}?range=${randomRange()}`, 8, { admin: true }),
    ];
  }

  return {
    buildRequest,
    buildScenario,
    maybeUpdateSessionToken,
    pickEndpoint,
    validateScenario,
  };
}

function publicEndpoints() {
  return [
    endpoint("GET /v1/models", () => "/v1/models", 85),
    endpoint("GET /v1/models/version", () => "/v1/models/version", 15),
  ];
}

function managedClientEndpoints() {
  return [
    endpoint("GET /v1/models/version", () => "/v1/models/version", 95),
    endpoint("GET /v1/models cached refresh", () => "/v1/models", 5),
  ];
}

function budgetEndpoints() {
  return [endpoint("GET /v1/budget", () => "/v1/budget", 100, { session: true })];
}

function sessionEndpoints(includeBudget) {
  const suffix = includeBudget ? "?include_budget=1" : "";
  return [endpoint("GET /auth/session", () => `/auth/session${suffix}`, 100, { session: true })];
}

function adminTableEndpoints() {
  return [
    endpoint("GET /admin/users", () => `/admin/users?page=${randomPage(30)}&limit=200`, 24, { admin: true }),
    endpoint("GET /admin/users low", () => `/admin/users?page=${randomPage(10)}&limit=200&pointsFilter=low`, 8, { admin: true }),
    endpoint("GET /admin/logs all", () => `/admin/logs?page=${randomPage(40)}&limit=200&status=all`, 24, { admin: true }),
    endpoint("GET /admin/logs rejected", () => `/admin/logs?page=${randomPage(12)}&limit=200&status=rejected`, 8, { admin: true }),
    endpoint("GET /admin/models", () => `/admin/models?page=${randomPage(20)}&limit=500`, 20, { admin: true }),
    endpoint("GET /admin/channels", () => "/admin/channels", 8, { admin: true }),
    endpoint("GET /admin/system-health", () => "/admin/system-health", 8, { admin: true }),
  ];
}

function adminOpenEndpoints() {
  return [
    endpoint("GET /admin/users first page", () => "/admin/users?page=1&limit=100", 24, { admin: true }),
    endpoint("GET /admin/logs first page", () => "/admin/logs?page=1&limit=50&status=all&diagnosticOnly=false", 24, { admin: true }),
    endpoint("GET /admin/models first page", () => "/admin/models?page=1&limit=500", 20, { admin: true }),
    endpoint("GET /admin/models second page", () => "/admin/models?page=2&limit=500", 10, { admin: true }),
    endpoint("GET /admin/channels", () => "/admin/channels", 12, { admin: true }),
    endpoint("GET /admin/system-health", () => "/admin/system-health", 10, { admin: true }),
  ];
}

function adminModelEndpoints() {
  return [
    endpoint("GET /admin/models page 1", () => "/admin/models?page=1&limit=500", 60, { admin: true }),
    endpoint("GET /admin/models page 2", () => "/admin/models?page=2&limit=500", 40, { admin: true }),
  ];
}

function adminUserEndpoints() {
  return [
    endpoint("GET /admin/users first pages", () => `/admin/users?page=${randomPage(5)}&limit=100`, 80, { admin: true }),
    endpoint("GET /admin/users low first pages", () => `/admin/users?page=${randomPage(3)}&limit=100&pointsFilter=low`, 20, { admin: true }),
  ];
}

function adminLogEndpoints() {
  return [
    endpoint("GET /admin/logs all first pages", () => `/admin/logs?page=${randomPage(10)}&limit=50&status=all&diagnosticOnly=false`, 80, { admin: true }),
    endpoint("GET /admin/logs rejected first pages", () => `/admin/logs?page=${randomPage(5)}&limit=50&status=rejected&diagnosticOnly=false`, 20, { admin: true }),
  ];
}

function endpoint(name, pathFactory, weight, options = {}) {
  return {
    name,
    pathFactory,
    weight: Math.max(1, Math.floor(weight)),
    method: String(options.method || "GET").toUpperCase(),
    bodyFactory: typeof options.bodyFactory === "function" ? options.bodyFactory : null,
    admin: options.admin === true,
    session: options.session === true,
    accept: typeof options.accept === "string" ? options.accept : null,
    measureTtft: options.measureTtft === true,
  };
}

function weighted(items, multiplier) {
  return items.map((item) => ({ ...item, weight: item.weight * multiplier }));
}

function pickEndpoint(items) {
  const totalWeight = items.reduce((total, item) => total + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

function randomRange() {
  const ranges = ["6h", "24h", "7d", "30d", "90d", "all"];
  return ranges[Math.floor(Math.random() * ranges.length)];
}

function randomUserSummaryKind() {
  const kinds = ["total", "new", "free", "pro", "max", "ultra"];
  return kinds[Math.floor(Math.random() * kinds.length)];
}

function randomPage(maxPage) {
  return 1 + Math.floor(Math.random() * Math.max(1, maxPage));
}

function isValidSessionToken(token) {
  return typeof token === "string" && /^nts_[0-9a-f]{64}$/i.test(token);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
