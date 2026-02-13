import { useEffect, useState } from "react";
import api from "../../utils/adminApi";

export default function AdminDashboard() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    api.get("/admin/stats").then((res) => setStats(res.data));
  }, []);

  return (
    <div className="page">
      <div className="page-shell">
        <h1 className="page-hero mb-4">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm border">
            <p className="text-xs text-gray-500">Reviews</p>
            <p className="text-lg font-bold">{stats.reviews}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border">
            <p className="text-xs text-gray-500">Messages</p>
            <p className="text-lg font-bold">{stats.messages}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
