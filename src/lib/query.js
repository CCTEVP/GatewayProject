function splitLatLong(latlong) {
  const parts = String(latlong)
    .split(/[\/,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  return {
    lat: parts[0],
    lon: parts[1],
  };
}

function normalizeLatLong(query) {
  const normalized = new URLSearchParams();
  const sourceEntries = Object.entries(query);

  for (const [key, value] of sourceEntries) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        normalized.append(key, item);
      }
      continue;
    }

    normalized.append(key, String(value));
  }

  const latlong = normalized.get("latlong");
  if (!latlong) {
    return normalized;
  }

  const split = splitLatLong(latlong);
  if (!split) {
    const error = new Error(
      'Query parameter "latlong" must be in the form "lat,lon" or "lat/lon".',
    );
    error.statusCode = 400;
    throw error;
  }

  normalized.delete("latlong");
  normalized.set("lat", split.lat);
  normalized.set("lon", split.lon);

  return normalized;
}

function searchParamsToObject(searchParams) {
  const values = {};

  for (const [key, value] of searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      const currentValue = values[key];
      values[key] = Array.isArray(currentValue)
        ? [...currentValue, value]
        : [currentValue, value];
      continue;
    }

    values[key] = value;
  }

  return values;
}

module.exports = {
  normalizeLatLong,
  splitLatLong,
  searchParamsToObject,
};
