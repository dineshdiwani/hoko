import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";

export default function SellerDashboard() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState([]);
  const [session, setSession] = useState(null);

  const cityFromUrl = searchParams.get("city") || "";

  useEffect(() => {
    const userSession = getSession();
    setSession(userSession);
    
    if (cityFromUrl && userSession?.token) {
      api.put("/user/profile", { city: cityFromUrl }).catch(() => {});
    }
  }, [cityFromUrl]);

  useEffect(() => {
    if (!session?.token) {
      setLoading(false);
      return;
    }

    async function fetchRequirements() {
      try {
        const cityParam = cityFromUrl ? `?city=${encodeURIComponent(cityFromUrl)}` : "";
        const res = await api.get(`/meta/requirements${cityParam}`);
        setRequirements(res.data?.slice(0, 20) || []);
      } catch (err) {
        console.log("Failed to fetch requirements:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRequirements();
  }, [session, cityFromUrl]);

  if (!session?.token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 p-4">
        <div className="max-w-md mx-auto text-center py-20">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Seller Dashboard</h1>
          <p className="text-gray-600 mb-6">Please log in to view requirements</p>
          <a href="/seller/login" className="btn-brand px-6 py-3 rounded-xl inline-block">
            Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Seller Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Welcome, {session?.name || "Seller"}
                {cityFromUrl && <span className="ml-2"> • {cityFromUrl}</span>}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                Seller
              </span>
            </div>
          </div>
        </div>

        {/* Requirements List */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Latest Requirements
            {cityFromUrl && <span className="text-gray-500 text-base font-normal"> in {cityFromUrl}</span>}
          </h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-3"></div>
              <p className="text-gray-600">Loading requirements...</p>
            </div>
          ) : requirements.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No requirements found{cityFromUrl ? ` in ${cityFromUrl}` : ""}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requirements.map((req) => (
                <div
                  key={req._id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">{req.product || "Product"}</h3>
                    <span className="text-sm text-gray-500">{req.category || "General"}</span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    {req.city && <p>📍 {req.city}</p>}
                    {req.quantity && <p>📦 Qty: {req.quantity} {req.unit || ""}</p>}
                    {req.makeBrand && <p>🏷️ {req.makeBrand}</p>}
                  </div>
                  <a
                    href={`/seller/deeplink/${req._id}${cityFromUrl ? `?city=${encodeURIComponent(cityFromUrl)}` : ""}`}
                    className="mt-3 block w-full text-center btn-brand py-2 rounded-lg"
                  >
                    Submit Offer
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}