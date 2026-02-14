import { useEffect, useRef } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false
}) {
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const initializedRef = useRef(false);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      onErrorRef.current?.(new Error("Missing VITE_GOOGLE_CLIENT_ID"));
      return;
    }

    function initAndPrompt() {
      if (!window.google?.accounts?.id) return;
      if (!initializedRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              onSuccessRef.current?.(response.credential);
            } else {
              onErrorRef.current?.(response);
            }
          },
          auto_select: false,
          itp_support: true,
          use_fedcm_for_prompt: true
        });
        initializedRef.current = true;
      }
      if (disabled) {
        window.google.accounts.id.cancel();
      } else {
        window.google.accounts.id.prompt((notification) => {
          if (
            notification?.isNotDisplayed?.() ||
            notification?.isSkippedMoment?.()
          ) {
            onErrorRef.current?.(notification);
          }
        });
      }
    }

    if (window.google?.accounts?.id) {
      initAndPrompt();
    } else {
      const existing = document.querySelector(
        "script[data-google-identity]"
      );
      if (existing) {
        existing.addEventListener("load", initAndPrompt, {
          once: true
        });
      } else {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = "true";
        script.onload = initAndPrompt;
        script.onerror = () =>
          onErrorRef.current?.(new Error("Failed to load Google GSI script"));
        document.body.appendChild(script);
      }
    }

    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [disabled]);

  return null;
}
