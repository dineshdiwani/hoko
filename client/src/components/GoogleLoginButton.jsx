import { useEffect, useRef, useState } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  text = "Continue with Google",
  oneTap = false,
  disabled = false,
  onDisabledClick
}) {
  const buttonRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [configError, setConfigError] = useState("");

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      const err = "Missing VITE_GOOGLE_CLIENT_ID";
      setConfigError(err);
      onError?.(new Error(err));
      return;
    }

    function initAndRender() {
      if (!window.google || !buttonRef.current) return;
      setConfigError("");
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            onSuccess?.(response.credential);
          } else {
            onError?.(response);
          }
        },
        auto_select: false
      });
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: "360"
      });
      setIsReady(true);
      if (oneTap && !disabled) {
        window.google.accounts.id.prompt((notification) => {
          if (
            notification?.isNotDisplayed?.() ||
            notification?.isSkippedMoment?.()
          ) {
            onError?.(notification);
          }
        });
      }
    }

    if (window.google?.accounts?.id) {
      initAndRender();
      return;
    }

    const existing = document.querySelector(
      "script[data-google-identity]"
    );
    if (existing) {
      existing.addEventListener("load", initAndRender, {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = initAndRender;
    script.onerror = () => {
      const err = "Failed to load Google script";
      setConfigError(err);
      onError?.(new Error(err));
    };
    document.body.appendChild(script);
  }, [onSuccess, onError, oneTap, disabled]);

  return (
    <div className={`w-full mt-3 relative ${disabled ? "opacity-70" : ""}`}>
      <div ref={buttonRef} className={isReady ? "" : "hidden"} />
      {!isReady && (
        <button
          type="button"
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-none"
          onClick={() => {
            if (disabled) {
              onDisabledClick?.();
              return;
            }
            if (configError) {
              onError?.(new Error(configError));
              return;
            }
            onError?.(
              new Error(
                "Google button is still loading. Please wait a moment and try again."
              )
            );
          }}
        >
          Continue with Google
        </button>
      )}
      {disabled && (
        <button
          type="button"
          onClick={onDisabledClick}
          className="absolute inset-0 w-full h-full rounded-xl cursor-not-allowed"
          aria-label="Complete city and terms before Google login"
          title="Select city and accept terms first"
        />
      )}
      <div className="sr-only">{text}</div>
    </div>
  );
}
