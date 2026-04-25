import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
  ignoreErrors: [
    "No auth token found, proceeding without auth",
    "ResizeObserver loop completed with entries"
  ],
  beforeSend(event) {
    if (event.exception) {
      console.warn("[Sentry] Error captured:", event.exception?.values?.[0]?.type);
    }
    return event;
  }
});

export const captureError = (error, context = {}) => {
  Sentry.captureException(error, { extra: context });
};

export const captureMessage = (message, level = "info") => {
  Sentry.captureMessage(message, level);
};

export default Sentry;