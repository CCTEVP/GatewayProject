# Gateway Project

Minimal Node.js API gateway that accepts client query parameters, normalizes them for an upstream API, and exposes two responses:

- `/api/weather` forwards the upstream JSON response directly.
- `/stats/weather` shows combined stats for successful `/api/weather` requests by reading hashed JSON files from the `stats/` folder. Each stats file now uses the same filename as the matching cache entry, so cross-referencing between `stats/` and `cache/` is direct.
- `/stats/reset` clears all stored weather stats files.
- `/cache/reset` clears all stored cached response files.
- `/docs` opens Swagger UI for interactive testing.
- `/openapi.json` returns the OpenAPI document used by Swagger UI.

## Query normalization

Incoming requests can include `latlong=3.4545,45.655` (or `latlong=3.4545/45.655`) and the gateway will transform that into:

```text
lat=3.4545&lon=45.655
```

Requests can also include `duid=<ID>`. The gateway will match this against the `ID` column in `src/data/screens_export_2026-04-09.csv`, pull the corresponding `LatLong`, then transform it into `lat` and `lon`.
The `duid` parameter is used only for local lookup and is not forwarded upstream.
All other query parameters are passed through unchanged.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create an `.env` file based on `.env.example`.

3. Start the server:

   ```bash
   npm start
   ```

   For development with auto-reload:

   ```bash
   npm run dev
   ```

## Environment variables

- `PORT`: Local server port. Default: `3000`
- `EXTERNAL_API_BASE_URL`: Full upstream endpoint URL used by both gateway routes.
- `EXTERNAL_API_APP_ID`: Upstream API key appended as `appid` (required).
- `EXTERNAL_API_DEFAULT_UNITS`: Default units appended when `units` is not provided. Default: `metric`
- `EXTERNAL_API_TIMEOUT_MS`: Upstream timeout in milliseconds. Default: `10000`

### OpenWeather setup

Use this `.env` configuration to match your external request:

```text
EXTERNAL_API_BASE_URL=https://api.openweathermap.org/data/2.5/weather
EXTERNAL_API_APP_ID=your_openweather_appid_here
EXTERNAL_API_DEFAULT_UNITS=metric
```

## Examples

```text
GET /api/weather?latlong=3.4545,45.655&units=metric
GET /api/weather?duid=129099&units=metric
GET /stats/weather
POST /stats/reset
POST /cache/reset
GET /docs
GET /openapi.json
```

## Stats storage

Each normalized `/api/weather` request writes to a hashed JSON file in `stats/`, using the exact same SHA-256 filename as the matching file in `cache/`.
Multiple incoming query variants that resolve to the same normalized upstream request are grouped into that same stats file under separate request groups.
The `/stats/weather` endpoint reads all of those files and combines them into a single response with:

- `requests`: one entry per recorded request, including whether it came from `cache` or `externalApi`
- `requestGroups`: grouped by the original incoming query string
- `cacheGroups`: grouped by the normalized query/cache key

## Swagger

Swagger UI is available at `/docs`.
It loads the OpenAPI specification from `/openapi.json`, so you can inspect and execute the gateway endpoints directly from the browser.
