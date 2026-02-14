import { useCallback, useEffect, useRef, useState } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false
}) {
  const initializedRef = useRef(false);
  const buttonHostRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
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
  }, []);

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
      onErrorRef.current?.(new Error("Failed to load Google script"));
    document.body.appendChild(script);
  }, [initializeGoogle]);

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
            onErrorRef.current?.(
              new Error("Select city and accept terms first")
            )
          }
          className="absolute inset-0 w-full h-full rounded-xl cursor-not-allowed bg-transparent"
          aria-label="Complete city and terms before Google login"
          title="Select city and accept terms first"
        />
      )}
    </div>
  );
}
