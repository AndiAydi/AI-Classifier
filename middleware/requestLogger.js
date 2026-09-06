/**
 * Simple request logger with response time
 */
module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const color =
      res.statusCode >= 500 ? "\x1b[31m" :
      res.statusCode >= 400 ? "\x1b[33m" :
      "\x1b[32m";
    const reset = "\x1b[0m";
    console.log(`${color}${res.statusCode}${reset} ${ms}ms ${req.method} ${req.originalUrl}`);
  });
  next();
};
