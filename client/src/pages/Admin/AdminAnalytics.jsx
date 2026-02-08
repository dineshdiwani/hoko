import { useEffect, useState } from "react";
import api from "../../services/api";

/* Charts */
import KPIBarChart from "../../components/charts/KPIBarChart";
import CityChart from "../../components/charts/CityChart";
import CategoryPie from "../../components/charts/CategoryPie";

export default function AdminAnalytics() {
  const [overview, setOverview] = useState(null);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/admin/analytics/overview").then(res => setOverview(res.data));
    api.get("/admin/analytics/cities").then(res => setCities(res.data));
    api.get("/admin/analytics/categories").then(res => setCategories(res.data));
  }, []);

  if (!overview) {
    return <div className="p-6">Loading analytics…</div>;
  }

  const kpiData = [
    { name: "Users", value: overview.totalUsers },
    { name: "Buyers", value: overview.totalBuyers },
    { name: "Sellers", value: overview.totalSellers },
    { name: "Requirements", value: overview.totalRequirements },
    { name: "Offers", value: overview.totalOffers }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Analytics</h1>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
      <div className="border rounded p-4 bg-white mb-8">
        <h2 className="font-bold mb-2">Platform KPIs</h2>
        <KPIBarChart data={kpiData} />
      </div>

      {/* CITY + CATEGORY */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-4 bg-white">
          <h2 className="font-bold mb-2">City-wise Demand</h2>
          <CityChart data={cities} />
        </div>

        <div className="border rounded p-4 bg-white">
          <h2 className="font-bold mb-2">Category-wise Demand</h2>
          <CategoryPie data={categories} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Small Components ---------- */

function Stat({ title, value }) {
  return (
    <div className="border rounded p-4 text-center bg-white shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
