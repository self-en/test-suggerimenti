// Emits one OpenTelemetry log record per HTTP request, for every route (not
// just /api/todos - see the DB-backed metrics middleware in server.js for
// that narrower, product-specific counterpart).
//
// Why this exists: @opentelemetry/auto-instrumentations-node (loaded via
// NODE_OPTIONS="--require .../register", see chart/templates/deployment.yaml)
// only auto-generates the *traces* signal for http/express - it does not
// synthesize log records out of thin air, and this app doesn't use a logging
// library (winston/pino) that OTel could bridge automatically. Without an
// explicit call to the Logs API, nothing is ever exported on the logs
// pipeline, so nothing reaches the log backend (e.g. Grafana Loki via OTLP)
// even though OTEL_LOGS_EXPORTER defaults to "otlp" once the SDK is loaded.
//
// logs.getLogger() below is a safe no-op when the SDK isn't loaded (i.e. on
// every branch other than main, where otel.endpoint - and therefore
// NODE_OPTIONS - is unset), so this file needs no gating of its own.
const { logs, SeverityNumber } = require("@opentelemetry/api-logs");

const logger = logs.getLogger("http");

function severityFor(statusCode) {
  if (statusCode >= 500) return { number: SeverityNumber.ERROR, text: "ERROR" };
  if (statusCode >= 400) return { number: SeverityNumber.WARN, text: "WARN" };
  return { number: SeverityNumber.INFO, text: "INFO" };
}

// Mount first, before any routes, so the timer wraps everything downstream
// and every response - including 404s and static assets - gets logged.
function httpLoggingMiddleware(req, res, next) {
  const startNs = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    const { number: severityNumber, text: severityText } = severityFor(res.statusCode);

    logger.emit({
      severityNumber,
      severityText,
      body: `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
      attributes: {
        "http.method": req.method,
        "http.target": req.originalUrl,
        "http.status_code": res.statusCode,
        "http.duration_ms": durationMs,
      },
    });
  });

  next();
}

module.exports = { httpLoggingMiddleware };
