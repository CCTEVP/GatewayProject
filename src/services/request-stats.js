const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { cacheKeyFor } = require("./cache");

const STATS_DIR = path.resolve(process.cwd(), "stats");

function ensureStatsDir() {
  fs.mkdirSync(STATS_DIR, { recursive: true });
}

function createEmptyStats() {
  return {
    totalRequests: 0,
    totalCacheHits: 0,
    totalCacheMisses: 0,
    requestGroups: {},
    cacheGroups: {},
    requests: [],
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function canonicalizeQueryEntries(query) {
  const entries = [];

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push([key, String(item)]);
      }
      continue;
    }

    entries.push([key, String(value)]);
  }

  return entries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });
}

function serializeQuery(query) {
  const params = new URLSearchParams();

  for (const [key, value] of canonicalizeQueryEntries(query)) {
    params.append(key, value);
  }

  return params.toString();
}

function toSortedObject(query) {
  return canonicalizeQueryEntries(query).reduce((accumulator, [key, value]) => {
    if (Object.prototype.hasOwnProperty.call(accumulator, key)) {
      const currentValue = accumulator[key];
      accumulator[key] = Array.isArray(currentValue)
        ? [...currentValue, value]
        : [currentValue, value];
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
}

function createRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function buildRequestEntry({ cacheHit, requestId, requestedAt, source }) {
  return {
    requestId: requestId || createRequestId(),
    requestedAt: requestedAt || new Date().toISOString(),
    source: source || (cacheHit ? "cache" : "externalApi"),
    cacheHit: Boolean(cacheHit),
  };
}

function buildRequestContext({ requestQuery, normalizedQuery }) {
  const requestQueryObject = toSortedObject(requestQuery);
  const normalizedQueryObject = toSortedObject(normalizedQuery);
  const cacheKey = cacheKeyFor(normalizedQueryObject);

  return {
    requestQuery: requestQueryObject,
    requestQueryString: serializeQuery(requestQueryObject),
    normalizedQuery: normalizedQueryObject,
    normalizedQueryString: serializeQuery(normalizedQueryObject),
    cacheKey,
    statsFile: `${cacheKey}.json`,
  };
}

function createCacheGroup(normalizedQuery) {
  const normalizedQueryObject = toSortedObject(normalizedQuery);
  const cacheKey = cacheKeyFor(normalizedQueryObject);

  return {
    cacheKey,
    statsFile: `${cacheKey}.json`,
    normalizedQuery: normalizedQueryObject,
    normalizedQueryString: serializeQuery(normalizedQueryObject),
    requestCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    firstRequestedAt: null,
    lastRequestedAt: null,
    requestGroups: {},
  };
}

function createRequestGroup(requestQuery) {
  const requestQueryObject = toSortedObject(requestQuery);

  return {
    requestQuery: requestQueryObject,
    requestQueryString: serializeQuery(requestQueryObject),
    requestCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    firstRequestedAt: null,
    lastRequestedAt: null,
    requests: [],
  };
}

function statsFilePathForNormalizedQuery(normalizedQuery) {
  return path.join(
    STATS_DIR,
    `${cacheKeyFor(toSortedObject(normalizedQuery))}.json`,
  );
}

function listStatsFiles() {
  ensureStatsDir();

  return fs
    .readdirSync(STATS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
}

function isLegacySingleRequestRecord(record) {
  return Boolean(
    record &&
    !Array.isArray(record.requests) &&
    record.requestId &&
    record.requestedAt &&
    record.requestQuery &&
    record.normalizedQuery,
  );
}

function isLegacyRequestGroupedRecord(record) {
  return Boolean(
    record &&
    Array.isArray(record.requests) &&
    record.requestQuery &&
    record.normalizedQuery,
  );
}

function isCacheGroupedRecord(record) {
  return Boolean(
    record &&
    record.normalizedQuery &&
    record.requestGroups &&
    !Array.isArray(record.requestGroups),
  );
}

function normalizeRequestEntry(entry) {
  if (!entry || !entry.requestedAt) {
    return null;
  }

  return buildRequestEntry({
    cacheHit: entry.cacheHit,
    requestId: entry.requestId,
    requestedAt: entry.requestedAt,
    source: entry.source,
  });
}

function applyRequestToGroup(group, requestRecord, includeNormalizedFields) {
  if (includeNormalizedFields) {
    group.normalizedQuery = requestRecord.normalizedQuery;
    group.normalizedQueryString = requestRecord.normalizedQueryString;
    group.cacheKey = requestRecord.cacheKey;
    group.statsFile = requestRecord.statsFile;
  }

  group.requestCount += 1;

  if (!group.firstRequestedAt) {
    group.firstRequestedAt = requestRecord.requestedAt;
  }

  if (!group.lastRequestedAt) {
    group.lastRequestedAt = requestRecord.requestedAt;
  }

  if (
    String(requestRecord.requestedAt).localeCompare(group.firstRequestedAt) < 0
  ) {
    group.firstRequestedAt = requestRecord.requestedAt;
  }

  if (
    String(requestRecord.requestedAt).localeCompare(group.lastRequestedAt) > 0
  ) {
    group.lastRequestedAt = requestRecord.requestedAt;
  }

  if (requestRecord.cacheHit) {
    group.cacheHits += 1;
  } else {
    group.cacheMisses += 1;
  }
}

function sortRequestsByMostRecent(left, right) {
  return String(right.requestedAt).localeCompare(String(left.requestedAt));
}

function sortByMostRequested(left, right) {
  if (right.requestCount !== left.requestCount) {
    return right.requestCount - left.requestCount;
  }

  return String(right.lastRequestedAt).localeCompare(
    String(left.lastRequestedAt),
  );
}

function loadCacheGroupedRecord(filePath, fallbackNormalizedQuery) {
  const rawRecord = readJsonFile(filePath);
  const cacheGroup = createCacheGroup(
    rawRecord?.normalizedQuery || fallbackNormalizedQuery,
  );

  if (!isCacheGroupedRecord(rawRecord)) {
    return cacheGroup;
  }

  cacheGroup.normalizedQuery = toSortedObject(rawRecord.normalizedQuery);
  cacheGroup.normalizedQueryString = serializeQuery(cacheGroup.normalizedQuery);
  cacheGroup.cacheKey = cacheKeyFor(cacheGroup.normalizedQuery);
  cacheGroup.statsFile = path.basename(filePath);

  for (const rawRequestGroup of Object.values(rawRecord.requestGroups)) {
    const requestGroup = createRequestGroup(rawRequestGroup.requestQuery);

    for (const rawRequestEntry of rawRequestGroup.requests || []) {
      const requestEntry = normalizeRequestEntry(rawRequestEntry);
      if (!requestEntry) {
        continue;
      }

      const requestRecord = {
        ...requestEntry,
        normalizedQuery: cacheGroup.normalizedQuery,
        normalizedQueryString: cacheGroup.normalizedQueryString,
        cacheKey: cacheGroup.cacheKey,
        statsFile: cacheGroup.statsFile,
      };

      applyRequestToGroup(cacheGroup, requestRecord, false);
      applyRequestToGroup(requestGroup, requestRecord, false);
      requestGroup.requests.push(requestEntry);
    }

    if (requestGroup.requestCount === 0) {
      continue;
    }

    requestGroup.requests.sort(sortRequestsByMostRecent);
    cacheGroup.requestGroups[requestGroup.requestQueryString] = requestGroup;
  }

  return cacheGroup;
}

function writeCacheGroupedRecord(filePath, cacheGroup) {
  const serializedRequestGroups = Object.fromEntries(
    Object.entries(cacheGroup.requestGroups).map(([key, requestGroup]) => [
      key,
      {
        requestQuery: requestGroup.requestQuery,
        requestQueryString: requestGroup.requestQueryString,
        requestCount: requestGroup.requestCount,
        cacheHits: requestGroup.cacheHits,
        cacheMisses: requestGroup.cacheMisses,
        firstRequestedAt: requestGroup.firstRequestedAt,
        lastRequestedAt: requestGroup.lastRequestedAt,
        requests: [...requestGroup.requests].sort(sortRequestsByMostRecent),
      },
    ]),
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        cacheKey: cacheGroup.cacheKey,
        statsFile: cacheGroup.statsFile,
        normalizedQuery: cacheGroup.normalizedQuery,
        normalizedQueryString: cacheGroup.normalizedQueryString,
        requestCount: cacheGroup.requestCount,
        cacheHits: cacheGroup.cacheHits,
        cacheMisses: cacheGroup.cacheMisses,
        firstRequestedAt: cacheGroup.firstRequestedAt,
        lastRequestedAt: cacheGroup.lastRequestedAt,
        requestGroups: serializedRequestGroups,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function appendRequestToCacheGroup({
  requestQuery,
  normalizedQuery,
  requestEntry,
}) {
  const context = buildRequestContext({ requestQuery, normalizedQuery });
  const filePath = statsFilePathForNormalizedQuery(context.normalizedQuery);
  const cacheGroup = loadCacheGroupedRecord(filePath, context.normalizedQuery);
  const requestGroup =
    cacheGroup.requestGroups[context.requestQueryString] ||
    createRequestGroup(context.requestQuery);
  const requestRecord = {
    ...requestEntry,
    normalizedQuery: context.normalizedQuery,
    normalizedQueryString: context.normalizedQueryString,
    cacheKey: context.cacheKey,
    statsFile: context.statsFile,
  };

  cacheGroup.cacheKey = context.cacheKey;
  cacheGroup.statsFile = context.statsFile;
  cacheGroup.normalizedQuery = context.normalizedQuery;
  cacheGroup.normalizedQueryString = context.normalizedQueryString;

  applyRequestToGroup(cacheGroup, requestRecord, false);
  applyRequestToGroup(requestGroup, requestRecord, false);
  requestGroup.requests.push(requestEntry);
  requestGroup.requests.sort(sortRequestsByMostRecent);

  cacheGroup.requestGroups[context.requestQueryString] = requestGroup;
  writeCacheGroupedRecord(filePath, cacheGroup);
}

function migrateLegacyStatsFiles() {
  for (const entry of listStatsFiles()) {
    const filePath = path.join(STATS_DIR, entry.name);
    const record = readJsonFile(filePath);

    if (isLegacySingleRequestRecord(record)) {
      appendRequestToCacheGroup({
        requestQuery: record.requestQuery,
        normalizedQuery: record.normalizedQuery,
        requestEntry: buildRequestEntry({
          cacheHit: record.cacheHit,
          requestId: record.requestId,
          requestedAt: record.requestedAt,
          source: record.source,
        }),
      });

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      continue;
    }

    if (isLegacyRequestGroupedRecord(record)) {
      for (const rawRequestEntry of record.requests) {
        const requestEntry = normalizeRequestEntry(rawRequestEntry);
        if (!requestEntry) {
          continue;
        }

        appendRequestToCacheGroup({
          requestQuery: record.requestQuery,
          normalizedQuery: record.normalizedQuery,
          requestEntry,
        });
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

function decorateSourceBreakdown(group) {
  return {
    ...group,
    cachedResponses: group.cacheHits,
    externalApiRequests: group.cacheMisses,
    sourceBreakdown: {
      cache: group.cacheHits,
      externalApi: group.cacheMisses,
    },
  };
}

function recordWeatherRequest({ requestQuery, normalizedQuery, cacheHit }) {
  ensureStatsDir();
  migrateLegacyStatsFiles();
  appendRequestToCacheGroup({
    requestQuery,
    normalizedQuery,
    requestEntry: buildRequestEntry({ cacheHit }),
  });
}

function getWeatherRequestStats() {
  const stats = createEmptyStats();
  migrateLegacyStatsFiles();

  for (const entry of listStatsFiles()) {
    const filePath = path.join(STATS_DIR, entry.name);
    const cacheGroup = loadCacheGroupedRecord(filePath, {});

    if (cacheGroup.requestCount === 0) {
      continue;
    }

    stats.totalRequests += cacheGroup.requestCount;
    stats.totalCacheHits += cacheGroup.cacheHits;
    stats.totalCacheMisses += cacheGroup.cacheMisses;

    for (const requestGroup of Object.values(cacheGroup.requestGroups)) {
      const globalRequestGroup = stats.requestGroups[
        requestGroup.requestQueryString
      ] || {
        requestQuery: requestGroup.requestQuery,
        requestQueryString: requestGroup.requestQueryString,
        normalizedQuery: cacheGroup.normalizedQuery,
        normalizedQueryString: cacheGroup.normalizedQueryString,
        cacheKey: cacheGroup.cacheKey,
        statsFile: cacheGroup.statsFile,
        requestCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        firstRequestedAt: null,
        lastRequestedAt: null,
      };

      for (const requestEntry of requestGroup.requests) {
        const requestRecord = {
          ...requestEntry,
          requestQuery: requestGroup.requestQuery,
          requestQueryString: requestGroup.requestQueryString,
          normalizedQuery: cacheGroup.normalizedQuery,
          normalizedQueryString: cacheGroup.normalizedQueryString,
          cacheKey: cacheGroup.cacheKey,
          statsFile: cacheGroup.statsFile,
          cacheFile: `${cacheGroup.cacheKey}.json`,
        };

        stats.requests.push(requestRecord);
        applyRequestToGroup(globalRequestGroup, requestRecord, true);
      }

      stats.requestGroups[requestGroup.requestQueryString] = globalRequestGroup;
    }

    stats.cacheGroups[cacheGroup.cacheKey] = {
      ...cacheGroup,
      statsFile: cacheGroup.statsFile,
      cacheFile: `${cacheGroup.cacheKey}.json`,
    };
  }

  stats.requests.sort(sortRequestsByMostRecent);

  return {
    totalRequests: stats.totalRequests,
    totalCacheHits: stats.totalCacheHits,
    totalCacheMisses: stats.totalCacheMisses,
    totalCachedResponses: stats.totalCacheHits,
    totalExternalApiRequests: stats.totalCacheMisses,
    sourceBreakdown: {
      cache: stats.totalCacheHits,
      externalApi: stats.totalCacheMisses,
    },
    requests: stats.requests,
    requestGroups: Object.values(stats.requestGroups)
      .sort(sortByMostRequested)
      .map(decorateSourceBreakdown),
    cacheGroups: Object.values(stats.cacheGroups)
      .map((cacheGroup) => ({
        ...decorateSourceBreakdown(cacheGroup),
        distinctRequestCount: Object.keys(cacheGroup.requestGroups).length,
        requestGroups: Object.values(cacheGroup.requestGroups)
          .sort(sortByMostRequested)
          .map((requestGroup) =>
            decorateSourceBreakdown({
              ...requestGroup,
              normalizedQuery: cacheGroup.normalizedQuery,
              normalizedQueryString: cacheGroup.normalizedQueryString,
              cacheKey: cacheGroup.cacheKey,
              statsFile: cacheGroup.statsFile,
            }),
          ),
      }))
      .sort(sortByMostRequested),
  };
}

module.exports = {
  getWeatherRequestStats,
  recordWeatherRequest,
};
