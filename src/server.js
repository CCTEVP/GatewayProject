const path = require("path");
const express = require("express");
const swaggerUi = require("swagger-ui-express");

const config = require("./config");
const { fetchUpstreamJson } = require("./services/upstream");

const app = express();
const openApiFilePath = path.resolve(__dirname, "..", "openapi.json");

app.get("/openapi.json", (req, res) => {
  res.sendFile(openApiFilePath);
});

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: {
      url: "/openapi.json",
    },
    customSiteTitle: "Gateway Project API Docs",
  }),
);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    upstreamConfigured: Boolean(config.upstream.baseUrl),
  });
});

app.get("/api/weather", async (req, res) => {
  try {
    if (req.query.lat !== undefined || req.query.lon !== undefined) {
      return res.status(400).json({
        error:
          'Query parameters "lat" and "lon" are not allowed on /api/weather. Use "latlong" or "duid".',
      });
    }

    const output = req.query.output ?? "js";
    if (output !== "json" && output !== "js") {
      return res.status(400).json({
        error: 'Query parameter "output" must be "json" or "js".',
      });
    }

    const result = await fetchUpstreamJson(req.query);

    if (output === "js") {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      return res.send(
        `data = ${JSON.stringify({ ...result.upstreamBody, timestamp: result.timestamp }, null, 2)}`,
      );
    }

    res.json({ ...result.upstreamBody, timestamp: result.timestamp });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
});

app.listen(config.port, () => {
  console.log(`Gateway API listening on port ${config.port}`);
});
