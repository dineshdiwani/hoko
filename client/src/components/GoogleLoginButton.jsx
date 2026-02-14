import { useEffect, useRef } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false
}) {
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const initializedRef = useRef(false);
  const buttonHostRef = useRef(null);

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
          itp_support: true
        });
        if (buttonHostRef.current) {
          buttonHostRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(
            buttonHostRef.current,
            {
              theme: "outline",
              size: "large",
              shape: "rectangular",
              text: "continue_with",
              width: 320
            }
          );
        }
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

    function handleVisibilityOrFocus() {
      if (!disabled && document.visibilityState === "visible") {
        initAndPrompt();
      }
    }
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityOrFocus
    );

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityOrFocus
      );
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [disabled]);

  return (
    <div className="mt-3 flex justify-center">
      <div ref={buttonHostRef} />
    </div>
  );
}
