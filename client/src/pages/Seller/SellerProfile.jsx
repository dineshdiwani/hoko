import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { fetchOptions } from "../../services/options";
import { getSession } from "../../services/auth";
import {
  updateSession,
  getSellerDashboardCategories,
  setSellerDashboardCategories
} from "../../services/storage";

export default function SellerProfile() {
  const navigate = useNavigate();
  const session = getSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  const [profile, setProfile] = useState({
    businessName: "",
    registrationDetails: "",
    businessAddress: "",
    ownerName: "",
    firmName: "",
    managerName: "",
    website: "",
    taxId: "",
    city: "",
    preferredCurrency: "INR"
  });
  const [dashboardCategories, setDashboardCategories] = useState(
    []
  );
  const [rating, setRating] = useState({ avg: 0, count: 0 });
  const normalizeCategory = (cat) =>
    String(cat || "").toLowerCase().trim();

  useEffect(() => {
    if (!session || !session.token) {
      navigate("/seller/login");
      return;
    }

    const storedCategories = getSellerDashboardCategories();
    if (storedCategories.length) {
      setDashboardCategories(storedCategories);
    } else {
      try {
        const storedProfile = JSON.parse(
          localStorage.getItem("seller_profile") || "{}"
        );
        if (Array.isArray(storedProfile.categories)) {
          const normalized = storedProfile.categories
            .map((c) => normalizeCategory(c))
            .filter(Boolean);
          if (normalized.length) {
            setDashboardCategories(normalized);
            setSellerDashboardCategories(normalized);
          }
        }
      } catch {}
    }

    fetchOptions()
      .then((data) => {
        setCities(data.cities || []);
        setCategories(data.categories || []);
        setCurrencies(data.currencies || []);
      })
      .catch(() => {});

    api
      .get("/seller/profile")
      .then((res) => {
        const data = res.data || {};
        const sellerProfile = data.sellerProfile || {};
        setProfile({
          businessName: sellerProfile.businessName || "",
          registrationDetails: sellerProfile.registrationDetails || "",
          businessAddress: sellerProfile.businessAddress || "",
          ownerName: sellerProfile.ownerName || "",
          firmName: sellerProfile.firmName || "",
          managerName: sellerProfile.managerName || "",
          website: sellerProfile.website || "",
          taxId: sellerProfile.taxId || "",
          city: data.city || session?.city || "",
          preferredCurrency:
            data.preferredCurrency || session?.preferredCurrency || "INR"
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    if (session?._id) {
      api
        .get(`/reviews/user/${session._id}/average`)
        .then((res) => setRating(res.data || { avg: 0, count: 0 }))
        .catch(() => {});
    }
  }, [navigate, session]);

  const toggleCategory = (cat) => {
    const normalized = normalizeCategory(cat);
    setDashboardCategories((prev) => {
      const next = prev.includes(normalized)
        ? prev.filter((c) => c !== normalized)
        : [...prev, normalized];
      setSellerDashboardCategories(next);
      return next;
    });
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.post("/seller/profile", {
        businessName: profile.businessName,
        registrationDetails: profile.registrationDetails,
        businessAddress: profile.businessAddress,
        ownerName: profile.ownerName,
        firmName: profile.firmName,
        managerName: profile.managerName,
        website: profile.website,
        taxId: profile.taxId,
        city: profile.city,
        preferredCurrency: profile.preferredCurrency
      });

      updateSession({
        city: res.data?.city || profile.city,
        preferredCurrency:
          res.data?.preferredCurrency || profile.preferredCurrency
      });
      alert("Seller profile updated");
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
          <h1 className="page-hero">Seller Profile</h1>
          <button
            onClick={() => navigate("/seller/dashboard")}
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
                <label className="text-sm text-gray-600">
                  Registered Business Name
                </label>
                <input
                  value={profile.businessName}
                  onChange={(e) =>
                    setProfile({ ...profile, businessName: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Business Registration Details
                </label>
                <input
                  value={profile.registrationDetails}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      registrationDetails: e.target.value
                    })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">
                  Business Address
                </label>
                <input
                  value={profile.businessAddress}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      businessAddress: e.target.value
                    })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Manager / Owner Name
                </label>
                <input
                  value={profile.ownerName}
                  onChange={(e) =>
                    setProfile({ ...profile, ownerName: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Brand / Firm</label>
                <input
                  value={profile.firmName}
                  onChange={(e) =>
                    setProfile({ ...profile, firmName: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Manager Name (Optional)
                </label>
                <input
                  value={profile.managerName}
                  onChange={(e) =>
                    setProfile({ ...profile, managerName: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Website</label>
                <input
                  value={profile.website}
                  onChange={(e) =>
                    setProfile({ ...profile, website: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Tax Identification Number
                </label>
                <input
                  value={profile.taxId}
                  onChange={(e) =>
                    setProfile({ ...profile, taxId: e.target.value })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
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
                <label className="text-sm text-gray-600 mb-1 block">
                  Dashboard categories (local only)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  These control which buyer posts appear in your seller
                  dashboard.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(categories.length
                    ? categories
                    : ["Electronics", "Grocery", "Services", "Construction"]
                  ).map((cat) => (
                    (() => {
                      const normalized = normalizeCategory(cat);
                      const checked =
                        dashboardCategories.includes(normalized);
                      return (
                    <label
                      key={cat}
                      className={`border p-2 rounded cursor-pointer text-sm ${
                        checked
                          ? "btn-brand"
                          : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => toggleCategory(cat)}
                      />
                      {cat}
                    </label>
                      );
                    })()
                  ))}
                </div>
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

