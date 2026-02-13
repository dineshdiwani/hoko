import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import { getSettings, updateSettings } from "../../services/storage";

export default function BuyerSettings() {
  const navigate = useNavigate();
  const session = getSession();
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [profile, setProfile] = useState({
    city: "",
    preferredCurrency: "INR"
  });
  const [prefs, setPrefs] = useState({
    notificationsEmail: true,
    notificationsInApp: true,
    notificationsSms: false,
    defaultCity: "",
    defaultCategory: "",
    defaultUnit: "",
    hideEmail: false,
    hidePhone: false,
    termsAcceptedAt:
      localStorage.getItem("terms_accepted_at") || ""
  });

  useEffect(() => {
    if (!session?.token) {
      navigate("/buyer/login");
      return;
    }

    fetchOptions()
      .then((data) => {
        setCities(data.cities || []);
        setCategories(data.categories || []);
        setUnits(data.units || []);
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
      });

    const stored = getSettings();
    setPrefs((prev) => ({
      ...prev,
      ...(stored.buyer || {})
    }));
  }, [navigate, session]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post("/buyer/profile", {
        city: profile.city,
        preferredCurrency: profile.preferredCurrency
      });
      updateSettings({ buyer: prefs });
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
            onClick={() => navigate("/buyer/dashboard")}
            className="btn-secondary w-auto px-4"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 divide-y">
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Profile Basics
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
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
                <label className="text-sm text-gray-600">
                  Currency
                </label>
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
                  {(currencies.length ? currencies : ["INR"]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">
              Notification Preferences
            </h2>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.notificationsEmail}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      notificationsEmail: e.target.checked
                    })
                  }
                />
                Email
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.notificationsInApp}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      notificationsInApp: e.target.checked
                    })
                  }
                />
                In-app
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.notificationsSms}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      notificationsSms: e.target.checked
                    })
                  }
                />
                SMS
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">
              Post Defaults
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={prefs.defaultCity || ""}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    defaultCity: e.target.value
                  })
                }
                className="w-full border rounded-xl px-4 py-3"
              >
                <option value="">Default city</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={prefs.defaultCategory || ""}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    defaultCategory: e.target.value
                  })
                }
                className="w-full border rounded-xl px-4 py-3"
              >
                <option value="">Default category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={prefs.defaultUnit || ""}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    defaultUnit: e.target.value
                  })
                }
                className="w-full border rounded-xl px-4 py-3"
              >
                <option value="">Default unit</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Privacy</h2>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.hideEmail}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      hideEmail: e.target.checked
                    })
                  }
                />
                Hide email from sellers
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.hidePhone}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      hidePhone: e.target.checked
                    })
                  }
                />
                Hide phone from sellers
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Account</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/buyer/login")}
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
