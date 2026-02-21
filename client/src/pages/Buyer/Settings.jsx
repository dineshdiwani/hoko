import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import {
  getSettings,
  updateSettings,
  updateSession
} from "../../services/storage";

const DEFAULT_PREFS = {
  hideProfileUntilApproved: true,
  chatOnlyAfterOfferAcceptance: true,
  postAutoExpiryDays: 30,
  documentAutoDeleteDays: 30,
  notificationToggles: {
    pushEnabled: true,
    newOffer: true,
    chat: true,
    statusUpdate: true,
    reminder: true
  }
};

export default function BuyerSettings() {
  const navigate = useNavigate();
  const [session] = useState(() => getSession());
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [cities, setCities] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    mobile: "",
    city: "",
    preferredCurrency: "INR",
    roles: { buyer: true, seller: false, admin: false },
    loginMethods: { otp: true, google: false }
  });
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [terms, setTerms] = useState({
    acceptedAt: "",
    versionDate: ""
  });
  const [itemDeleteForm, setItemDeleteForm] = useState({
    type: "post",
    id: ""
  });

  useEffect(() => {
    if (!session?.token) {
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
        const data = res.data || {};
        setProfile({
          name: data.name || "",
          email: data.email || session.email || "",
          mobile: data.mobile || "",
          city: data.city || session.city || "",
          preferredCurrency:
            data.preferredCurrency || session.preferredCurrency || "INR",
          roles: data.roles || { buyer: true, seller: false, admin: false },
          loginMethods: data.loginMethods || { otp: true, google: false }
        });
        setPrefs({
          ...DEFAULT_PREFS,
          ...(data.buyerSettings || {}),
          notificationToggles: {
            ...DEFAULT_PREFS.notificationToggles,
            ...(data.buyerSettings?.notificationToggles || {})
          }
        });
        setTerms({
          acceptedAt: data.terms?.acceptedAt || localStorage.getItem("terms_accepted_at") || "",
          versionDate: data.terms?.versionDate || ""
        });
      })
      .catch(() => {
        const stored = getSettings();
        setPrefs((prev) => ({
          ...prev,
          ...(stored.buyer || {}),
          notificationToggles: {
            ...prev.notificationToggles,
            ...(stored?.buyer?.notificationToggles || {})
          }
        }));
      });

  }, [navigate, session?.token, session?._id]);

  function updatePrefs(partial) {
    setPrefs((prev) => ({ ...prev, ...partial }));
  }
  function updateNotificationToggle(key, value) {
    setPrefs((prev) => ({
      ...prev,
      notificationToggles: {
        ...DEFAULT_PREFS.notificationToggles,
        ...(prev.notificationToggles || {}),
        [key]: Boolean(value)
      }
    }));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const payload = {
        name: profile.name,
        mobile: profile.mobile,
        city: profile.city,
        preferredCurrency: profile.preferredCurrency,
        buyerSettings: {
          ...prefs,
          notificationToggles: {
            ...DEFAULT_PREFS.notificationToggles,
            ...(prefs.notificationToggles || {}),
            pushEnabled: Boolean(prefs.notificationToggles?.pushEnabled),
            newOffer: Boolean(prefs.notificationToggles?.newOffer),
            chat: Boolean(prefs.notificationToggles?.chat),
            statusUpdate: Boolean(prefs.notificationToggles?.statusUpdate),
            reminder: Boolean(prefs.notificationToggles?.reminder)
          }
        }
      };
      const res = await api.post("/buyer/profile", payload);
      const data = res.data || {};
      setProfile((prev) => ({
        ...prev,
        name: data.name || prev.name,
        email: data.email || prev.email,
        mobile: data.mobile || prev.mobile,
        city: data.city || prev.city,
        preferredCurrency: data.preferredCurrency || prev.preferredCurrency,
        roles: data.roles || prev.roles,
        loginMethods: data.loginMethods || prev.loginMethods
      }));
      setTerms((prev) => ({
        ...prev,
        acceptedAt: data.terms?.acceptedAt || prev.acceptedAt
      }));
      updateSession({
        name: data.name || profile.name,
        city: data.city || profile.city,
        preferredCurrency: data.preferredCurrency || profile.preferredCurrency
      });
      updateSettings({ buyer: prefs });
      alert("Settings saved");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleSwitch() {
    setBusyAction("switch-role");
    try {
      const res = await api.post("/auth/switch-role", { role: "seller" });
      const user = res?.data?.user || {};
      updateSession({
        role: user.role || "seller",
        roles: user.roles || profile.roles,
        city: user.city || profile.city,
        preferredCurrency: user.preferredCurrency || profile.preferredCurrency
      });
      navigate("/seller/dashboard");
    } catch (err) {
      const message = err?.response?.data?.message || "";
      if (message === "Seller onboarding required" || message === "Role not enabled") {
        navigate("/seller/register");
        return;
      }
      alert(message || "Unable to switch role");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteIndividualItem() {
    if (!itemDeleteForm.id.trim()) {
      alert("Please enter item id");
      return;
    }
    const ok = window.confirm("Delete this item permanently?");
    if (!ok) return;
    setBusyAction("delete-item");
    try {
      await api.delete(`/buyer/items/${itemDeleteForm.type}/${itemDeleteForm.id.trim()}`);
      setItemDeleteForm((prev) => ({ ...prev, id: "" }));
      alert("Item deleted");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete item");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteAccountPermanently() {
    const confirmText = window.prompt('Type "DELETE" to permanently delete your account');
    if (confirmText !== "DELETE") return;
    setBusyAction("delete-account");
    try {
      await api.delete("/buyer/account");
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
          <h1 className="page-hero">Buyer Settings</h1>
          <button
            onClick={() => navigate("/buyer/dashboard")}
            className="btn-secondary w-auto px-4"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 divide-y">
          <div>
            <h2 className="text-lg font-semibold mb-3">Profile</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm text-gray-600">Name</span>
                <input
                  value={profile.name}
                  onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Email</span>
                <input value={profile.email} disabled className="w-full border rounded-xl px-4 py-3 bg-gray-50" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Mobile (optional)</span>
                <input
                  value={profile.mobile}
                  onChange={(e) => setProfile((prev) => ({ ...prev, mobile: e.target.value }))}
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Default City</span>
                <select
                  value={profile.city}
                  onChange={(e) => setProfile((prev) => ({ ...prev, city: e.target.value }))}
                  className="w-full border rounded-xl px-4 py-3"
                >
                  <option value="">Select city</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Currency</span>
                <select
                  value={profile.preferredCurrency}
                  onChange={(e) => setProfile((prev) => ({ ...prev, preferredCurrency: e.target.value }))}
                  className="w-full border rounded-xl px-4 py-3"
                >
                  {(currencies.length ? currencies : ["INR"]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Role Access</span>
                <input
                  disabled
                  value={
                    profile.roles?.seller
                      ? "Buyer + Seller"
                      : "Buyer only"
                  }
                  className="w-full border rounded-xl px-4 py-3 bg-gray-50"
                />
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Defaults & Privacy</h2>
            <div className="grid gap-2 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.hideProfileUntilApproved}
                  onChange={(e) => updatePrefs({ hideProfileUntilApproved: e.target.checked })}
                />
                Hide profile/contact details until buyer approves
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.chatOnlyAfterOfferAcceptance}
                  onChange={(e) => updatePrefs({ chatOnlyAfterOfferAcceptance: e.target.checked })}
                />
                Chat only after offer acceptance
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Notifications</h2>
            <div className="grid gap-2 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.notificationToggles?.pushEnabled)}
                  onChange={(e) => updateNotificationToggle("pushEnabled", e.target.checked)}
                />
                Push notifications enabled
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.notificationToggles?.newOffer)}
                  onChange={(e) => updateNotificationToggle("newOffer", e.target.checked)}
                />
                New offer alerts
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.notificationToggles?.chat)}
                  onChange={(e) => updateNotificationToggle("chat", e.target.checked)}
                />
                Chat alerts
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.notificationToggles?.statusUpdate)}
                  onChange={(e) => updateNotificationToggle("statusUpdate", e.target.checked)}
                />
                Status update alerts
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.notificationToggles?.reminder)}
                  onChange={(e) => updateNotificationToggle("reminder", e.target.checked)}
                />
                Reminder alerts
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Auto Expiry</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm text-gray-600">Auto-expiry for old posts (days)</span>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={prefs.postAutoExpiryDays}
                  onChange={(e) => updatePrefs({ postAutoExpiryDays: Number(e.target.value || 30) })}
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Auto-delete uploaded docs (days)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={prefs.documentAutoDeleteDays}
                  onChange={(e) => updatePrefs({ documentAutoDeleteDays: Number(e.target.value || 30) })}
                  className="w-full border rounded-xl px-4 py-3"
                />
              </label>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Security & Login</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={handleRoleSwitch}
                disabled={busyAction === "switch-role"}
                className="btn-secondary"
              >
                {busyAction === "switch-role"
                  ? "Switching..."
                  : profile.roles?.seller
                  ? "Switch to Seller"
                  : "Enable Seller Role"}
              </button>
              <button onClick={() => logout(navigate)} className="btn-secondary">
                Logout
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Login methods: OTP{profile.loginMethods.google ? " + Google" : ""}
            </p>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Data Controls</h2>
            <div className="grid gap-3 md:grid-cols-[1fr_2fr] items-end">
              <select
                value={itemDeleteForm.type}
                onChange={(e) => setItemDeleteForm((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full border rounded-xl px-4 py-3"
              >
                <option value="post">Delete Post</option>
                <option value="chat">Delete Chat Message</option>
                <option value="document">Delete Document</option>
              </select>
              <input
                value={itemDeleteForm.id}
                onChange={(e) => setItemDeleteForm((prev) => ({ ...prev, id: e.target.value }))}
                placeholder="Enter item id"
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={deleteIndividualItem}
                disabled={busyAction === "delete-item"}
                className="btn-secondary"
              >
                {busyAction === "delete-item" ? "Deleting..." : "Delete Item"}
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await api.get("/buyer/data-export");
                    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
                      type: "application/json"
                    });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `buyer-data-export-${Date.now()}.json`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch {
                    alert("Failed to export data");
                  }
                }}
                className="btn-secondary"
              >
                Download My Data
              </button>
              <button
                onClick={deleteAccountPermanently}
                disabled={busyAction === "delete-account"}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-300 text-red-700 bg-white hover:bg-red-50"
              >
                {busyAction === "delete-account" ? "Deleting..." : "Delete Account Permanently"}
              </button>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Terms</h2>
            <p className="text-sm text-gray-600">
              Accepted at:{" "}
              {terms.acceptedAt ? new Date(terms.acceptedAt).toLocaleString() : "Not recorded"}
            </p>
            <p className="text-sm text-gray-600">
              Current T&C version date:{" "}
              {terms.versionDate ? new Date(terms.versionDate).toLocaleString() : "Not available"}
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
