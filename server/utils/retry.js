function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error) {
  return Number(
    error?.statusCode ||
      error?.response?.status ||
      error?.code ||
      0
  );
}

function isRetryableError(error) {
  if (!error) return false;

  const status = getErrorStatus(error);
  const code = String(error?.code || "").toUpperCase();

  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  if ([
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNABORTED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "EPIPE",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT"
  ].includes(code)) {
    return true;
  }

  return false;
}

async function withRetry(fn, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 3));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs || 250));
  const shouldRetry = typeof options.shouldRetry === "function" ? options.shouldRetry : isRetryableError;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn({ attempt, maxAttempts });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt, maxAttempts)) {
        throw error;
      }
      const delay = baseDelayMs * attempt;
      if (delay > 0) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

module.exports = {
  withRetry,
  isRetryableError
};
