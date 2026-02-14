import { useCallback, useEffect, useRef, useState } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false
}) {
  const initializedRef = useRef(false);
  const buttonHostRef = useRef(null);
  const [googleReady, setGoogleReady] = useState(false);

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
    if (buttonHostRef.current) {
      buttonHostRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonHostRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 360
      });
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

  return (
    <div className={`w-full mt-3 relative ${disabled ? "opacity-70" : ""}`}>
      <div ref={buttonHostRef} className="flex justify-center" />
      {!googleReady && (
        <div className="text-xs text-gray-500 text-center mt-2">
          Loading Google login...
        </div>
      )}
      {disabled && (
        <button
          type="button"
          onClick={() =>
            onError?.(new Error("Select city and accept terms first"))
          }
          className="absolute inset-0 w-full h-full rounded-xl cursor-not-allowed bg-transparent"
          aria-label="Complete city and terms before Google login"
          title="Select city and accept terms first"
        />
      )}
    </div>
  );
}
