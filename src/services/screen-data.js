const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const screenCsvPath = path.resolve(
  __dirname,
  "..",
  "data",
  "screens_export_2026-04-09.csv",
);

let cachedByDuid = null;

function loadScreenMap() {
  if (cachedByDuid) {
    return cachedByDuid;
  }

  const csvContent = fs.readFileSync(screenCsvPath, "utf8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  const byDuid = new Map();
  for (const row of rows) {
    const id = row.ID ? String(row.ID).trim() : "";
    const latlong = row.LatLong ? String(row.LatLong).trim() : "";

    if (!id || !latlong) {
      continue;
    }

    byDuid.set(id, latlong);
  }

  cachedByDuid = byDuid;
  return cachedByDuid;
}

function getLatLongByDuid(duid) {
  const normalizedDuid = String(duid || "").trim();
  if (!normalizedDuid) {
    return null;
  }

  return loadScreenMap().get(normalizedDuid) || null;
}

module.exports = {
  getLatLongByDuid,
};
