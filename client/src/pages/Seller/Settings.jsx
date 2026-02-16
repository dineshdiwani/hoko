import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import {
  getSettings,
  updateSettings,
  setSellerDashboardCategories
} from "../../services/storage";

export default function SellerSettings() {
  const navigate = useNavigate();
  const [session] = useState(() => getSession());
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [profile, setProfile] = useState({
    businessName: "",
    registrationDetails: "",
    businessAddress: "",
    ownerName: "",
    firmName: "",
    managerName: "",
    city: "",
    categories: [],
    website: "",
    taxId: ""
  });
  const [prefs, setPrefs] = useState({
    notificationsLeads: true,
    notificationsAuction: true,
    notificationsOffers: true,
    availabilityDays: "Mon-Sat",
    availabilityHours: "10:00-19:00",
    payoutUpi: "",
    payoutBank: "",
    termsAcceptedAt:
      localStorage.getItem("terms_accepted_at") || ""
  });
  const categoriesRef = useRef(null);
  const normalizeCategory = (value) =>
    String(value || "").toLowerCase().trim();
  const getCategoryLabel = (option) => {
    if (typeof option === "string") return option.trim();
    if (option && typeof option === "object") {
      return String(option.label || option.name || option.value || "")
        .trim();
    }
    return "";
  };

  useEffect(() => {
    if (!session?.token) {
      navigate("/seller/login");
      return;
    }

    fetchOptions()
      .then((data) => {
        setCities(data.cities || []);
        setCategories(data.categories || []);
      })
      .catch(() => {});

    api
      .get("/seller/profile")
      .then((res) => {
        const sellerProfile = res.data?.sellerProfile || {};
        const rawCategories = sellerProfile.categories;
        const normalizedCategories = Array.isArray(rawCategories)
          ? rawCategories
              .map((c) => normalizeCategory(c))
              .filter(Boolean)
          : String(rawCategories || "")
              .split(",")
              .map((c) => normalizeCategory(c))
              .filter(Boolean);
        setProfile({
          businessName:
            sellerProfile.businessName || sellerProfile.firmName || "",
          registrationDetails: sellerProfile.registrationDetails || "",
          businessAddress: sellerProfile.businessAddress || "",
          ownerName: sellerProfile.ownerName || "",
          firmName: sellerProfile.firmName || "",
          managerName: sellerProfile.managerName || "",
          city: res.data?.city || session?.city || "",
          categories: normalizedCategories,
          website: sellerProfile.website || "",
          taxId: sellerProfile.taxId || ""
        });
      })
      .catch(() => {});

    const stored = getSettings();
    setPrefs((prev) => ({
      ...prev,
      ...(stored.seller || {})
    }));
  }, [navigate, session?.token]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        categoriesRef.current &&
        !categoriesRef.current.contains(event.target)
      ) {
        setCategoriesOpen(false);
      }
    }
    if (categoriesOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [categoriesOpen]);

  const toggleCategory = (cat) => {
    const normalized = normalizeCategory(cat);
    setProfile((prev) => ({
      ...prev,
      categories: (Array.isArray(prev.categories) ? prev.categories : []).includes(normalized)
        ? (Array.isArray(prev.categories) ? prev.categories : []).filter((c) => c !== normalized)
        : [...(Array.isArray(prev.categories) ? prev.categories : []), normalized]
    }));
  };

  const rawCategoryOptions = categories.length
    ? categories
    : ["Electronics", "Grocery", "Services", "Construction"];
  const categoryOptions = rawCategoryOptions
    .map((option) => {
      const label = getCategoryLabel(option);
      return { label, value: normalizeCategory(label) };
    })
    .filter((option) => option.value)
    .filter(
      (option, index, arr) =>
        arr.findIndex((item) => item.value === option.value) === index
    );

  const selectedCategoryNames = categoryOptions.filter((cat) =>
    profile.categories.includes(cat.value)
  );

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post("/seller/profile", {
        businessName: profile.businessName,
        registrationDetails: profile.registrationDetails,
        businessAddress: profile.businessAddress,
        ownerName: profile.ownerName,
        firmName: profile.firmName || profile.businessName,
        managerName: profile.managerName,
        city: profile.city,
        categories: profile.categories,
        website: profile.website,
        taxId: profile.taxId
      });
      setSellerDashboardCategories(profile.categories);
      updateSettings({ seller: prefs });
      alert("Settings saved");
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-shell">
        <div className="flex items-center justify-between mb-6">
          <h1 className="page-hero">Settings</h1>
          <button
            onClick={() => navigate("/seller/dashboard")}
            className="btn-secondary w-auto px-4"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 divide-y">
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Business Profile
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Business Name
                </span>
                <input
                  value={profile.businessName}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      businessName: e.target.value
                    })
                  }
                  placeholder="Enter business name"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Owner Name
                </span>
                <input
                  value={profile.ownerName}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      ownerName: e.target.value
                    })
                  }
                  placeholder="Enter owner name"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Manager Name
                </span>
                <input
                  value={profile.managerName}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      managerName: e.target.value
                    })
                  }
                  placeholder="Enter manager name"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  City
                </span>
                <select
                  value={profile.city}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      city: e.target.value
                    })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                >
                  <option value="">Select city</option>
                  {(cities.length
                    ? cities
                    : ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune"]
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2 block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Business Address
                </span>
                <input
                  value={profile.businessAddress}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      businessAddress: e.target.value
                    })
                  }
                  placeholder="Enter business address"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="md:col-span-2 block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Registration Details
                </span>
                <input
                  value={profile.registrationDetails}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      registrationDetails: e.target.value
                    })
                  }
                  placeholder="Enter registration details"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Website
                </span>
                <input
                  value={profile.website}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      website: e.target.value
                    })
                  }
                  placeholder="Enter website URL"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Tax ID
                </span>
                <input
                  value={profile.taxId}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      taxId: e.target.value
                    })
                  }
                  placeholder="Enter tax ID"
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">
              Categories You Deal In
            </h2>
            <div ref={categoriesRef} className="relative">
              <button
                type="button"
                onClick={() => setCategoriesOpen((prev) => !prev)}
                className="w-full border rounded-xl px-4 py-3 text-sm text-left bg-white"
              >
                {profile.categories.length
                  ? `${profile.categories.length} categories selected`
                  : "Select categories"}
              </button>

              {categoriesOpen && (
                <div className="absolute z-20 mt-2 w-full max-h-60 overflow-auto rounded-xl border bg-white p-2 shadow-lg">
                  {categoryOptions.map((cat) => {
                    const checked = profile.categories.includes(cat.value);
                    return (
                      <label
                        key={cat.value}
                        className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(cat.value)}
                        />
                        <span>{cat.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedCategoryNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCategoryNames.map((cat) => (
                  <span
                    key={cat.value}
                    className="px-3 py-1 rounded-full text-xs border border-gray-200 bg-gray-50"
                  >
                    {cat.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">
              Notification Preferences
            </h2>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.notificationsLeads}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      notificationsLeads: e.target.checked
                    })
                  }
                />
                New leads
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.notificationsAuction}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      notificationsAuction: e.target.checked
                    })
                  }
                />
                Auction updates
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.notificationsOffers}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      notificationsOffers: e.target.checked
                    })
                  }
                />
                Offer status
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">
              Availability
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={prefs.availabilityDays}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    availabilityDays: e.target.value
                  })
                }
                placeholder="Days open (e.g., Mon-Sat)"
                className="w-full border rounded-xl px-4 py-3"
              />
              <input
                value={prefs.availabilityHours}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    availabilityHours: e.target.value
                  })
                }
                placeholder="Hours (e.g., 10:00-19:00)"
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">
              Payout Settings
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={prefs.payoutUpi}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    payoutUpi: e.target.value
                  })
                }
                placeholder="UPI ID"
                className="w-full border rounded-xl px-4 py-3"
              />
              <input
                value={prefs.payoutBank}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    payoutBank: e.target.value
                  })
                }
                placeholder="Bank account"
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Account</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/seller/login")}
                className="btn-secondary"
              >
                Change Password
              </button>
              <button
                onClick={() => logout(navigate)}
                className="btn-secondary"
              >
                Logout
              </button>
              <button
                disabled
                className="btn-secondary opacity-60"
              >
                Delete Account (coming soon)
              </button>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Terms</h2>
            <p className="text-sm text-gray-600">
              Accepted:{" "}
              {prefs.termsAcceptedAt
                ? new Date(prefs.termsAcceptedAt).toLocaleString()
                : "Not recorded"}
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

