const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const screenCsvPath = path.resolve(__dirname, "..", "data", "players.csv");

let cachedByPlayerId = null;

function loadPlayerMap() {
  if (cachedByPlayerId) {
    return cachedByPlayerId;
  }

  const csvContent = fs.readFileSync(screenCsvPath, "utf8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  const byPlayerId = new Map();
  for (const row of rows) {
    const id = row.BroadsignPlayerID
      ? String(row.BroadsignPlayerID).trim()
      : "";
    const lat = row.Latitude ? String(row.Latitude).trim() : "";
    const lon = row.Longitude ? String(row.Longitude).trim() : "";

    if (!id || !lat || !lon) {
      continue;
    }

    byPlayerId.set(id, `${lat}/${lon}`);
  }

  cachedByPlayerId = byPlayerId;
  return cachedByPlayerId;
}

function getLatLongByPlayerId(playerId) {
  const normalizedId = String(playerId || "").trim();
  if (!normalizedId) {
    return null;
  }

  return loadPlayerMap().get(normalizedId) || null;
}

module.exports = {
  getLatLongByPlayerId,
};
