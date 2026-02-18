import { useCallback, useEffect, useRef, useState } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false,
  onDisabledClick
}) {
  const initializedRef = useRef(false);
  const buttonHostRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  const initializeGoogle = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      onErrorRef.current?.(new Error("Missing VITE_GOOGLE_CLIENT_ID"));
      return false;
    }
    if (!window.google?.accounts?.id) return false;

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

  const renderGoogleButton = useCallback(() => {
    if (buttonHostRef.current) {
      buttonHostRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonHostRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.min(360, Math.max(220, buttonHostRef.current.offsetWidth || 0))
      });
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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
  }, [scriptLoaded, initializeGoogle, renderGoogleButton, disabled]);

  return (
    <div className={`w-full mt-3 relative ${disabled ? "opacity-70" : ""}`}>
      <div className="flex justify-center">
        <div className="relative inline-flex">
          <div
            ref={buttonHostRef}
            className={disabled ? "pointer-events-none" : ""}
          />
          {disabled && (
            <button
              type="button"
              onClick={() => onDisabledClick?.()}
              className="absolute inset-0 z-20 min-h-[40px] min-w-[240px] rounded cursor-not-allowed bg-white/0"
              aria-label="Complete city and terms before Google login"
              title="Select city and accept terms first"
            />
          )}
        </div>
      </div>
      {!googleReady && (
        <div className="text-xs text-gray-500 text-center mt-2">
          Loading Google login...
        </div>
      )}
    </div>
  );
}
