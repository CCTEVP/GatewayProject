const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const CACHE_DIR = path.resolve(process.cwd(), "cache");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKeyFor(query) {
  const sorted = Object.keys(query)
    .sort()
    .reduce((acc, key) => {
      acc[key] = query[key];
      return acc;
    }, {});
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex");
  return hash;
}

function cacheFilePath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

function getCache(query) {
  ensureCacheDir();
  const filePath = cacheFilePath(cacheKeyFor(query));
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const entry = JSON.parse(raw);
    const ttl = config.cache.ttlSeconds ?? entry.ttlSeconds;
    const ageSeconds = (Date.now() - entry.cachedAt) / 1000;
    if (ageSeconds > ttl) {
      fs.unlinkSync(filePath);
      return null;
    }
    // Attach timestamp to the returned data
    return { ...entry.data, timestamp: new Date(entry.cachedAt).toISOString() };
  } catch {
    return null;
  }
}

function setCache(query, data) {
  ensureCacheDir();
  const filePath = cacheFilePath(cacheKeyFor(query));
  const now = Date.now();
  const entry = {
    cachedAt: now,
    ttlSeconds: config.cache.ttlSeconds,
    data: { ...data, timestamp: new Date(now).toISOString() },
  };
  fs.writeFileSync(filePath, JSON.stringify(entry), "utf8");
}

module.exports = { getCache, setCache };
