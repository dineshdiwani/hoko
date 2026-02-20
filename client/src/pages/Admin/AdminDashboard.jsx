import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/adminApi";
import { confirmDialog } from "../../utils/dialogs";
import AdminNav from "../../components/AdminNav";

export default function AdminDashboard() {
  const defaultTermsContent = [
    "By using hoko, you agree to these Terms & Conditions.",
    "hoko is a marketplace platform connecting buyers and sellers. You are responsible for all negotiations, pricing, delivery, and payments.",
    "You must provide accurate information and use the platform responsibly. Impersonation, fraud, or misuse is strictly prohibited.",
    "Abusive, hateful, or harassing language is not allowed in chat or messages. Violations may result in suspension or permanent removal from the platform.",
    "Sellers must ensure their business details are truthful and buyers must post genuine requirements. Any abuse may result in account restrictions.",
    "You are responsible for complying with all applicable laws, taxes, and regulations related to your transactions.",
    "hoko may update these terms at any time. Continued use of the platform indicates acceptance of the updated terms."
  ].join("\n\n");
  const defaultPrivacyPolicyContent = [
    "We collect account, profile, and usage information needed to provide the hoko marketplace.",
    "Buyer and seller contact details and posted requirements/offers are shared as required to enable transactions.",
    "You are responsible for the information you publish and share on the platform.",
    "We use data to operate the service, improve security, prevent fraud/abuse, and comply with legal obligations.",
    "We may use trusted service providers for hosting, analytics, communication, and support operations.",
    "We do not sell personal information. We may disclose data when required by law or valid legal process.",
    "You can request correction or deletion of eligible personal data by contacting support.",
    "By continuing to use hoko, you acknowledge this Privacy Policy and any future updates."
  ].join("\n\n");

  const [users, setUsers] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [offers, setOffers] = useState([]);
  const [chats, setChats] = useState([]);
  const [options, setOptions] = useState({
    cities: [],
    categories: [],
    units: [],
    currencies: [],
    defaults: {
      city: "user_default",
      category: "user_default"
    },
    notifications: {
      enabled: true,
      cities: [],
      categories: []
    },
    emailNotifications: {
      enabled: false,
      adminCopy: true,
      events: {
        newOfferToBuyer: true,
        requirementUpdatedToSellers: true,
        reverseAuctionToSellers: true
      }
    },
    whatsAppCampaign: {
      enabled: false,
      cities: [],
      categories: []
    },
    moderationRules: {
      enabled: true,
      keywords: [],
      blockPhone: true,
      blockLinks: true
    },
    termsAndConditions: {
      content: defaultTermsContent
    },
    privacyPolicy: {
      content: defaultPrivacyPolicyContent
    }
  });
  const [reports, setReports] = useState([]);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [notificationFile, setNotificationFile] = useState(null);
  const [whatsAppSummary, setWhatsAppSummary] = useState({
    total: 0,
    cities: [],
    lastUpdatedAt: null,
    uploadFile: null
  });
  const [uploadingWhatsApp, setUploadingWhatsApp] = useState(false);
  const [downloadingWhatsAppFile, setDownloadingWhatsAppFile] = useState(false);
  const [citiesText, setCitiesText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [unitsText, setUnitsText] = useState("");
  const [currenciesText, setCurrenciesText] = useState("");
  const [campaignRuns, setCampaignRuns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [testRequirementId, setTestRequirementId] = useState("");
  const [testMobile, setTestMobile] = useState("");
  const [manualRequirementId, setManualRequirementId] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualTemplateFields, setManualTemplateFields] = useState({
    product: true,
    makeBrand: true,
    typeModel: true,
    quantity: true,
    city: true,
    details: true,
    link: true
  });
  const [manualQueue, setManualQueue] = useState([]);
  const [manualMessagePreview, setManualMessagePreview] = useState("");
  const [unsubscribeMobile, setUnsubscribeMobile] = useState("");
  const [unsubscribeReason, setUnsubscribeReason] = useState("");
  const [dndBulk, setDndBulk] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showLegalPreviewModal, setShowLegalPreviewModal] = useState(false);
  const [legalPreviewType, setLegalPreviewType] = useState("terms");
  const navigate = useNavigate();

  const parseOptionList = (value) =>
    String(value || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);


  const formatDateTime = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const normalizeText = (value) => String(value || "").trim().toLowerCase();

  const getRequirementDisplay = (req) =>
    `${req?.product || req?.productName || "Requirement"} | ${req?.city || "-"} | ${req?.category || "-"}`;

  const buildManualMessage = useCallback(
    (requirement) => {
      if (!requirement?._id) return "";
      const lines = ["New buyer requirement posted on Hoko."];
      if (manualTemplateFields.product) {
        lines.push(`Post: ${requirement.product || requirement.productName || "-"}`);
      }
      if (manualTemplateFields.makeBrand) {
        lines.push(`Make/Brand: ${requirement.makeBrand || requirement.brand || "-"}`);
      }
      if (manualTemplateFields.typeModel) {
        lines.push(`Type Model: ${requirement.typeModel || requirement.type || "-"}`);
      }
      if (manualTemplateFields.quantity) {
        const quantity = requirement.quantity || "-";
        const unit = requirement.unit || "-";
        lines.push(`Quantity: ${quantity} ${unit}`.trim());
      }
      if (manualTemplateFields.city) {
        lines.push(`City: ${requirement.city || "-"}`);
      }
      if (manualTemplateFields.details) {
        lines.push(`Details: ${requirement.details || "-"}`);
      }
      if (manualTemplateFields.link) {
        const baseUrl = window.location.origin.replace(/\/+$/, "");
        const cityParam = encodeURIComponent(requirement.city || "");
        const reqIdParam = encodeURIComponent(requirement._id || "");
        lines.push(`Open: ${baseUrl}/seller/deeplink/${reqIdParam}?city=${cityParam}&postId=${reqIdParam}`);
      }
      return lines.join("\n");
    },
    [manualTemplateFields]
  );

  const loadDashboardData = useCallback(async () => {
    const endpoints = [
      "users",
      "requirements",
      "offers",
      "chats",
      "reports",
      "options",
      "whatsAppSummary",
      "campaignRuns",
      "contacts"
    ];
    const requests = [
      api.get("/admin/users"),
      api.get("/admin/requirements"),
      api.get("/admin/offers"),
      api.get("/admin/chats"),
      api.get("/admin/reports"),
      api.get("/admin/options"),
      api.get("/admin/whatsapp/contacts/summary"),
      api.get("/admin/whatsapp/campaign-runs"),
      api.get("/admin/whatsapp/contacts")
    ];
    const settled = await Promise.allSettled(requests);
    const responseMap = settled.reduce((acc, result, index) => {
      const key = endpoints[index];
      acc[key] = result.status === "fulfilled" ? result.value.data : null;
      return acc;
    }, {});

    setUsers(Array.isArray(responseMap.users) ? responseMap.users : []);
    setRequirements(Array.isArray(responseMap.requirements) ? responseMap.requirements : []);
    setOffers(Array.isArray(responseMap.offers) ? responseMap.offers : []);
    setChats(Array.isArray(responseMap.chats) ? responseMap.chats : []);
    setReports(Array.isArray(responseMap.reports) ? responseMap.reports : []);

    if (responseMap.options) {
      const data = responseMap.options;
      const nextCities = Array.isArray(data.cities) ? data.cities : [];
      const nextCategories = Array.isArray(data.categories) ? data.categories : [];
      const nextUnits = Array.isArray(data.units) ? data.units : [];
      const nextCurrencies = Array.isArray(data.currencies) ? data.currencies : [];
      setOptions((prev) => ({
        ...prev,
        ...data,
        defaults: {
          ...prev.defaults,
          ...(data.defaults || {})
        },
        notifications: {
          ...prev.notifications,
          ...(data.notifications || {})
        },
        emailNotifications: {
          ...prev.emailNotifications,
          ...(data.emailNotifications || {}),
          events: {
            ...(prev.emailNotifications?.events || {}),
            ...(data.emailNotifications?.events || {})
          }
        },
        whatsAppCampaign: {
          ...prev.whatsAppCampaign,
          ...(data.whatsAppCampaign || {})
        },
        moderationRules: {
          ...prev.moderationRules,
          ...(data.moderationRules || {})
        },
        termsAndConditions: {
          ...prev.termsAndConditions,
          ...(data.termsAndConditions || {})
        },
        privacyPolicy: {
          ...prev.privacyPolicy,
          ...(data.privacyPolicy || {})
        }
      }));
      setCitiesText(nextCities.join(", "));
      setCategoriesText(nextCategories.join(", "));
      setUnitsText(nextUnits.join(", "));
      setCurrenciesText(nextCurrencies.join(", "));
    }
    setWhatsAppSummary(
      responseMap.whatsAppSummary || {
        total: 0,
        cities: [],
        lastUpdatedAt: null,
        uploadFile: null
      }
    );
    setCampaignRuns(Array.isArray(responseMap.campaignRuns) ? responseMap.campaignRuns : []);
    setContacts(Array.isArray(responseMap.contacts) ? responseMap.contacts : []);
  }, []);

  useEffect(() => {
    loadDashboardData().catch(() => {});
  }, [loadDashboardData]);

  useEffect(() => {
    if (!manualRequirementId) {
      setManualMessagePreview("");
      return;
    }
    const req = requirements.find((item) => String(item._id) === String(manualRequirementId));
    if (!req) {
      setManualMessagePreview("");
      return;
    }
    setManualMessagePreview(buildManualMessage(req));
  }, [buildManualMessage, manualRequirementId, requirements]);

  const toggleSellerApproval = async (sellerId, approved) => {
    await api.post("/admin/seller/approve", {
      sellerId,
      approved
    });
    alert("Seller status updated");
    await loadDashboardData();
  };

  const toggleUserBlock = async (userId, blocked) => {
    await api.post("/admin/user/block", { userId, blocked });
    alert(blocked ? "User blocked" : "User unblocked");
    await loadDashboardData();
  };

  const forceLogoutUser = async (userId) => {
    await api.post("/admin/user/force-logout", { userId });
    alert("User logged out");
    await loadDashboardData();
  };

  const toggleUserChat = async (userId, disabled) => {
    await api.post("/admin/user/chat-toggle", {
      userId,
      disabled
    });
    await loadDashboardData();
  };

  const deleteRequirement = async (id) => {
    const confirmed = await confirmDialog("Remove this requirement?");
    if (!confirmed) return;
    await api.post(`/admin/requirement/${id}/moderate`, {
      removed: true,
      reason: "Removed by admin"
    });
    await loadDashboardData();
  };

  const restoreRequirement = async (id) => {
    await api.post(`/admin/requirement/${id}/moderate`, {
      removed: false
    });
    await loadDashboardData();
  };

  const toggleRequirementChat = async (requirementId, disabled) => {
    await api.post("/admin/requirement/chat-toggle", {
      requirementId,
      disabled
    });
    await loadDashboardData();
  };

  const moderateOffer = async (offer, removed) => {
    const reason = removed
      ? prompt("Reason for removing this offer?") || "Removed by admin"
      : "Restored by admin";
    await api.post(`/admin/offer/${offer._id}/moderate`, {
      removed,
      reason
    });
    await loadDashboardData();
  };

  const moderateChat = async (chat, removed) => {
    const reason = removed
      ? prompt("Reason for removing this message?") || "Removed by admin"
      : "Restored by admin";
    await api.post(`/admin/chat/${chat._id}/moderate`, {
      removed,
      reason
    });
    await loadDashboardData();
  };

  const updateReportStatus = async (report, status) => {
    const adminNote =
      status === "resolved"
        ? prompt("Resolution note (optional)") || ""
        : prompt("Admin note (optional)") || "";
    const res = await api.post(`/admin/report/${report._id}/status`, {
      status,
      adminNote
    });
    setReports((prev) =>
      prev.map((r) => (r._id === report._id ? res.data : r))
    );
    await loadDashboardData();
  };

  const saveOptions = async () => {
    const nextCities = parseOptionList(citiesText);
    const nextCategories = parseOptionList(categoriesText);
    const nextUnits = parseOptionList(unitsText);
    if (!nextCities.length || !nextCategories.length || !nextUnits.length) {
      alert("Cities, categories, and units cannot be empty");
      return;
    }
    const payload = {
      ...options,
      cities: nextCities,
      categories: nextCategories,
      units: nextUnits,
      currencies: parseOptionList(currenciesText)
    };
    await api.put("/admin/options", payload);
    alert("Options updated");
    await loadDashboardData();
  };

  const updateDefaultSelection = (key, value) => {
    setOptions((prev) => ({
      ...prev,
      defaults: {
        ...prev.defaults,
        [key]: value
      }
    }));
  };

  const setTaxonomyText = (type, values) => {
    const next = Array.isArray(values) ? values.join(", ") : "";
    if (type === "cities") setCitiesText(next);
    if (type === "categories") setCategoriesText(next);
    if (type === "units") setUnitsText(next);
    if (type === "currencies") setCurrenciesText(next);
  };

  const addTaxonomyValue = async (type) => {
    const value = prompt(`Add new ${type.slice(0, -1)} value`);
    if (!value) return;
    try {
      const res = await api.post(`/admin/options/${type}`, { value });
      setTaxonomyText(type, res.data?.values || []);
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || `Failed to add ${type}`);
    }
  };

  const renameTaxonomyValue = async (type) => {
    const oldValue = prompt(`Current ${type.slice(0, -1)} value to rename`);
    if (!oldValue) return;
    const newValue = prompt(`New value for ${oldValue}`);
    if (!newValue) return;
    try {
      const res = await api.put(`/admin/options/${type}`, {
        oldValue,
        newValue
      });
      setTaxonomyText(type, res.data?.values || []);
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || `Failed to rename ${type}`);
    }
  };

  const removeTaxonomyValue = async (type) => {
    const value = prompt(`Value to remove from ${type}`);
    if (!value) return;
    const force = window.confirm("Force remove from options even if currently used?");
    try {
      const res = await api.delete(`/admin/options/${type}`, {
        data: { value, force }
      });
      setTaxonomyText(type, res.data?.values || []);
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || `Failed to remove from ${type}`);
    }
  };

  const updateContactCompliance = async (contactId, patch) => {
    try {
      await api.patch(`/admin/whatsapp/contacts/${contactId}/compliance`, patch);
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update contact compliance");
    }
  };

  const submitUnsubscribe = async () => {
    if (!unsubscribeMobile.trim()) {
      alert("Enter mobile in E.164 format, e.g. +919999999999");
      return;
    }
    try {
      await api.post("/admin/whatsapp/unsubscribe", {
        mobileE164: unsubscribeMobile,
        reason: unsubscribeReason
      });
      alert("Contact unsubscribed");
      setUnsubscribeMobile("");
      setUnsubscribeReason("");
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || "Unsubscribe failed");
    }
  };

  const importDndList = async () => {
    const numbers = dndBulk
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!numbers.length) {
      alert("Add at least one number");
      return;
    }
    try {
      const res = await api.post("/admin/whatsapp/dnd/import", {
        numbers,
        source: "admin_bulk"
      });
      alert(`DND import updated ${res.data?.updated || 0} contacts`);
      setDndBulk("");
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || "DND import failed");
    }
  };

  const sendCampaignTest = async (dryRun) => {
    if (!testRequirementId.trim() || !testMobile.trim()) {
      alert("Requirement ID and mobile are required");
      return;
    }
    try {
      const res = await api.post("/admin/whatsapp/test-send", {
        requirementId: testRequirementId.trim(),
        mobileE164: testMobile.trim(),
        dryRun
      });
      alert(dryRun ? "Dry run created" : res.data?.ok ? "Test message sent" : "Test message failed");
      await loadDashboardData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to run test send");
    }
  };

  const toggleManualTemplateField = (field) => {
    setManualTemplateFields((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const createManualQueue = () => {
    if (!manualRequirementId) {
      alert("Select a requirement");
      return;
    }
    if (!manualCity) {
      alert("Select city");
      return;
    }
    if (!manualCategory) {
      alert("Please select category");
      return;
    }
    const requirement = requirements.find((req) => String(req._id) === String(manualRequirementId));
    if (!requirement) {
      alert("Selected requirement not found");
      return;
    }
    if (normalizeText(requirement.city) !== normalizeText(manualCity)) {
      alert("Selected city does not match this post");
      return;
    }
    if (normalizeText(requirement.category) !== normalizeText(manualCategory)) {
      alert("Selected category does not match this post");
      return;
    }

    const message = buildManualMessage(requirement);
    const queue = contacts
      .filter((contact) => normalizeText(contact.city) === normalizeText(manualCity))
      .filter((contact) => contact.active !== false)
      .filter((contact) => contact.optInStatus === "opted_in")
      .filter((contact) => !contact.unsubscribedAt)
      .filter((contact) => contact.dndStatus !== "dnd")
      .map((contact) => ({
        id: contact._id,
        firmName: contact.firmName || "-",
        city: contact.city || "-",
        mobileE164: contact.mobileE164,
        status: "pending",
        whatsappLink: `https://wa.me/${String(contact.mobileE164 || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`
      }));

    setManualMessagePreview(message);
    setManualQueue(queue);
    if (!queue.length) {
      alert("No eligible contacts found for selected city/category");
      return;
    }
    alert(`Manual queue created with ${queue.length} pending contacts`);
  };

  const openManualWhatsApp = (entry) => {
    if (!entry?.whatsappLink) return;
    window.open(entry.whatsappLink, "_blank", "noopener,noreferrer");
  };

  const toggleUserDetails = (userId) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleNotificationFile = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setNotificationFile(null);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      alert("Please upload an Excel file (.xls or .xlsx)");
      event.target.value = "";
      setNotificationFile(null);
      return;
    }
    setNotificationFile(file);
  };

  const uploadWhatsAppContacts = async () => {
    if (!notificationFile) return;
    const formData = new FormData();
    formData.append("file", notificationFile);
    formData.append("mode", "replace");
    try {
      setUploadingWhatsApp(true);
      const res = await api.post("/admin/whatsapp/contacts/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      const stats = res.data || {};
      alert(
        `Upload complete. Parsed: ${stats.parsed || 0}, Inserted: ${stats.inserted || 0}, Updated: ${stats.updated || 0}, Failed: ${stats.failed || 0}`
      );
      setNotificationFile(null);
      await loadDashboardData();
    } catch (err) {
      const serverData = err?.response?.data;
      const serverMessage =
        typeof serverData === "string"
          ? serverData
          : serverData?.message;
      const fallback = err?.response?.status
        ? `Failed to upload WhatsApp contacts (HTTP ${err.response.status})`
        : "Failed to upload WhatsApp contacts";
      alert(serverMessage || err?.message || fallback);
    } finally {
      setUploadingWhatsApp(false);
    }
  };

  const downloadWhatsAppUploadedFile = async () => {
    try {
      setDownloadingWhatsAppFile(true);
      const res = await api.get("/admin/whatsapp/contacts/uploaded-file", {
        responseType: "blob"
      });
      const disposition = String(res.headers?.["content-disposition"] || "");
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName = match?.[1] || "whatsapp-contacts.xlsx";
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      let message = "Failed to download uploaded file";
      const raw = err?.response?.data;
      if (raw instanceof Blob) {
        try {
          const text = await raw.text();
          const parsed = JSON.parse(text);
          if (parsed?.message) message = parsed.message;
        } catch {}
      } else if (raw?.message) {
        message = raw.message;
      }
      alert(message);
    } finally {
      setDownloadingWhatsAppFile(false);
    }
  };

  const toggleOptionNotificationCity = (city) => {
    setOptions((prev) => {
      const current = prev.notifications?.cities || [];
      const next = current.includes(city)
        ? current.filter((c) => c !== city)
        : [...current, city];
      return {
        ...prev,
        notifications: {
          ...prev.notifications,
          cities: next
        }
      };
    });
  };

  const toggleOptionNotificationCategory = (cat) => {
    setOptions((prev) => {
      const current = prev.notifications?.categories || [];
      const next = current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat];
      return {
        ...prev,
        notifications: {
          ...prev.notifications,
          categories: next
        }
      };
    });
  };

  const toggleWhatsAppCity = (city) => {
    setOptions((prev) => {
      const current = prev.whatsAppCampaign?.cities || [];
      const next = current.includes(city)
        ? current.filter((c) => c !== city)
        : [...current, city];
      return {
        ...prev,
        whatsAppCampaign: {
          ...prev.whatsAppCampaign,
          cities: next
        }
      };
    });
  };

  const toggleWhatsAppCategory = (cat) => {
    setOptions((prev) => {
      const current = prev.whatsAppCampaign?.categories || [];
      const next = current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat];
      return {
        ...prev,
        whatsAppCampaign: {
          ...prev.whatsAppCampaign,
          categories: next
        }
      };
    });
  };

  const updateModerationRules = (patch) => {
    setOptions((prev) => ({
      ...prev,
      moderationRules: {
        ...prev.moderationRules,
        ...patch
      }
    }));
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Fill current password, new password, and confirm password");
      return;
    }
    if (newPassword.length < 8) {
      alert("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("New password and confirm password do not match");
      return;
    }
    try {
      setChangingPassword(true);
      const res = await api.post("/admin/change-password", {
        currentPassword,
        newPassword
      });
      if (res.data?.token) {
        localStorage.setItem("admin_token", res.data.token);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("Admin password updated");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center mb-6">
          <h1 className="page-hero">Admin Dashboard</h1>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => loadDashboardData().catch(() => {})}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Refresh
            </button>
            <AdminNav />
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4 mb-6">
          <h2 className="text-base font-semibold mb-3">Admin Settings</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Current password"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="New password (min 8 chars)"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Confirm new password"
            />
          </div>
          <div className="mt-3">
            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              {changingPassword ? "Updating..." : "Change Password"}
            </button>
          </div>
        </div>

        <div className="mt-2">
          <div className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Operations & Reports</h2>
              <p className="text-sm text-gray-600">
                Users, requirements, offers, chats, and reports are now in a dedicated page for easier control.
              </p>
            </div>
            <button
              onClick={() => navigate("/admin/operations")}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              Open Operations Page
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">WhatsApp Operations</h2>
              <p className="text-sm text-gray-600">
                WhatsApp contacts, campaigns, compliance, and sending are now in a dedicated page.
              </p>
            </div>
            <button
              onClick={() => navigate("/admin/whatsapp")}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              Open WhatsApp Page
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-3">Moderation Rules</h2>
          <div className="bg-white border rounded-2xl p-3 space-y-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={options.moderationRules?.enabled ?? true}
                onChange={(e) => updateModerationRules({ enabled: e.target.checked })}
              />
              Enable auto-flagging
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={options.moderationRules?.blockPhone ?? true}
                onChange={(e) => updateModerationRules({ blockPhone: e.target.checked })}
              />
              Flag phone numbers
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={options.moderationRules?.blockLinks ?? true}
                onChange={(e) => updateModerationRules({ blockLinks: e.target.checked })}
              />
              Flag external links
            </label>
            <div>
              <label className="text-xs text-gray-600">
                Flag keywords (comma separated)
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={2}
                value={(options.moderationRules?.keywords || []).join(", ")}
                onChange={(e) =>
                  updateModerationRules({
                    keywords: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-bold mb-3">Platform Options</h2>
          <div className="bg-white border rounded-2xl p-3 space-y-4">
            <div>
              <label className="text-xs text-gray-600">
                Cities (comma separated)
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={3}
                value={citiesText}
                onChange={(e) => setCitiesText(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Categories (comma separated)
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={3}
                value={categoriesText}
                onChange={(e) => setCategoriesText(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Units (comma separated)
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={2}
                value={unitsText}
                onChange={(e) => setUnitsText(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Terms & Conditions Content
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={8}
                value={options.termsAndConditions?.content || ""}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    termsAndConditions: {
                      ...prev.termsAndConditions,
                      content: e.target.value
                    }
                  }))
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                This content appears in the login Terms & Conditions modal.
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-amber-700 hover:underline bg-transparent shadow-none"
                onClick={() => {
                  setLegalPreviewType("terms");
                  setShowLegalPreviewModal(true);
                }}
              >
                Preview Terms & Conditions modal
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Privacy Policy Content
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={8}
                value={options.privacyPolicy?.content || ""}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    privacyPolicy: {
                      ...prev.privacyPolicy,
                      content: e.target.value
                    }
                  }))
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                This content appears in the login Privacy Policy modal.
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-amber-700 hover:underline bg-transparent shadow-none"
                onClick={() => {
                  setLegalPreviewType("privacy");
                  setShowLegalPreviewModal(true);
                }}
              >
                Preview Privacy Policy modal
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Currencies (comma separated)
              </label>
              <textarea
                className="w-full border rounded-lg p-2 mt-2 text-sm"
                rows={2}
                value={currenciesText}
                onChange={(e) => setCurrenciesText(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => addTaxonomyValue("currencies")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300"
                >
                  Add Currency
                </button>
                <button
                  onClick={() => renameTaxonomyValue("currencies")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300"
                >
                  Rename Currency
                </button>
                <button
                  onClick={() => removeTaxonomyValue("currencies")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-300 text-red-700"
                >
                  Remove Currency
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600">
                Default Dropdown Selections
              </label>
              <div className="grid gap-3 md:grid-cols-2 mt-2">
                <label className="text-xs text-gray-600">
                  Default City
                  <div className="mt-1 space-y-2 rounded-lg border p-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="default-city-mode"
                        checked={(options.defaults?.city || "user_default") === "all"}
                        onChange={() => updateDefaultSelection("city", "all")}
                      />
                      <span>All cities</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="default-city-mode"
                        checked={(options.defaults?.city || "user_default") === "user_default"}
                        onChange={() =>
                          updateDefaultSelection("city", "user_default")
                        }
                      />
                      <span>User default city</span>
                    </label>
                  </div>
                </label>

                <label className="text-xs text-gray-600">
                  Default Category
                  <div className="mt-1 space-y-2 rounded-lg border p-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="default-category-mode"
                        checked={(options.defaults?.category || "user_default") === "all"}
                        onChange={() => updateDefaultSelection("category", "all")}
                      />
                      <span>All categories</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="default-category-mode"
                        checked={(options.defaults?.category || "user_default") === "user_default"}
                        onChange={() =>
                          updateDefaultSelection("category", "user_default")
                        }
                      />
                      <span>User default category</span>
                    </label>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600">Email Notification Controls</label>
              <div className="mt-2 space-y-2 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={options.emailNotifications?.enabled === true}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        emailNotifications: {
                          ...prev.emailNotifications,
                          enabled: e.target.checked
                        }
                      }))
                    }
                  />
                  Enable email notifications
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={options.emailNotifications?.adminCopy !== false}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        emailNotifications: {
                          ...prev.emailNotifications,
                          adminCopy: e.target.checked
                        }
                      }))
                    }
                  />
                  Send admin email copy
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={options.emailNotifications?.events?.newOfferToBuyer !== false}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        emailNotifications: {
                          ...prev.emailNotifications,
                          events: {
                            ...(prev.emailNotifications?.events || {}),
                            newOfferToBuyer: e.target.checked
                          }
                        }
                      }))
                    }
                  />
                  New offer email to buyer
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={options.emailNotifications?.events?.requirementUpdatedToSellers !== false}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        emailNotifications: {
                          ...prev.emailNotifications,
                          events: {
                            ...(prev.emailNotifications?.events || {}),
                            requirementUpdatedToSellers: e.target.checked
                          }
                        }
                      }))
                    }
                  />
                  Requirement update email to sellers
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={options.emailNotifications?.events?.reverseAuctionToSellers !== false}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        emailNotifications: {
                          ...prev.emailNotifications,
                          events: {
                            ...(prev.emailNotifications?.events || {}),
                            reverseAuctionToSellers: e.target.checked
                          }
                        }
                      }))
                    }
                  />
                  Reverse auction email to sellers
                </label>
                <p className="text-xs text-gray-500">
                  Chat emails remain disabled by design. Admin copy uses ADMIN_NOTIFICATION_EMAIL/ADMIN_ALERT_EMAIL/ADMIN_EMAIL.
                </p>
              </div>
            </div>

            <button
              onClick={saveOptions}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              Save Options
            </button>
          </div>
        </div>

        <div className="mt-10 bg-white border rounded-2xl p-4">
          <p className="text-sm text-gray-700">
            Detailed requirements, offers, reports, and chats are now available in Admin Operations.
          </p>
        </div>
      </div>

      {showLegalPreviewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6 max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                {legalPreviewType === "privacy"
                  ? "Privacy Policy"
                  : "Terms & Conditions (Buyers and Sellers)"}
              </h2>
              <button
                onClick={() => setShowLegalPreviewModal(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              {String(
                legalPreviewType === "privacy"
                  ? options.privacyPolicy?.content || defaultPrivacyPolicyContent
                  : options.termsAndConditions?.content || defaultTermsContent
              )
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (
                  <p key={`admin-legal-preview-${index}`}>{line}</p>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
