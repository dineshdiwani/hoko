import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import {
  getSettings,
  updateSettings,
  setSession,
  updateSession,
  setUiCitySelection
} from "../../services/storage";
import {
  buildNotificationHelpText,
  getPushPermissionState,
  getResolvedPushPermissionState,
  requestPushPermissionAndSubscribe
} from "../../services/pushNotifications";

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
  },
  emailNotificationToggles: {
    enabled: true,
    newOffer: true
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
  const [pushPermission, setPushPermission] = useState(() => getPushPermissionState());
  const [contactOtpModal, setContactOtpModal] = useState({ open: false, email: "", mobile: "" });
  const [contactOtp, setContactOtp] = useState("");
  const [contactOtpSending, setContactOtpSending] = useState(false);
  const initialContactRef = useRef({ email: "", mobile: "" });
  const initialProfileRef = useRef({
    name: "",
    city: "",
    preferredCurrency: "INR",
    prefsSignature: ""
  });

  function goToDashboard() {
    localStorage.setItem("buyer_dashboard_force_tab", "posts");
    navigate("/buyer/dashboard?tab=posts", { replace: true });
  }

  function buildPrefsSignature(value) {
    const snapshot = {
      hideProfileUntilApproved: Boolean(value?.hideProfileUntilApproved),
      chatOnlyAfterOfferAcceptance: Boolean(value?.chatOnlyAfterOfferAcceptance),
      postAutoExpiryDays: Number(value?.postAutoExpiryDays || 30),
      documentAutoDeleteDays: Number(value?.documentAutoDeleteDays || 30),
      notificationToggles: {
        pushEnabled: Boolean(value?.notificationToggles?.pushEnabled),
        newOffer: Boolean(value?.notificationToggles?.newOffer),
        chat: Boolean(value?.notificationToggles?.chat),
        statusUpdate: Boolean(value?.notificationToggles?.statusUpdate),
        reminder: Boolean(value?.notificationToggles?.reminder)
      },
      emailNotificationToggles: {
        enabled: Boolean(value?.emailNotificationToggles?.enabled),
        newOffer: Boolean(value?.emailNotificationToggles?.newOffer)
      },
      smsNotificationToggles: {
        enabled: Boolean(value?.smsNotificationToggles?.enabled),
        newOffer: Boolean(value?.smsNotificationToggles?.newOffer)
      }
    };
    return JSON.stringify(snapshot);
  }

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
        initialContactRef.current = {
          email: String(data.email || session.email || "").trim(),
          mobile: String(data.mobile || "").trim()
        };
        setPrefs({
          ...DEFAULT_PREFS,
          ...(data.buyerSettings || {}),
          notificationToggles: {
            ...DEFAULT_PREFS.notificationToggles,
            ...(data.buyerSettings?.notificationToggles || {})
          }
        });
        initialProfileRef.current = {
          name: String(data.name || "").trim(),
          city: String(data.city || session.city || "").trim(),
          preferredCurrency: String(data.preferredCurrency || session.preferredCurrency || "INR").trim(),
          prefsSignature: buildPrefsSignature({
            ...DEFAULT_PREFS,
            ...(data.buyerSettings || {}),
            notificationToggles: {
              ...DEFAULT_PREFS.notificationToggles,
              ...(data.buyerSettings?.notificationToggles || {})
            }
          })
        };
        setTerms({
          acceptedAt: data.terms?.acceptedAt || localStorage.getItem("terms_accepted_at") || "",
          versionDate: data.terms?.versionDate || ""
        });
      })
      .catch(() => {
        const stored = getSettings();
        const fallbackPrefs = {
          ...DEFAULT_PREFS,
          ...(stored.buyer || {}),
          notificationToggles: {
            ...DEFAULT_PREFS.notificationToggles,
            ...(stored?.buyer?.notificationToggles || {})
          }
        };
        setPrefs(fallbackPrefs);
        initialProfileRef.current = {
          name: String(session.name || "").trim(),
          city: String(session.city || "").trim(),
          preferredCurrency: String(session.preferredCurrency || "INR").trim(),
          prefsSignature: buildPrefsSignature(fallbackPrefs)
        };
      });

  }, [navigate, session?.token, session?._id]);

  useEffect(() => {
    const update = () => {
      getResolvedPushPermissionState().then(setPushPermission).catch(() => {
        setPushPermission(getPushPermissionState());
      });
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);

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
    const email = String(profile.email || "").trim();
    const mobile = String(profile.mobile || "").trim();
    const initialEmail = String(initialContactRef.current.email || "").trim();
    const initialMobile = String(initialContactRef.current.mobile || "").trim();
    const currentCity = String(profile.city || "").trim();
    const currentSignature = buildPrefsSignature(prefs);
    const cityOnlyChange =
      currentCity &&
      currentCity !== String(initialProfileRef.current.city || "").trim() &&
      String(profile.name || "").trim() === String(initialProfileRef.current.name || "").trim() &&
      String(profile.preferredCurrency || "INR").trim() === String(initialProfileRef.current.preferredCurrency || "INR").trim() &&
      currentSignature === String(initialProfileRef.current.prefsSignature || "");
    const changingEmail = email && email !== initialEmail;
    const changingMobile = mobile && mobile !== initialMobile;

    if (changingEmail || changingMobile) {
      setContactOtpSending(true);
      try {
        const verifyPayload = {};
        if (changingEmail) verifyPayload.email = email;
        if (changingMobile) verifyPayload.mobile = mobile;
        await api.post("/buyer/profile/verify-contact", verifyPayload);
        setContactOtpModal({ open: true, email: email || initialEmail, mobile: mobile || initialMobile });
        setContactOtp("");
      } catch (err) {
        alert(err?.response?.data?.message || "Failed to send OTP");
      } finally {
        setContactOtpSending(false);
      }
      return;
    }

    if (cityOnlyChange) {
      setSaving(true);
      try {
        const res = await api.post("/buyer/profile/city", { city: currentCity });
        const data = res.data || {};
        setProfile((prev) => ({
          ...prev,
          city: data.city || prev.city
        }));
        updateSession({
          city: data.city || currentCity
        });
        setUiCitySelection(data.city || currentCity || session.city || "");
        initialProfileRef.current = {
          ...initialProfileRef.current,
          city: String(data.city || currentCity).trim()
        };
        alert("Settings saved");
      } catch (err) {
        alert(err?.response?.data?.message || "Failed to save settings");
      } finally {
        setSaving(false);
      }
      return;
    }

    await saveProfileChanges(email, mobile, initialEmail, initialMobile);
  }

  async function saveProfileChanges(email, mobile, initialEmail, initialMobile) {
    setSaving(true);
    try {
      const payload = {
        name: profile.name,
        city: profile.city,
        preferredCurrency: profile.preferredCurrency,
        buyerSettings: {
          ...prefs,
          defaultCity: profile.city,
          notificationToggles: {
            ...DEFAULT_PREFS.notificationToggles,
            ...(prefs.notificationToggles || {}),
            pushEnabled: Boolean(prefs.notificationToggles?.pushEnabled),
            newOffer: Boolean(prefs.notificationToggles?.newOffer),
            chat: Boolean(prefs.notificationToggles?.chat),
            statusUpdate: Boolean(prefs.notificationToggles?.statusUpdate),
            reminder: Boolean(prefs.notificationToggles?.reminder)
          },
          emailNotificationToggles: {
            enabled: Boolean(prefs.emailNotificationToggles?.enabled),
            newOffer: Boolean(prefs.emailNotificationToggles?.newOffer)
          }
        }
      };
      if (email && email !== initialEmail) {
        payload.email = email;
      }
      if (mobile && mobile !== initialMobile) {
        payload.mobile = mobile;
      }
      const res = await api.post("/buyer/profile", payload);
      const data = res.data || {};
      
      if (data.merged) {
        setSession({
          _id: data.user._id,
          role: data.user.role,
          roles: data.user.roles,
          email: data.user.email,
          city: data.user.city,
          name: data.user.name || "Buyer",
          preferredCurrency: data.user.preferredCurrency || "INR",
          mobile: data.user.mobile,
          token: data.token
        });
        setUiCitySelection(data.user.city || profile.city || session.city || "");
        alert("Account merged successfully! Your posts have been combined.");
        goToDashboard();
        return;
      }
      
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
      initialContactRef.current = {
        email: data.email || email || initialEmail,
        mobile: data.mobile || mobile || initialMobile
      };
      initialProfileRef.current = {
        name: String(data.name || profile.name || "").trim(),
        city: String(data.city || profile.city || session.city || "").trim(),
        preferredCurrency: String(data.preferredCurrency || profile.preferredCurrency || "INR").trim(),
        prefsSignature: buildPrefsSignature({
          ...prefs,
          ...(data.buyerSettings || {}),
          notificationToggles: {
            ...DEFAULT_PREFS.notificationToggles,
            ...(data.buyerSettings?.notificationToggles || {}),
            ...(prefs.notificationToggles || {})
          }
        })
      };
      updateSession({
        name: data.name || profile.name,
        city: data.city || profile.city,
        preferredCurrency: data.preferredCurrency || profile.preferredCurrency
      });
      setUiCitySelection(data.city || profile.city || session.city || "");
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

  async function confirmContactOtp() {
    if (!contactOtp || contactOtp.length < 6) {
      alert("Please enter the 6-digit OTP");
      return;
    }
    setContactOtpSending(true);
    try {
      const res = await api.post("/buyer/profile/confirm-contact", {
        email: contactOtpModal.email,
        mobile: contactOtpModal.mobile,
        otp: contactOtp
      });
      setContactOtpModal({ open: false, email: "", mobile: "" });
      initialContactRef.current = {
        email: res.data?.user?.email || initialContactRef.current.email,
        mobile: res.data?.user?.mobile || initialContactRef.current.mobile
      };
      await saveProfileChanges(
        res.data?.user?.email || profile.email,
        res.data?.user?.mobile || profile.mobile,
        initialContactRef.current.email,
        initialContactRef.current.mobile
      );
    } catch (err) {
      alert(err?.response?.data?.message || "OTP verification failed");
    } finally {
      setContactOtpSending(false);
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

  async function enableBrowserPush() {
    const ok = await requestPushPermissionAndSubscribe();
    const current = await getResolvedPushPermissionState();
    setPushPermission(current);
    if (ok || current === "granted") {
      alert("Notifications enabled.");
      return;
    }
    if (current === "denied") {
      alert(buildNotificationHelpText());
      return;
    }
    alert("Notification permission not granted.");
  }

  return (
    <div className="page">
      <div className="page-shell">
        <div className="flex items-center justify-between mb-6">
          <h1 className="page-hero">Buyer Settings</h1>
          <button
            onClick={goToDashboard}
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
                <input
                  value={profile.email}
                  onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                  type="email"
                  placeholder="Enter your email"
                  className="w-full border rounded-xl px-4 py-3"
                />
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
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-gray-600">
                  Notification permission: {pushPermission}
                </span>
                {pushPermission !== "granted" && (
                  <button
                    type="button"
                    onClick={() => enableBrowserPush().catch(() => {})}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white"
                  >
                    Enable Notifications
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6">
            <h2 className="text-lg font-semibold mb-3">Email Notifications</h2>
            <div className="grid gap-2 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.emailNotificationToggles?.enabled)}
                  onChange={(e) => updatePrefs({ emailNotificationToggles: { ...prefs.emailNotificationToggles, enabled: e.target.checked } })}
                />
                Enable email notifications
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.emailNotificationToggles?.newOffer)}
                  onChange={(e) => updatePrefs({ emailNotificationToggles: { ...prefs.emailNotificationToggles, newOffer: e.target.checked } })}
                />
                New offer received
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Email notifications are sent to {profile.email || "your registered email"}
              </p>
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
              disabled={saving || contactOtpSending}
              className="btn-primary w-full"
            >
              {saving ? "Saving..." : contactOtpSending ? "Sending OTP..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>

      {contactOtpModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Verify Contact Change</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter the OTP sent to {contactOtpModal.email && contactOtpModal.mobile ? `${contactOtpModal.email} and ${contactOtpModal.mobile}` : contactOtpModal.email || contactOtpModal.mobile}
            </p>
            <input
              type="text"
              maxLength={6}
              value={contactOtp}
              onChange={(e) => setContactOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              className="w-full border rounded-xl px-4 py-3 text-center text-xl tracking-widest mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setContactOtpModal({ open: false, email: "", mobile: "" })}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmContactOtp}
                disabled={contactOtpSending}
                className="flex-1 py-3 rounded-xl btn-brand font-semibold"
              >
                {contactOtpSending ? "Verifying..." : "Verify & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
