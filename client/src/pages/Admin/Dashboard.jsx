import { useEffect, useState } from "react";
import api from "../../utils/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    api
      .get("/admin/stats", {
        headers: { "x-role": "admin" },
      })
      .then((res) => setStats(res.data));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-100 p-4 rounded">
          Reviews: {stats.reviews}
        </div>
        <div className="bg-gray-100 p-4 rounded">
          Messages: {stats.messages}
        </div>
      </div>
    </div>
  );
}
