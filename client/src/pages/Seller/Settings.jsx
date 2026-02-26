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
  const [busyAction, setBusyAction] = useState("");
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [profile, setProfile] = useState({
    email: "",
    mobile: "",
    businessName: "",
    registrationDetails: "",
    businessAddress: "",
    ownerName: "",
    firmName: "",
    city: "",
    categories: [],
    website: "",
    taxId: ""
  });
  const [terms, setTerms] = useState({
    acceptedAt: "",
    versionDate: ""
  });
  const [loginMethods, setLoginMethods] = useState({
    otp: true,
    google: false
  });
  const [prefs, setPrefs] = useState({
    notificationsLeads: true,
    notificationsAuction: true,
    notificationsOffers: true,
    availabilityDays: "Mon-Sat",
    availabilityHours: "10:00-19:00",
    termsAcceptedAt:
      localStorage.getItem("terms_accepted_at") || ""
  });
  const categoriesRef = useRef(null);
  const normalizeCategory = (value) =>
    String(value || "").toLowerCase().trim();
  const dedupeCategories = (items) =>
    Array.from(
      new Set(
        (Array.isArray(items) ? items : [])
          .map((item) => normalizeCategory(item))
          .filter(Boolean)
      )
    );
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
        const uniqueCategories = dedupeCategories(normalizedCategories);
        setProfile({
          email: res.data?.email || session?.email || "",
          mobile: res.data?.mobile || "",
          businessName:
            sellerProfile.businessName || sellerProfile.firmName || "",
          registrationDetails: sellerProfile.registrationDetails || "",
          businessAddress: sellerProfile.businessAddress || "",
          ownerName: sellerProfile.ownerName || "",
          firmName: sellerProfile.firmName || "",
          city: res.data?.city || session?.city || "",
          categories: uniqueCategories,
          website: sellerProfile.website || "",
          taxId: sellerProfile.taxId || ""
        });
        setTerms({
          acceptedAt:
            res.data?.terms?.acceptedAt ||
            localStorage.getItem("terms_accepted_at") ||
            "",
          versionDate: res.data?.terms?.versionDate || ""
        });
        setLoginMethods({
          otp: true,
          google: Boolean(res.data?.loginMethods?.google)
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
    if (!/\S+@\S+\.\S+/.test(String(profile.email || ""))) {
      alert("Please enter a valid email");
      return;
    }
    if (!String(profile.mobile || "").trim()) {
      alert("Please enter mobile number");
      return;
    }
    setSaving(true);
    try {
      const uniqueCategories = dedupeCategories(profile.categories);
      await api.post("/seller/profile", {
        email: profile.email,
        mobile: profile.mobile,
        businessName: profile.businessName,
        registrationDetails: profile.registrationDetails,
        businessAddress: profile.businessAddress,
        ownerName: profile.ownerName,
        firmName: profile.firmName || profile.businessName,
        city: profile.city,
        categories: uniqueCategories,
        website: profile.website,
        taxId: profile.taxId
      });
      setProfile((prev) => ({ ...prev, categories: uniqueCategories }));
      setSellerDashboardCategories(uniqueCategories);
      updateSettings({ seller: prefs });
      alert("Settings saved");
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  async function deleteAccountPermanently() {
    const confirmText = window.prompt('Type "DELETE" to permanently delete your account');
    if (confirmText !== "DELETE") return;
    setBusyAction("delete-account");
    try {
      await api.delete("/seller/account");
      logout(navigate);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete account");
      setBusyAction("");
    }
  }

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
                  Email *
                </span>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      email: e.target.value
                    })
                  }
                  placeholder="Enter email"
                  className="w-full border rounded-xl px-4 py-3"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Business/Firm/Company Name
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
                  Mobile Number *
                </span>
                <input
                  type="tel"
                  value={profile.mobile}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      mobile: e.target.value
                    })
                  }
                  placeholder="Enter mobile number"
                  className="w-full border rounded-xl px-4 py-3"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  Owner/Manager/Sale Representative Name
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
                  Business/Firm/Company Address
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
                  Tax ID (GST etc)
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
                className="inline-flex w-auto max-w-full items-center gap-2 border rounded-xl px-4 py-2 text-sm text-left bg-white"
              >
                {profile.categories.length
                  ? `${profile.categories.length} categories selected`
                  : "Select categories"}
                <span className="text-xs text-gray-500">v</span>
              </button>

              {categoriesOpen && (
                <div className="absolute z-20 mt-2 w-max min-w-[220px] max-h-60 overflow-auto rounded-xl border bg-white p-2 shadow-lg">
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
            <h2 className="text-lg font-semibold mb-3">Account</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => logout(navigate)}
                className="btn-secondary"
              >
                Logout
              </button>
              <button
                onClick={deleteAccountPermanently}
                disabled={busyAction === "delete-account"}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-300 text-red-700 bg-white hover:bg-red-50"
              >
                {busyAction === "delete-account"
                  ? "Deleting..."
                  : "Delete Account Permanently"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Login methods: OTP{loginMethods.google ? " + Google" : ""}
            </p>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Terms</h2>
            <p className="text-sm text-gray-600">
              Accepted at:{" "}
              {terms.acceptedAt
                ? new Date(terms.acceptedAt).toLocaleString()
                : "Not recorded"}
            </p>
            <p className="text-sm text-gray-600">
              Current T&C version date:{" "}
              {terms.versionDate
                ? new Date(terms.versionDate).toLocaleString()
                : "Not available"}
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

