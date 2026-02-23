import { useNavigate, useLocation } from "react-router-dom";

export default function AdminNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname === "/admin/dashboard";
  const isAnalytics = location.pathname === "/admin/analytics";
  const isWhatsApp = location.pathname === "/admin/whatsapp";
  const isOperations = location.pathname === "/admin/operations";

  function handleAdminLogout() {
    localStorage.removeItem("admin_token");
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => navigate("/admin/dashboard")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isDashboard ? "ui-btn-primary" : "ui-btn-secondary"
        }`}
      >
        Dashboard
      </button>
      <button
        onClick={() => navigate("/admin/analytics")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isAnalytics ? "ui-btn-primary" : "ui-btn-secondary"
        }`}
      >
        Analytics
      </button>
      <button
        onClick={() => navigate("/admin/whatsapp")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isWhatsApp ? "ui-btn-primary" : "ui-btn-secondary"
        }`}
      >
        WhatsApp
      </button>
      <button
        onClick={() => navigate("/admin/operations")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isOperations ? "ui-btn-primary" : "ui-btn-secondary"
        }`}
      >
        Operations
      </button>
      <button
        onClick={handleAdminLogout}
        className="ui-btn-secondary ui-btn-danger px-3 py-2 text-sm rounded-lg"
      >
        Logout
      </button>
    </div>
  );
}
