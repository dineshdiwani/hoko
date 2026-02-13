import { useEffect, useState } from "react";
import { resolveConfirm } from "../utils/dialogs";

export default function AppDialog() {
  const [alertState, setAlertState] = useState({
    open: false,
    title: "",
    message: ""
  });
  const [confirmState, setConfirmState] = useState({
    open: false,
    id: null,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel"
  });

  useEffect(() => {
    function onAlert(event) {
      const detail = event.detail || {};
      setAlertState({
        open: true,
        title: detail.title || "Notice",
        message: detail.message || ""
      });
    }

    function onConfirm(event) {
      const detail = event.detail || {};
      setConfirmState({
        open: true,
        id: detail.id,
        title: detail.title || "Confirm",
        message: detail.message || "",
        confirmText: detail.confirmText || "Confirm",
        cancelText: detail.cancelText || "Cancel"
      });
    }

    window.addEventListener("app-alert", onAlert);
    window.addEventListener("app-confirm", onConfirm);
    return () => {
      window.removeEventListener("app-alert", onAlert);
      window.removeEventListener("app-confirm", onConfirm);
    };
  }, []);

  return (
    <>
      {alertState.open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-center">
            <h3 className="text-lg font-bold text-indigo-700 mb-2">
              {alertState.title}
            </h3>
            <p className="text-gray-700 mb-6">
              {alertState.message}
            </p>
            <button
              className="btn-primary w-full"
              onClick={() =>
                setAlertState((prev) => ({ ...prev, open: false }))
              }
            >
              OK
            </button>
          </div>
        </div>
      )}

      {confirmState.open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-indigo-700 mb-2">
              {confirmState.title}
            </h3>
            <p className="text-gray-700 mb-6">
              {confirmState.message}
            </p>
            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  resolveConfirm(confirmState.id, false);
                  setConfirmState((prev) => ({ ...prev, open: false }));
                }}
              >
                {confirmState.cancelText}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  resolveConfirm(confirmState.id, true);
                  setConfirmState((prev) => ({ ...prev, open: false }));
                }}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
