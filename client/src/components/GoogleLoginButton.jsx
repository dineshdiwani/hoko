import { useCallback, useEffect, useRef, useState } from "react";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { isNativeAppRuntime } from "../utils/runtime";

function parseGoogleClientIds() {
  const raw = [
    "482189438712-3si7monkd64341m7qh90hqevmdhh75iv.apps.googleusercontent.com",
    import.meta.env.VITE_GOOGLE_CLIENT_ID,
    import.meta.env.VITE_GOOGLE_CLIENT_ID_FALLBACK,
    "340021652429-qu9hohn3j0hu9uv437skbc3m53dl7b06.apps.googleusercontent.com"
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(",");
  const unique = [];
  for (const id of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (!unique.includes(id)) {
      unique.push(id);
    }
  }
  return unique;
}

function isCancellationLikeError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("cancelled by user") ||
    message.includes("canceled by user") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("activity is cancelled")
  );
}

async function tryNativeGoogleLogin(options) {
  const response = await SocialLogin.login({
    provider: "google",
    options
  });
  return response?.provider === "google" ? response?.result?.idToken : null;
}

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false,
  onDisabledClick
}) {
  const googleClientIdsRef = useRef(parseGoogleClientIds());
  const activeClientIndexRef = useRef(0);
  const initializedRef = useRef(false);
  const buttonHostRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const isNativeRuntime = isNativeAppRuntime();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initError, setInitError] = useState("");

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  const initializeGoogle = useCallback((forcedIndex = null) => {
    const clientIds = googleClientIdsRef.current;
    const clientId =
      clientIds[
        forcedIndex == null
          ? activeClientIndexRef.current
          : Math.max(0, Math.min(forcedIndex, clientIds.length - 1))
      ];
    if (!clientId) {
      const error = new Error("Missing VITE_GOOGLE_CLIENT_ID");
      setInitError(error.message);
      onErrorRef.current?.(error);
      return false;
    }
    if (!window.google?.accounts?.id) return false;
    if (forcedIndex != null) {
      activeClientIndexRef.current = Math.max(
        0,
        Math.min(forcedIndex, clientIds.length - 1)
      );
    }

    if (!initializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            onSuccessRef.current?.(response.credential);
          } else {
            onErrorRef.current?.(
              response || new Error("Missing Google credential")
            );
          }
        },
        auto_select: false
      });
      initializedRef.current = true;
    }
    return true;
  }, []);

  const initializeNativeGoogle = useCallback(async (forcedIndex = null) => {
    const clientIds = googleClientIdsRef.current;
    const safeIndex =
      forcedIndex == null
        ? activeClientIndexRef.current
        : Math.max(0, Math.min(forcedIndex, clientIds.length - 1));
    const clientId = clientIds[safeIndex];
    if (!clientId) {
      const error = new Error("Missing VITE_GOOGLE_CLIENT_ID");
      setInitError(error.message);
      onErrorRef.current?.(error);
      return false;
    }
    try {
      setInitializing(true);
      setInitError("");
      activeClientIndexRef.current = safeIndex;
      await SocialLogin.initialize({
        google: {
          webClientId: clientId,
          mode: "online"
        }
      });
      setGoogleReady(true);
      return true;
    } catch (error) {
      const nextError =
        error instanceof Error
          ? error
          : new Error("Google login is unavailable on this device");
      setGoogleReady(false);
      setInitError(nextError.message);
      onErrorRef.current?.(
        nextError
      );
      return false;
    } finally {
      setInitializing(false);
    }
  }, []);

  const renderGoogleButton = useCallback(() => {
    if (buttonHostRef.current) {
      buttonHostRef.current.innerHTML = "";
      const width = Math.max(220, Math.floor(buttonHostRef.current.offsetWidth || 0));
      window.google.accounts.id.renderButton(buttonHostRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width
      });
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (isNativeRuntime) {
      initializeNativeGoogle().then((ready) => {
        setScriptLoaded(Boolean(ready));
      });
      return;
    }
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const existing = document.querySelector("script[data-google-identity]");
    if (existing) {
      existing.addEventListener(
        "load",
        () => {
          setScriptLoaded(true);
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => setScriptLoaded(true);
    script.onerror = () =>
      onErrorRef.current?.(new Error("Failed to load Google script"));
    document.body.appendChild(script);
  }, [initializeNativeGoogle, isNativeRuntime]);

  useEffect(() => {
    if (isNativeRuntime) return;
    if (!scriptLoaded) return;
    if (!initializeGoogle()) return;

    const rendered = renderGoogleButton();
    setGoogleReady(rendered);

    if (disabled) {
      window.google?.accounts?.id?.cancel();
      return;
    }

    return () => {
      window.google?.accounts?.id?.cancel();
    };
  }, [scriptLoaded, initializeGoogle, renderGoogleButton, disabled, isNativeRuntime]);

  const signInWithNativeGoogle = useCallback(async () => {
    if (!googleReady) {
      const initialized = await initializeNativeGoogle();
      if (!initialized) {
        return;
      }
    }
    try {
      setInitError("");
      setInitializing(true);
      const credential = await tryNativeGoogleLogin({
        style: "bottom",
        filterByAuthorizedAccounts: false,
        autoSelectEnabled: false
      });
      if (!credential) {
        throw new Error("Google credential unavailable");
      }
      onSuccessRef.current?.(credential);
    } catch (error) {
      if (isCancellationLikeError(error)) {
        const nextError = new Error(
          "Google Sign-In was cancelled. Please try again."
        );
        setInitError(nextError.message);
        onErrorRef.current?.(nextError);
        return;
      }
      const nextError =
        error instanceof Error
          ? error
          : new Error("Google login failed");
      setInitError(nextError.message);
      onErrorRef.current?.(
        nextError
      );
    } finally {
      setInitializing(false);
    }
  }, [googleReady, initializeNativeGoogle]);

  return (
    <div className={`w-full mt-3 relative ${disabled ? "opacity-70" : ""}`}>
      <div className="relative w-full">
        {isNativeRuntime ? (
          <button
            type="button"
            onClick={disabled ? () => onDisabledClick?.() : signInWithNativeGoogle}
            className="w-full h-[44px] rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-2"
            disabled={initializing}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.4 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.14-3.09-.4-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
            </span>
            <span>
              {initializing
                ? "Loading Google login..."
                : "Continue with Google"}
            </span>
          </button>
        ) : (
        <div
          ref={buttonHostRef}
          className={`w-full ${disabled ? "pointer-events-none" : ""}`}
        />
        )}
        {!isNativeRuntime && !googleReady && (
          <button
            type="button"
            onClick={() =>
              onErrorRef.current?.(
                new Error("Google login is still loading. Please wait a moment and try again.")
              )
            }
            className="w-full h-[44px] rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-2"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.4 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.14-3.09-.4-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
            </span>
            <span>Continue with Google</span>
          </button>
        )}
        {disabled && (
          <button
            type="button"
            onClick={() => onDisabledClick?.()}
            className="absolute inset-0 z-20 rounded cursor-not-allowed bg-white/0"
            aria-label="Complete city and terms before Google login"
            title="Select city and accept terms first"
          />
        )}
      </div>
      {!googleReady && !initError && (
        <div className="text-xs text-gray-500 text-center mt-2">
          Loading Google login...
        </div>
      )}
      {Boolean(initError) && (
        <div className="text-xs text-amber-700 text-center mt-2">
          Google login unavailable right now. Use email OTP or tap again after setup.
        </div>
      )}
    </div>
  );
}
