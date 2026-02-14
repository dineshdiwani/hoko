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
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 flex items-center justify-center gap-3 shadow-sm hover:bg-slate-50"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.64 9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0795-1.7959 2.7182v2.2586h2.9086c1.7023-1.5677 2.6837-3.8772 2.6837-6.6177z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.4673-.8059 5.9563-2.1773l-2.9086-2.2586c-.806.5409-1.8377.8591-3.0477.8591-2.3441 0-4.3282-1.5823-5.0364-3.7091H.9573v2.3327C2.4382 15.9832 5.4818 18 9 18z"
              fill="#34A853"
            />
            <path
              d="M3.9636 10.7141c-.18-.5409-.2836-1.1182-.2836-1.7141s.1036-1.1732.2836-1.7141V4.9532H.9573A8.9967 8.9967 0 000 9c0 1.4523.3482 2.8273.9573 4.0468l3.0063-2.3327z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.5768c1.3214 0 2.5077.4541 3.4418 1.3454l2.5814-2.5814C13.4632.891 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9532l3.0063 2.3327C4.6718 5.1591 6.6559 3.5768 9 3.5768z"
              fill="#EA4335"
            />
          </svg>
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
