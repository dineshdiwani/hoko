import { useEffect } from "react";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  disabled = false
}) {
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    function initAndPrompt() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.cancel();
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
      if (!disabled) {
        window.google.accounts.id.prompt();
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
        script.onerror = onError;
        document.body.appendChild(script);
      }
    }

    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [onSuccess, onError, disabled]);

  return null;
}
