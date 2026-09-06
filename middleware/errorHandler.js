/**
 * Global error handler
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${err.message}`);
  if (err.stack) console.error(err.stack);

  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.name || "Error",
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
