import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { fetchOptions } from "../../services/options";
import { getSession } from "../../services/auth";
import { updateSession } from "../../services/storage";

export default function BuyerProfile() {
  const navigate = useNavigate();
  const session = getSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  const [profile, setProfile] = useState({
    city: "",
    preferredCurrency: "INR"
  });
  const [rating, setRating] = useState({ avg: 0, count: 0 });

  useEffect(() => {
    if (!session || !session.token) {
      navigate("/buyer/login");
      return;
    }

    fetchOptions()
      .then((data) => {
        setCities(data.cities || []);
        setCurrencies(data.currencies || []);
      })
      .catch(() => {});

    api
      .get("/buyer/profile")
      .then((res) => {
        setProfile({
          city: res.data?.city || session.city || "",
          preferredCurrency:
            res.data?.preferredCurrency ||
            session.preferredCurrency ||
            "INR"
        });
      })
      .catch(() => {
        setProfile({
          city: session.city || "",
          preferredCurrency: session.preferredCurrency || "INR"
        });
      })
      .finally(() => setLoading(false));

    if (session?._id) {
      api
        .get(`/reviews/user/${session._id}/average`)
        .then((res) => setRating(res.data || { avg: 0, count: 0 }))
        .catch(() => {});
    }
  }, [navigate, session]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.post("/buyer/profile", {
        city: profile.city,
        preferredCurrency: profile.preferredCurrency
      });
      updateSession({
        city: res.data?.city || profile.city,
        preferredCurrency:
          res.data?.preferredCurrency || profile.preferredCurrency
      });
      alert("Buyer profile updated");
    } catch {
      alert("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-shell">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h1 className="page-hero">Buyer Profile</h1>
          <button
            onClick={() => navigate("/buyer/dashboard")}
            className="btn-secondary w-auto px-4"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {loading ? (
            <div className="text-gray-500">Loading profile...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600">Your Rating</p>
                <p className="text-lg font-semibold">
                  {rating.avg.toFixed(1)} stars ({rating.count})
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">City</label>
                <select
                  value={profile.city}
                  onChange={(e) =>
                    setProfile({ ...profile, city: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                >
                  <option value="">Select city</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Currency</label>
                <select
                  value={profile.preferredCurrency}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      preferredCurrency: e.target.value
                    })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                >
                  {(currencies.length ? currencies : ["INR"]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="btn-primary w-full"
                >
                  {saving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
