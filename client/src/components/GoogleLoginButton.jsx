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
  const [isRendered, setIsRendered] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      setIsRendered(false);
      return;
    }

    function initAndRender() {
      if (!window.google || !buttonRef.current) return;
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
      setIsRendered(true);
      if (oneTap && !disabled) {
        window.google.accounts.id.prompt();
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
    script.onerror = onError;
    document.body.appendChild(script);
  }, [onSuccess, onError, oneTap, disabled]);

  return (
    <div className={`w-full mt-3 relative ${disabled ? "opacity-70" : ""}`}>
      <div ref={buttonRef} className={isRendered ? "" : "hidden"} />
      {!isRendered && (
        <button
          type="button"
          onClick={() => {
            if (!clientId) {
              onError?.(new Error("Google login is not configured"));
              return;
            }
            onError?.(new Error("Google login failed to initialize"));
          }}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
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
