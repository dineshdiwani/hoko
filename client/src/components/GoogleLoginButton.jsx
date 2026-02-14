import { useCallback, useEffect, useRef, useState } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false
}) {
  const initializedRef = useRef(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const initializeGoogle = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      onError?.(new Error("Missing VITE_GOOGLE_CLIENT_ID"));
      return false;
    }
    if (!window.google?.accounts?.id) return false;

    if (!initializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            onSuccess?.(response.credential);
          } else {
            onError?.(response || new Error("Missing Google credential"));
          }
        },
        auto_select: false
      });
      initializedRef.current = true;
    }
    setGoogleReady(true);
    return true;
  }, [onSuccess, onError]);

  useEffect(() => {
    if (initializeGoogle()) return;

    const existing = document.querySelector("script[data-google-identity]");
    if (existing) {
      existing.addEventListener(
        "load",
        () => {
          initializeGoogle();
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
    script.onload = () => initializeGoogle();
    script.onerror = () =>
      onError?.(new Error("Failed to load Google script"));
    document.body.appendChild(script);
  }, [initializeGoogle, onError]);

  function handleClick() {
    if (disabled || busy) return;
    setBusy(true);

    const ready = initializeGoogle();
    if (!ready) {
      setBusy(false);
      onError?.(new Error("Google not ready yet. Try again."));
      return;
    }

    window.google.accounts.id.prompt((notification) => {
      setBusy(false);
      if (
        notification?.isNotDisplayed?.() ||
        notification?.isSkippedMoment?.()
      ) {
        onError?.(notification);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className={`w-full mt-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-none transition ${
        disabled
          ? "border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
      aria-label="Continue with Google"
      title={disabled ? "Select city and accept terms first" : "Continue with Google"}
    >
      {busy
        ? "Opening Google..."
        : googleReady
        ? "Continue with Google"
        : "Continue with Google (loading...)"}
    </button>
  );
}
