const config = require("../config");
const { normalizeLatLong, searchParamsToObject } = require("../lib/query");
const { getLatLongByDuid } = require("./screen-data");
const { getCache, setCache } = require("./cache");

function resolveQueryCoordinates(query) {
  const resolvedQuery = { ...query };

  const hasLatLong =
    resolvedQuery.latlong !== undefined &&
    resolvedQuery.latlong !== null &&
    String(resolvedQuery.latlong).trim() !== "";

  if (!hasLatLong) {
    const duid = resolvedQuery.duid;
    if (duid !== undefined && duid !== null && String(duid).trim() !== "") {
      const mappedLatLong = getLatLongByDuid(duid);
      if (!mappedLatLong) {
        const error = new Error(
          `No LatLong value found for duid \"${String(duid)}\".`,
        );
        error.statusCode = 404;
        throw error;
      }

      resolvedQuery.latlong = mappedLatLong;
    }
  }

  // duid is only for local lookup and should not be forwarded upstream.
  delete resolvedQuery.duid;
  // output controls gateway response format, not an upstream parameter.
  delete resolvedQuery.output;
  // appid must never be accepted from client query input.
  delete resolvedQuery.appid;

  return resolvedQuery;
}

function buildUpstreamUrl(query) {
  if (!config.upstream.baseUrl) {
    const error = new Error("EXTERNAL_API_BASE_URL is not configured.");
    error.statusCode = 500;
    throw error;
  }

  if (!config.upstream.appId) {
    const error = new Error("EXTERNAL_API_APP_ID is not configured.");
    error.statusCode = 500;
    throw error;
  }

  const upstreamUrl = new URL(config.upstream.baseUrl);
  const resolvedQuery = resolveQueryCoordinates(query);
  const normalizedParams = normalizeLatLong(resolvedQuery);

  if (!normalizedParams.get("units") && config.upstream.defaultUnits) {
    normalizedParams.set("units", config.upstream.defaultUnits);
  }

  normalizedParams.set("appid", config.upstream.appId);

  for (const [key, value] of normalizedParams.entries()) {
    upstreamUrl.searchParams.append(key, value);
  }

  return {
    normalizedParams,
    normalizedQuery: searchParamsToObject(normalizedParams),
    upstreamUrl,
  };
}

async function fetchUpstreamJson(query) {
  const { normalizedParams, normalizedQuery, upstreamUrl } =
    buildUpstreamUrl(query);

  const safeNormalizedQuery = { ...searchParamsToObject(normalizedParams) };
  delete safeNormalizedQuery.appid;

  const cached = getCache(safeNormalizedQuery);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    config.upstream.timeoutMs,
  );

  const safeUpstreamUrl = new URL(upstreamUrl.toString());
  safeUpstreamUrl.searchParams.delete("appid");

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      const parseError = new Error("Upstream response was not valid JSON.");
      parseError.statusCode = 502;
      parseError.details = {
        upstreamStatus: response.status,
        upstreamBody: text,
      };
      throw parseError;
    }

    if (!response.ok) {
      const upstreamError = new Error("Upstream request failed.");
      upstreamError.statusCode = 502;
      upstreamError.details = {
        upstreamStatus: response.status,
        upstreamBody: payload,
      };
      throw upstreamError;
    }

    const result = {
      normalizedParams,
      normalizedQuery: safeNormalizedQuery,
      upstreamUrl: safeUpstreamUrl,
      upstreamStatus: response.status,
      upstreamBody: payload,
    };

    setCache(safeNormalizedQuery, result);

    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Upstream request timed out.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

module.exports = {
  buildUpstreamUrl,
  fetchUpstreamJson,
};
