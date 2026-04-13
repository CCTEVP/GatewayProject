# Gateway Project

Minimal Node.js API gateway that accepts client query parameters, normalizes them for an upstream API, and exposes two responses:

- `/api/weather` forwards the upstream JSON response directly.
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
GET /docs
GET /openapi.json
```

## Swagger

Swagger UI is available at `/docs`.
It loads the OpenAPI specification from `/openapi.json`, so you can inspect and execute the gateway endpoints directly from the browser.
