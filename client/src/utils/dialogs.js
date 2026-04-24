import { toast as showToast } from "sonner";

export function showAlert(message, title = "Notice") {
  if (typeof window === "undefined") return;
  showToast(message || "", { 
    style: { background: "#333", color: "#fff", borderRadius: "8px" },
    duration: 3000
  });
}
