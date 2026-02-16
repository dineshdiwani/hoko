import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/adminApi";

/* Charts */
import KPIBarChart from "../../components/Charts/KPIBarChart";
import CityChart from "../../components/Charts/CityChart";
import CategoryPie from "../../components/Charts/CategoryPie";

export default function AdminAnalytics() {
  const [overview, setOverview] = useState(null);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/admin/analytics/overview").then(res => setOverview(res.data));
    api.get("/admin/analytics/cities").then(res => setCities(res.data));
    api.get("/admin/analytics/categories").then(res => setCategories(res.data));
  }, []);

  const handleAdminLogout = () => {
    localStorage.removeItem("admin_token");
    navigate("/admin/login", { replace: true });
  };

  if (!overview) {
    return (
      <div className="page">
        <div className="page-shell pt-20 md:pt-10">Loading analytics...</div>
      </div>
    );
  }

  const kpiData = [
    { name: "Users", value: overview.totalUsers },
    { name: "Buyers", value: overview.totalBuyers },
    { name: "Sellers", value: overview.totalSellers },
    { name: "Requirements", value: overview.totalRequirements },
    { name: "Offers", value: overview.totalOffers }
  ];

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Admin Analytics</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/admin/dashboard")}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              Dashboard
            </button>
            <button
              onClick={handleAdminLogout}
              className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat title="Total Users" value={overview.totalUsers} />
          <Stat title="Buyers" value={overview.totalBuyers} />
          <Stat title="Sellers" value={overview.totalSellers} />
          <Stat title="Approved Sellers" value={overview.approvedSellers} />
          <Stat title="Requirements" value={overview.totalRequirements} />
          <Stat title="Offers" value={overview.totalOffers} />
          <Stat title="Avg Offers / Req" value={overview.avgOffersPerRequirement} />
          <Stat title="Pending Sellers" value={overview.pendingSellers} />
        </div>

        {/* KPI BAR CHART */}
        <div className="border rounded-2xl p-3 bg-white mb-6 shadow-sm">
          <h2 className="font-semibold text-sm mb-2">Platform KPIs</h2>
          <KPIBarChart data={kpiData} />
        </div>

        {/* CITY + CATEGORY */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-2xl p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">City-wise Demand</h2>
            <CityChart data={cities} />
          </div>

          <div className="border rounded-2xl p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">Category-wise Demand</h2>
            <CategoryPie data={categories} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small Components ---------- */

function Stat({ title, value }) {
  return (
    <div className="border rounded-2xl p-3 text-center bg-white shadow-sm">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
