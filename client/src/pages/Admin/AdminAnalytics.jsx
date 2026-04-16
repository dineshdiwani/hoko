import { useEffect, useState, Suspense, lazy } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

const KPIBarChart = lazy(() => import("../../components/Charts/KPIBarChart"));
const CityChart = lazy(() => import("../../components/Charts/CityChart"));
const CategoryPie = lazy(() => import("../../components/Charts/CategoryPie"));

function ChartLoader() {
  return <div className="h-48 flex items-center justify-center text-gray-400">Loading chart...</div>;
}

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
          <AdminNav />
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
          <Suspense fallback={<ChartLoader />}><KPIBarChart data={kpiData} /></Suspense>
        </div>

        {/* CITY + CATEGORY */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-2xl p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">City-wise Demand</h2>
            <Suspense fallback={<ChartLoader />}><CityChart data={cities} /></Suspense>
          </div>

          <div className="border rounded-2xl p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">Category-wise Demand</h2>
            <Suspense fallback={<ChartLoader />}><CategoryPie data={categories} /></Suspense>
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
