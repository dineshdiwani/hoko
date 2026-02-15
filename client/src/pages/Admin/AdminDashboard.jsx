import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/adminApi";
import { confirmDialog } from "../../utils/dialogs";

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

  const [users, setUsers] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [offers, setOffers] = useState([]);
  const [chats, setChats] = useState([]);
  const [options, setOptions] = useState({
    cities: [],
    categories: [],
    units: [],
    currencies: [],
    notifications: {
      enabled: true,
      cities: [],
      categories: []
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
    }
  });
  const [reports, setReports] = useState([]);
  const [moderationQueue, setModerationQueue] = useState({
    requirements: [],
    offers: [],
    chats: []
  });
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [notificationFile, setNotificationFile] = useState(null);
  const [whatsAppSummary, setWhatsAppSummary] = useState({
    total: 0,
    cities: []
  });
  const [uploadingWhatsApp, setUploadingWhatsApp] = useState(false);
  const [citiesText, setCitiesText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [unitsText, setUnitsText] = useState("");
  const [currenciesText, setCurrenciesText] = useState("");
  const navigate = useNavigate();

  const parseOptionList = (value) =>
    String(value || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const loadDashboardData = useCallback(async () => {
    const [
      usersRes,
      requirementsRes,
      offersRes,
      chatsRes,
      reportsRes,
      optionsRes,
      whatsAppSummaryRes,
      moderationQueueRes
    ] = await Promise.all([
      api.get("/admin/users"),
      api.get("/admin/requirements"),
      api.get("/admin/offers"),
      api.get("/admin/chats"),
      api.get("/admin/reports"),
      api.get("/admin/options"),
      api.get("/admin/whatsapp/contacts/summary"),
      api.get("/admin/moderation/queue")
    ]);

    setUsers(usersRes.data || []);
    setRequirements(requirementsRes.data || []);
    setOffers(offersRes.data || []);
    setChats(chatsRes.data || []);
    setReports(reportsRes.data || []);

    const data = optionsRes.data || {};
    const nextCities = Array.isArray(data.cities) ? data.cities : [];
    const nextCategories = Array.isArray(data.categories) ? data.categories : [];
    const nextUnits = Array.isArray(data.units) ? data.units : [];
    const nextCurrencies = Array.isArray(data.currencies) ? data.currencies : [];
    setOptions((prev) => ({
      ...prev,
      ...data,
      notifications: {
        ...prev.notifications,
        ...(data.notifications || {})
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
      }
    }));
    setCitiesText(nextCities.join(", "));
    setCategoriesText(nextCategories.join(", "));
    setUnitsText(nextUnits.join(", "));
    setCurrenciesText(nextCurrencies.join(", "));
    setWhatsAppSummary(whatsAppSummaryRes.data || { total: 0, cities: [] });
    setModerationQueue(
      moderationQueueRes.data || {
        requirements: [],
        offers: [],
        chats: []
      }
    );
  }, []);

  useEffect(() => {
    loadDashboardData().catch(() => {});
  }, [loadDashboardData]);

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
    const payload = {
      ...options,
      cities: parseOptionList(citiesText),
      categories: parseOptionList(categoriesText),
      units: parseOptionList(unitsText),
      currencies: parseOptionList(currenciesText)
    };
    await api.put("/admin/options", payload);
    alert("Options updated");
    await loadDashboardData();
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
      alert(err?.response?.data?.message || "Failed to upload WhatsApp contacts");
    } finally {
      setUploadingWhatsApp(false);
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

  return (
    <div className="page">
      <div className="page-shell">
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center mb-6">
          <h1 className="page-hero">Admin Dashboard</h1>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDashboardData().catch(() => {})}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Refresh
            </button>
            <button
              onClick={() => navigate("/admin/analytics")}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              View Analytics
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {users.map(user => (
            <div
              key={user._id}
              className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3"
            >
              <div>
                <p className="font-semibold text-sm">{user.email || "No email"}</p>
                <p className="text-xs text-gray-500">
                  {user.roles?.admin
                    ? "Admin"
                    : user.roles?.seller
                    ? "Seller"
                    : "Buyer"}{" "}
                  | {user.city || "N/A"}
                </p>

                {user.roles?.seller && (
                  <p className="text-xs text-gray-600 mt-1">
                    Firm: {user.sellerProfile?.firmName || "-"}
                  </p>
                )}

                {expandedUsers.has(user._id) && (
                  <div className="mt-2 text-xs text-gray-600 space-y-1">
                    <div>User ID: {user._id}</div>
                    <div>Blocked: {user.blocked ? "Yes" : "No"}</div>
                    {user.createdAt && (
                      <div>Joined: {new Date(user.createdAt).toLocaleString()}</div>
                    )}
                    {user.roles?.seller && (
                      <div>
                        Approved: {user.sellerProfile?.approved ? "Yes" : "No"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleUserDetails(user._id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {expandedUsers.has(user._id) ? "Hide Details" : "User Details"}
                </button>
                <button
                  onClick={() => forceLogoutUser(user._id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Force Logout
                </button>
                <button
                  onClick={() => toggleUserChat(user._id, !user.chatDisabled)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    user.chatDisabled
                      ? "bg-amber-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {user.chatDisabled ? "Enable Chat" : "Disable Chat"}
                </button>
                {!user.roles?.admin && (
                  <button
                    onClick={() =>
                      toggleUserBlock(user._id, !user.blocked)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
                      user.blocked ? "bg-gray-600" : "bg-red-600"
                    }`}
                  >
                    {user.blocked ? "Unblock" : "Block"}
                  </button>
                )}

                {user.roles?.seller && !user.roles?.admin && (
                  <button
                    onClick={() =>
                      toggleSellerApproval(
                        user._id,
                        !user.sellerProfile?.approved
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
                      user.sellerProfile?.approved
                        ? "bg-red-600"
                        : "bg-green-600"
                    }`}
                  >
                    {user.sellerProfile?.approved ? "Revoke" : "Approve"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-3">
            WhatsApp Broadcast Contacts
          </h2>
          <div className="bg-white border rounded-2xl p-3 space-y-4">
            <div>
              <label className="text-sm text-gray-600">Excel File</label>
              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={handleNotificationFile}
                className="mt-2 block w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Columns required in order: A Firm Name, B City, C Mobile Country Code, D Mobile Number.
              </p>
            </div>

            <div className="text-xs text-gray-600">
              <p>
                Active WhatsApp contacts:{" "}
                <span className="font-semibold">{whatsAppSummary.total || 0}</span>
              </p>
              {Array.isArray(whatsAppSummary.cities) &&
                whatsAppSummary.cities.length > 0 && (
                  <p className="mt-1">
                    City breakdown:{" "}
                    {whatsAppSummary.cities
                      .slice(0, 10)
                      .map((row) => `${row.city} (${row.count})`)
                      .join(", ")}
                  </p>
                )}
            </div>

            <button
              onClick={uploadWhatsAppContacts}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
              disabled={!notificationFile || uploadingWhatsApp}
            >
              {uploadingWhatsApp ? "Uploading..." : "Upload Excel Contacts"}
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-3">Notification Controls</h2>
          <div className="bg-white border rounded-2xl p-3 space-y-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={options.notifications?.enabled ?? true}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      enabled: e.target.checked
                    }
                  }))
                }
              />
              Enable Notifications
            </label>

            <div>
              <p className="text-sm text-gray-600 mb-2">Cities</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(options.cities || []).map((city) => (
                  <label
                    key={city}
                    className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={(options.notifications?.cities || []).includes(city)}
                      onChange={() => toggleOptionNotificationCity(city)}
                    />
                    {city}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Categories</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(options.categories || []).map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={(options.notifications?.categories || []).includes(cat)}
                      onChange={() => toggleOptionNotificationCategory(cat)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-3">WhatsApp Campaign Controls</h2>
          <div className="bg-white border rounded-2xl p-3 space-y-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={options.whatsAppCampaign?.enabled ?? false}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    whatsAppCampaign: {
                      ...prev.whatsAppCampaign,
                      enabled: e.target.checked
                    }
                  }))
                }
              />
              Enable WhatsApp campaign when buyer posts
            </label>

            <div>
              <p className="text-sm text-gray-600 mb-2">Cities</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(options.cities || []).map((city) => (
                  <label
                    key={`wa-${city}`}
                    className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={(options.whatsAppCampaign?.cities || []).includes(city)}
                      onChange={() => toggleWhatsAppCity(city)}
                    />
                    {city}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Categories</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(options.categories || []).map((cat) => (
                  <label
                    key={`wa-cat-${cat}`}
                    className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={(options.whatsAppCampaign?.categories || []).includes(cat)}
                      onChange={() => toggleWhatsAppCategory(cat)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
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

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-3">Moderation Queue</h2>
          <div className="bg-white border rounded-2xl p-3 space-y-4">
            {moderationQueue.requirements?.length === 0 &&
              moderationQueue.offers?.length === 0 &&
              moderationQueue.chats?.length === 0 && (
                <p className="text-sm text-gray-500">
                  No flagged items right now.
                </p>
              )}

            {moderationQueue.requirements?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Flagged Requirements
                </p>
                <div className="space-y-2">
                  {moderationQueue.requirements.map((req) => (
                    <div
                      key={req._id}
                      className="border rounded-lg p-2 text-xs text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div>
                        <div>
                          {req.product || req.productName} · {req.city}
                        </div>
                        <div className="text-gray-500">
                          {req.moderation?.flaggedReason || "Flagged"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => deleteRequirement(req._id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => toggleRequirementChat(req._id, true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white"
                        >
                          Disable Chat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {moderationQueue.offers?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Flagged Offers
                </p>
                <div className="space-y-2">
                  {moderationQueue.offers.map((offer) => (
                    <div
                      key={offer._id}
                      className="border rounded-lg p-2 text-xs text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div>
                        <div>
                          Rs {offer.price} ·{" "}
                          {offer.requirementId?.product ||
                            offer.requirementId?.productName}
                        </div>
                        <div className="text-gray-500">
                          {offer.moderation?.flaggedReason || "Flagged"}
                        </div>
                      </div>
                      <button
                        onClick={() => moderateOffer(offer, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {moderationQueue.chats?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Flagged Chats
                </p>
                <div className="space-y-2">
                  {moderationQueue.chats.map((chat) => (
                    <div
                      key={chat._id}
                      className="border rounded-lg p-2 text-xs text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div>
                        <div className="text-gray-500">
                          {chat.moderation?.flaggedReason || "Flagged"}
                        </div>
                        <div className="text-gray-700">{chat.message}</div>
                      </div>
                      <button
                        onClick={() => moderateChat(chat, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            </div>

            <button
              onClick={saveOptions}
              className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
            >
              Save Options
            </button>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-bold mb-3">Recent Requirements</h2>
          <div className="space-y-3">
            {requirements.slice(0, 10).map((req) => (
              <div
                key={req._id}
                className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3"
              >
                <div>
                  <p className="font-semibold text-sm">
                    {req.product || req.productName} * {req.city}
                  </p>
                  <p className="text-xs text-gray-500">
                    {req.category || "Category"} *{" "}
                    {req.buyerId?.email || "Buyer"}
                  </p>
                  {req.moderation?.removed && (
                    <p className="text-xs text-red-600 mt-1">
                      Removed by admin
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {req.moderation?.removed ? (
                    <button
                      onClick={() => restoreRequirement(req._id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => deleteRequirement(req._id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() =>
                      toggleRequirementChat(
                        req._id,
                        !req.chatDisabled
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      req.chatDisabled
                        ? "bg-amber-600 text-white"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {req.chatDisabled ? "Enable Chat" : "Disable Chat"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-bold mb-3">Recent Offers</h2>
          <div className="space-y-3">
            {offers.slice(0, 10).map((offer) => (
              <div
                key={offer._id}
                className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3"
              >
                <div>
                  <p className="font-semibold text-sm">
                    Rs {offer.price} *{" "}
                    {offer.requirementId?.product ||
                      offer.requirementId?.productName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {offer.sellerId?.sellerProfile?.firmName || "Seller"} *
                    {offer.sellerId?.email || "-"}
                  </p>
                  {offer.moderation?.removed && (
                    <p className="text-xs text-red-600 mt-1">
                      Removed by admin
                    </p>
                  )}
                </div>
                {offer.moderation?.removed ? (
                  <button
                    onClick={() => moderateOffer(offer, false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    onClick={() => moderateOffer(offer, true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-bold mb-3">Reports</h2>
          <div className="space-y-3">
            {reports.slice(0, 20).map((report) => (
              <div
                key={report._id}
                className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3"
              >
                <div>
                  <p className="font-semibold text-sm">{report.category}</p>
                  <p className="text-xs text-gray-600">
                    Reporter: {report.reporterId?.email || "-"} | Reported:{" "}
                    {report.reportedUserId?.email || "-"}
                  </p>
                  {report.details && (
                    <p className="text-xs text-gray-700 mt-2">
                      {report.details}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Status: {report.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateReportStatus(report, "reviewing")}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600"
                  >
                    Mark Reviewing
                  </button>
                  <button
                    onClick={() => updateReportStatus(report, "resolved")}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-700"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-bold mb-3">Recent Chats</h2>
          <div className="space-y-3">
            {chats.slice(0, 10).map((chat) => (
              <div
                key={chat._id}
                className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3"
              >
                <div>
                  <p className="font-semibold text-sm">
                    {chat.requirementId?.product ||
                      chat.requirementId?.productName ||
                      "Requirement"}
                  </p>
                  <p className="text-xs text-gray-600">
                    {chat.fromUserId?.email || "User"} →{" "}
                    {chat.toUserId?.email || "User"}
                  </p>
                  <p className="text-xs text-gray-800 mt-2">
                    {chat.message}
                  </p>
                  {chat.moderation?.removed && (
                    <p className="text-xs text-red-600 mt-1">
                      Removed by admin
                    </p>
                  )}
                </div>
                {chat.moderation?.removed ? (
                  <button
                    onClick={() => moderateChat(chat, false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    onClick={() => moderateChat(chat, true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
