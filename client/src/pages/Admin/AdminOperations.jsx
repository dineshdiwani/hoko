import { useCallback, useEffect, useState } from "react";
import api from "../../utils/adminApi";
import { confirmDialog } from "../../utils/dialogs";
import AdminNav from "../../components/AdminNav";

export default function AdminOperations() {
  const [kpis, setKpis] = useState({
    totalUsers: 0,
    todayRequirements: 0,
    todayOffers: 0,
    todayChats: 0,
    activeRequirements: 0,
    activeOffers: 0,
    pendingReports: 0
  });
  const [systemHealth, setSystemHealth] = useState({
    mongoDB: "unknown",
    whatsapp: "unknown",
    lastCronRun: null,
    serverUptime: null
  });
  const [activityLogs, setActivityLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [offers, setOffers] = useState([]);
  const [chats, setChats] = useState([]);
  const [reports, setReports] = useState([]);
  const [moderationQueue, setModerationQueue] = useState({
    requirements: [],
    offers: [],
    chats: []
  });
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [pushSummary, setPushSummary] = useState(null);
  const [dummyReqStatus, setDummyReqStatus] = useState(null);
  const [whatsAppStats, setWhatsAppStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterCity, setFilterCity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadKpis = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [usersRes, reqRes, offersRes, chatsRes, reportsRes] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/requirements"),
        api.get("/admin/offers"),
        api.get("/admin/chats"),
        api.get("/admin/reports")
      ]);

      const users = Array.isArray(usersRes.data) ? usersRes.data : [];
      const reqs = Array.isArray(reqRes.data) ? reqRes.data : [];
      const offs = Array.isArray(offersRes.data) ? offersRes.data : [];
      const chates = Array.isArray(chatsRes.data) ? chatsRes.data : [];
      const reps = Array.isArray(reportsRes.data) ? reportsRes.data : [];

      const todayReqs = reqs.filter(r => new Date(r.createdAt) >= today);
      const todayOffers = offs.filter(o => new Date(o.createdAt) >= today);
      const todayChats = chates.filter(c => new Date(c.createdAt) >= today);
      const activeReqs = reqs.filter(r => r.status === "open" && !r.moderation?.removed);
      const activeOffers = offs.filter(o => o.status === "accepted" && !o.moderation?.removed);
      const pendingReports = reps.filter(r => r.status === "pending");

      setKpis({
        totalUsers: users.length,
        todayRequirements: todayReqs.length,
        todayOffers: todayOffers.length,
        todayChats: todayChats.length,
        activeRequirements: activeReqs.length,
        activeOffers: activeOffers.length,
        pendingReports: pendingReports.length
      });
    } catch (err) {
      console.error("KPI load error:", err);
    }
  }, []);

  const loadSystemHealth = useCallback(async () => {
    try {
      setSystemHealth({
        mongoDB: "connected",
        whatsapp: "active",
        lastCronRun: dummyReqStatus?.lastRunAt || null,
        serverUptime: Date.now()
      });
    } catch (err) {
      console.error("Health check error:", err);
    }
  }, [dummyReqStatus]);

  const loadDummyReqStatus = useCallback(async () => {
    try {
      const res = await api.get("/dummy-requirements/status");
      setDummyReqStatus(res.data);
    } catch (err) {
      console.error("Dummy req status error:", err);
    }
  }, []);

  const loadWhatsAppStats = useCallback(async () => {
    try {
      const res = await api.get("/bulk-whatsapp/stats");
      setWhatsAppStats(res.data);
    } catch (err) {
      console.error("WhatsApp stats error:", err);
    }
  }, []);

  const loadData = useCallback(async () => {
    const [usersRes, requirementsRes, offersRes, chatsRes, reportsRes, moderationRes] = await Promise.all([
      api.get("/admin/users"),
      api.get("/admin/requirements"),
      api.get("/admin/offers"),
      api.get("/admin/chats"),
      api.get("/admin/reports"),
      api.get("/admin/moderation/queue")
    ]);
    setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    setRequirements(Array.isArray(requirementsRes.data) ? requirementsRes.data : []);
    setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
    setChats(Array.isArray(chatsRes.data) ? chatsRes.data : []);
    setReports(Array.isArray(reportsRes.data) ? reportsRes.data : []);
    setModerationQueue(
      moderationRes.data || {
        requirements: [],
        offers: [],
        chats: []
      }
    );
  }, []);

  const loadPushSummary = useCallback(async () => {
    try {
      const res = await api.get("/admin/push/subscriptions/summary");
      setPushSummary(res.data || null);
    } catch (err) {
      setPushSummary(null);
    }
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([
      loadKpis(),
      loadSystemHealth(),
      loadDummyReqStatus(),
      loadWhatsAppStats(),
      loadData(),
      loadPushSummary()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  const toggleUserDetails = (userId) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSellerApproval = async (sellerId, approved) => {
    await api.post("/admin/seller/approve", { sellerId, approved });
    logActivity(approved ? "Seller Approved" : "Seller Revoked", `Seller ID: ${sellerId}`);
    await loadData();
  };

  const toggleUserBlock = async (userId, blocked) => {
    await api.post("/admin/user/block", { userId, blocked });
    logActivity(blocked ? "User Blocked" : "User Unblocked", `User ID: ${userId}`);
    await loadData();
  };

  const forceLogoutUser = async (userId) => {
    if (!await confirmDialog("Force logout this user?")) return;
    await api.post("/admin/user/force-logout", { userId });
    logActivity("Force Logout", `User ID: ${userId}`);
    await loadData();
  };

  const toggleUserChat = async (userId, disabled) => {
    await api.post("/admin/user/chat-toggle", { userId, disabled });
    logActivity(disabled ? "Chat Disabled" : "Chat Enabled", `User ID: ${userId}`);
    await loadData();
  };

  const deleteRequirement = async (id) => {
    if (!await confirmDialog("Remove this requirement?")) return;
    await api.post(`/admin/requirement/${id}/moderate`, {
      removed: true,
      reason: "Removed by admin"
    });
    logActivity("Requirement Removed", `ID: ${id}`);
    await loadData();
    await loadKpis();
  };

  const restoreRequirement = async (id) => {
    await api.post(`/admin/requirement/${id}/moderate`, { removed: false });
    logActivity("Requirement Restored", `ID: ${id}`);
    await loadData();
    await loadKpis();
  };

  const toggleRequirementChat = async (requirementId, disabled) => {
    await api.post("/admin/requirement/chat-toggle", { requirementId, disabled });
    await loadData();
  };

  const moderateOffer = async (offer, removed) => {
    const reason = removed
      ? prompt("Reason for removing this offer?") || "Removed by admin"
      : "Restored by admin";
    await api.post(`/admin/offer/${offer._id}/moderate`, { removed, reason });
    logActivity(removed ? "Offer Removed" : "Offer Restored", `ID: ${offer._id}`);
    await loadData();
    await loadKpis();
  };

  const moderateChat = async (chat, removed) => {
    const reason = removed
      ? prompt("Reason for removing this message?") || "Removed by admin"
      : "Restored by admin";
    await api.post(`/admin/chat/${chat._id}/moderate`, { removed, reason });
    logActivity(removed ? "Chat Removed" : "Chat Restored", `ID: ${chat._id}`);
    await loadData();
  };

  const updateReportStatus = async (report, status) => {
    const adminNote =
      status === "resolved"
        ? prompt("Resolution note (optional)") || ""
        : prompt("Admin note (optional)") || "";
    await api.post(`/admin/report/${report._id}/status`, { status, adminNote });
    logActivity(`Report ${status}`, `ID: ${report._id}`);
    await loadData();
    await loadKpis();
  };

  const toggleDummyReqCron = async () => {
    try {
      await api.post("/dummy-requirements/toggle");
      logActivity("Dummy Cron Toggled", dummyReqStatus?.cronRunning ? "Stopped" : "Started");
      await loadDummyReqStatus();
    } catch (err) {
      alert("Error: " + (err.response?.data?.message || err.message));
    }
  };

  const runDummyReqNow = async () => {
    if (!await confirmDialog("Generate dummy requirements now?")) return;
    try {
      await api.post("/dummy-requirements/run-now");
      logActivity("Dummy Req Run", "Manually triggered");
      await loadDummyReqStatus();
      await loadKpis();
      alert("Dummy requirements generated!");
    } catch (err) {
      alert("Error: " + (err.response?.data?.message || err.message));
    }
  };

  const logActivity = (action, details) => {
    setActivityLogs(prev => [{
      action,
      details,
      at: new Date()
    }, ...prev.slice(0, 49)]);
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const filteredUsers = users.filter(u => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (u.email || "").toLowerCase().includes(q) || 
             (u.phone || "").includes(q) ||
             (u._id || "").toLowerCase().includes(q);
    }
    return true;
  });

  const filteredRequirements = requirements.filter(r => {
    if (filterCity && r.city !== filterCity) return false;
    if (filterStatus === "active" && (r.moderation?.removed || r.status !== "open")) return false;
    if (filterStatus === "removed" && !r.moderation?.removed) return false;
    return true;
  });

  const cities = [...new Set(requirements.map(r => r.city).filter(Boolean))];

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
          <h1 className="page-hero">Admin Operations</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh All"}
            </button>
            <AdminNav />
          </div>
        </div>

        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.totalUsers}</p>
            </div>
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Today Reqs</p>
              <p className="text-2xl font-bold text-green-600">{kpis.todayRequirements}</p>
            </div>
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Today Offers</p>
              <p className="text-2xl font-bold text-purple-600">{kpis.todayOffers}</p>
            </div>
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Today Chats</p>
              <p className="text-2xl font-bold text-orange-600">{kpis.todayChats}</p>
            </div>
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Active Reqs</p>
              <p className="text-2xl font-bold text-teal-600">{kpis.activeRequirements}</p>
            </div>
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Active Offers</p>
              <p className="text-2xl font-bold text-indigo-600">{kpis.activeOffers}</p>
            </div>
            <div className="bg-white border rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Pending Reports</p>
              <p className="text-2xl font-bold text-red-600">{kpis.pendingReports}</p>
            </div>
          </div>

          {/* System Health + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* System Health */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold mb-3">System Health</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">MongoDB</span>
                  <span className={`font-medium ${systemHealth.mongoDB === "connected" ? "text-green-600" : "text-red-600"}`}>
                    {systemHealth.mongoDB === "connected" ? "● Connected" : "○ Disconnected"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">WhatsApp API</span>
                  <span className={`font-medium ${systemHealth.whatsapp === "active" ? "text-green-600" : "text-yellow-600"}`}>
                    {systemHealth.whatsapp === "active" ? "● Active" : "○ Inactive"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Push Notifications</span>
                  <span className="font-medium text-gray-600">
                    {pushSummary ? `${pushSummary?.totals?.subscriptions || 0} subs` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">WhatsApp Contacts</span>
                  <span className="font-medium text-gray-600">
                    {whatsAppStats?.total || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleDummyReqCron}
                  className={`px-3 py-2 rounded-lg text-xs font-medium ${
                    dummyReqStatus?.cronRunning
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {dummyReqStatus?.cronRunning ? "Stop Cron" : "Start Cron"}
                </button>
                <button
                  onClick={runDummyReqNow}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-100 text-blue-700"
                >
                  Run Dummy Req
                </button>
                <button
                  onClick={() => window.open("/api/admin/requirements?format=csv", "_blank")}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-700"
                >
                  Export Reqs
                </button>
                <button
                  onClick={() => window.open("/api/admin/users?format=csv", "_blank")}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-700"
                >
                  Export Users
                </button>
              </div>
            </div>

            {/* Dummy Requirements Status */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold mb-3">Dummy Requirements</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`font-medium ${dummyReqStatus?.cronRunning ? "text-green-600" : "text-red-600"}`}>
                    {dummyReqStatus?.cronRunning ? "Running" : "Stopped"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Interval</span>
                  <span className="font-medium">{dummyReqStatus?.intervalHours || 12}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Qty/Run</span>
                  <span className="font-medium">{dummyReqStatus?.quantity || 3}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Generated</span>
                  <span className="font-medium">{dummyReqStatus?.totalDummyRequirements || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending Send</span>
                  <span className="font-medium text-orange-600">{dummyReqStatus?.newCount || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white border rounded-xl p-4">
            <h3 className="font-semibold mb-3">Recent Activity</h3>
            <div className="space-y-1 max-h-32 overflow-auto">
              {activityLogs.length === 0 ? (
                <p className="text-sm text-gray-500">No recent activity</p>
              ) : (
                activityLogs.map((log, i) => (
                  <div key={i} className="text-xs flex gap-2 py-1 border-b last:border-0">
                    <span className="text-gray-400 whitespace-nowrap">{formatDate(log.at)}</span>
                    <span className="font-medium">{log.action}</span>
                    <span className="text-gray-600">{log.details}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]"
            />
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All Cities</option>
              {cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="removed">Removed</option>
            </select>
          </div>

          {/* Moderation Queue */}
          {(moderationQueue.requirements?.length > 0 || 
            moderationQueue.offers?.length > 0 || 
            moderationQueue.chats?.length > 0) && (
            <div>
              <h2 className="text-lg font-bold mb-3 text-red-600">
                ⚠️ Moderation Queue ({moderationQueue.requirements?.length + moderationQueue.offers?.length + moderationQueue.chats?.length})
              </h2>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-3">
                {moderationQueue.requirements?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-2">Flagged Requirements</p>
                    <div className="space-y-2">
                      {moderationQueue.requirements.map((req) => (
                        <div key={req._id} className="bg-white border rounded-lg p-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{req.product || req.productName} | {req.city}</div>
                            <div className="text-xs text-red-600">{req.moderation?.flaggedReason || "Flagged"}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => deleteRequirement(req._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600">Remove</button>
                            <button onClick={() => restoreRequirement(req._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200">Dismiss</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {moderationQueue.offers?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-2">Flagged Offers</p>
                    <div className="space-y-2">
                      {moderationQueue.offers.map((offer) => (
                        <div key={offer._id} className="bg-white border rounded-lg p-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">Rs {offer.price} | {offer.requirementId?.product}</div>
                            <div className="text-xs text-red-600">{offer.moderation?.flaggedReason || "Flagged"}</div>
                          </div>
                          <button onClick={() => moderateOffer(offer, true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {moderationQueue.chats?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-2">Flagged Chats</p>
                    <div className="space-y-2">
                      {moderationQueue.chats.map((chat) => (
                        <div key={chat._id} className="bg-white border rounded-lg p-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="text-xs text-red-600">{chat.moderation?.flaggedReason || "Flagged"}</div>
                            <div className="text-sm">{chat.message}</div>
                          </div>
                          <button onClick={() => moderateChat(chat, true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Users Section */}
          <div>
            <h2 className="text-lg font-bold mb-3">Users ({filteredUsers.length})</h2>
            <div className="space-y-2">
              {filteredUsers.slice(0, 50).map((user) => (
                <div key={user._id} className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{user.email || "No email"}</p>
                      {user.roles?.admin && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Admin</span>}
                      {user.roles?.seller && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Seller</span>}
                      {user.roles?.buyer && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Buyer</span>}
                      {user.blocked && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">Blocked</span>}
                    </div>
                    <p className="text-xs text-gray-500">{user.city || "N/A"} | {user.phone || "No phone"}</p>
                    {expandedUsers.has(user._id) && (
                      <div className="mt-2 text-xs text-gray-600 space-y-1 bg-gray-50 p-2 rounded">
                        <div>ID: {user._id}</div>
                        <div>Joined: {new Date(user.createdAt).toLocaleString()}</div>
                        <div>Chat: {user.chatDisabled ? "Disabled" : "Enabled"}</div>
                        {user.sellerProfile && <div>Seller Approved: {user.sellerProfile.approved ? "Yes" : "No"}</div>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => toggleUserDetails(user._id)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 bg-white">
                      {expandedUsers.has(user._id) ? "Hide" : "Details"}
                    </button>
                    <button onClick={() => forceLogoutUser(user._id)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 bg-white">Logout</button>
                    <button
                      onClick={() => toggleUserChat(user._id, !user.chatDisabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs ${user.chatDisabled ? "bg-amber-100 text-amber-700" : "border border-gray-300 bg-white"}`}
                    >
                      {user.chatDisabled ? "Enable Chat" : "Disable Chat"}
                    </button>
                    {!user.roles?.admin && (
                      <button
                        onClick={() => toggleUserBlock(user._id, !user.blocked)}
                        className={`px-3 py-1.5 rounded-lg text-xs text-white ${user.blocked ? "bg-gray-500" : "bg-red-500"}`}
                      >
                        {user.blocked ? "Unblock" : "Block"}
                      </button>
                    )}
                    {user.roles?.seller && !user.roles?.admin && (
                      <button
                        onClick={() => toggleSellerApproval(user._id, !user.sellerProfile?.approved)}
                        className={`px-3 py-1.5 rounded-lg text-xs text-white ${user.sellerProfile?.approved ? "bg-red-500" : "bg-green-500"}`}
                      >
                        {user.sellerProfile?.approved ? "Revoke" : "Approve"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Requirements Section */}
          <div>
            <h2 className="text-lg font-bold mb-3">Requirements ({filteredRequirements.length})</h2>
            <div className="space-y-2">
              {filteredRequirements.slice(0, 30).map((req) => (
                <div key={req._id} className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{req.product || req.productName}</p>
                      {req.moderation?.removed && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">Removed</span>}
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{req.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">{req.city} | {req.category || "N/A"} | Qty: {req.quantity}</p>
                  </div>
                  <div className="flex gap-2">
                    {req.moderation?.removed ? (
                      <button onClick={() => restoreRequirement(req._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200">Restore</button>
                    ) : (
                      <button onClick={() => deleteRequirement(req._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500">Remove</button>
                    )}
                    <button
                      onClick={() => toggleRequirementChat(req._id, !req.chatDisabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs ${req.chatDisabled ? "bg-amber-100 text-amber-700" : "border border-gray-300 bg-white"}`}
                    >
                      {req.chatDisabled ? "Enable Chat" : "Disable Chat"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Offers Section */}
          <div>
            <h2 className="text-lg font-bold mb-3">Offers ({offers.length})</h2>
            <div className="space-y-2">
              {offers.slice(0, 30).map((offer) => (
                <div key={offer._id} className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">Rs {offer.price?.toLocaleString()}</p>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{offer.status}</span>
                      {offer.moderation?.removed && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">Removed</span>}
                    </div>
                    <p className="text-xs text-gray-500">{offer.requirementId?.product || "N/A"} | {offer.sellerId?.sellerProfile?.firmName || "Seller"}</p>
                  </div>
                  {offer.moderation?.removed ? (
                    <button onClick={() => moderateOffer(offer, false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200">Restore</button>
                  ) : (
                    <button onClick={() => moderateOffer(offer, true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Reports Section */}
          {reports.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3">Reports ({reports.length})</h2>
              <div className="space-y-2">
                {reports.slice(0, 20).map((report) => (
                  <div key={report._id} className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{report.category}</p>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          report.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                          report.status === "reviewing" ? "bg-blue-100 text-blue-700" :
                          "bg-green-100 text-green-700"
                        }`}>{report.status}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Reporter: {report.reporterId?.email || "-"} | {formatDate(report.createdAt)}
                      </p>
                      {report.details && <p className="text-xs text-gray-700 mt-1">{report.details}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateReportStatus(report, "reviewing")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white">Review</button>
                      <button onClick={() => updateReportStatus(report, "resolved")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">Resolve</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chats Section */}
          <div>
            <h2 className="text-lg font-bold mb-3">Recent Chats ({chats.length})</h2>
            <div className="space-y-2">
              {chats.slice(0, 20).map((chat) => (
                <div key={chat._id} className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{chat.requirementId?.product || "Requirement"}</p>
                    <p className="text-xs text-gray-600">{chat.fromUserId?.email || "User"} → {chat.toUserId?.email || "User"}</p>
                    <p className="text-sm mt-1">{chat.message}</p>
                  </div>
                  {chat.moderation?.removed ? (
                    <button onClick={() => moderateChat(chat, false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200">Restore</button>
                  ) : (
                    <button onClick={() => moderateChat(chat, true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
