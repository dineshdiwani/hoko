import { useNavigate, useLocation } from "react-router-dom";

export default function AdminNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname === "/admin/dashboard";
  const isAnalytics = location.pathname === "/admin/analytics";
  const isWhatsApp = location.pathname === "/admin/whatsapp";

  function handleAdminLogout() {
    localStorage.removeItem("admin_token");
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => navigate("/admin/dashboard")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isDashboard ? "btn-primary" : "border border-gray-300 bg-white"
        }`}
      >
        Dashboard
      </button>
      <button
        onClick={() => navigate("/admin/analytics")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isAnalytics ? "btn-primary" : "border border-gray-300 bg-white"
        }`}
      >
        Analytics
      </button>
      <button
        onClick={() => navigate("/admin/whatsapp")}
        className={`px-3 py-2 text-sm rounded-lg ${
          isWhatsApp ? "btn-primary" : "border border-gray-300 bg-white"
        }`}
      >
        WhatsApp
      </button>
      <button
        onClick={handleAdminLogout}
        className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50"
      >
        Logout
      </button>
    </div>
  );
}
