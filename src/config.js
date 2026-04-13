const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DEFAULT_TIMEOUT_MS = 10000;

function toInteger(value, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallbackValue : parsed;
}

module.exports = {
  port: toInteger(process.env.PORT, 3000),
  upstream: {
    baseUrl: process.env.EXTERNAL_API_BASE_URL || "",
    appId: process.env.EXTERNAL_API_APP_ID || "",
    defaultUnits: process.env.EXTERNAL_API_DEFAULT_UNITS || "metric",
    timeoutMs: toInteger(
      process.env.EXTERNAL_API_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
  },
  cache: {
    ttlSeconds: toInteger(process.env.CACHE_API_RESPONSE_SECONDS, null),
  },
};
