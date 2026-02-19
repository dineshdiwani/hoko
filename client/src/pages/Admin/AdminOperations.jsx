import { useCallback, useEffect, useState } from "react";
import api from "../../utils/adminApi";
import { confirmDialog } from "../../utils/dialogs";
import AdminNav from "../../components/AdminNav";

export default function AdminOperations() {
  const [users, setUsers] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [offers, setOffers] = useState([]);
  const [chats, setChats] = useState([]);
  const [reports, setReports] = useState([]);
  const [expandedUsers, setExpandedUsers] = useState(new Set());

  const loadData = useCallback(async () => {
    const [usersRes, requirementsRes, offersRes, chatsRes, reportsRes] = await Promise.all([
      api.get("/admin/users"),
      api.get("/admin/requirements"),
      api.get("/admin/offers"),
      api.get("/admin/chats"),
      api.get("/admin/reports")
    ]);
    setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    setRequirements(Array.isArray(requirementsRes.data) ? requirementsRes.data : []);
    setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
    setChats(Array.isArray(chatsRes.data) ? chatsRes.data : []);
    setReports(Array.isArray(reportsRes.data) ? reportsRes.data : []);
  }, []);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

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
    await loadData();
  };

  const toggleUserBlock = async (userId, blocked) => {
    await api.post("/admin/user/block", { userId, blocked });
    await loadData();
  };

  const forceLogoutUser = async (userId) => {
    await api.post("/admin/user/force-logout", { userId });
    await loadData();
  };

  const toggleUserChat = async (userId, disabled) => {
    await api.post("/admin/user/chat-toggle", { userId, disabled });
    await loadData();
  };

  const deleteRequirement = async (id) => {
    const confirmed = await confirmDialog("Remove this requirement?");
    if (!confirmed) return;
    await api.post(`/admin/requirement/${id}/moderate`, {
      removed: true,
      reason: "Removed by admin"
    });
    await loadData();
  };

  const restoreRequirement = async (id) => {
    await api.post(`/admin/requirement/${id}/moderate`, { removed: false });
    await loadData();
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
    await loadData();
  };

  const moderateChat = async (chat, removed) => {
    const reason = removed
      ? prompt("Reason for removing this message?") || "Removed by admin"
      : "Restored by admin";
    await api.post(`/admin/chat/${chat._id}/moderate`, { removed, reason });
    await loadData();
  };

  const updateReportStatus = async (report, status) => {
    const adminNote =
      status === "resolved"
        ? prompt("Resolution note (optional)") || ""
        : prompt("Admin note (optional)") || "";
    await api.post(`/admin/report/${report._id}/status`, { status, adminNote });
    await loadData();
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
          <h1 className="page-hero">Admin Operations</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => loadData().catch(() => {})}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Refresh
            </button>
            <AdminNav />
          </div>
        </div>

        <div className="space-y-10">
          <div>
            <h2 className="text-lg font-bold mb-3">Users Signed List</h2>
            <div className="space-y-3">
              {users.slice(0, 60).map((user) => (
                <div key={user._id} className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div>
                    <p className="font-semibold text-sm">{user.email || "No email"}</p>
                    <p className="text-xs text-gray-500">
                      {user.roles?.admin ? "Admin" : user.roles?.seller ? "Seller" : "Buyer"} | {user.city || "N/A"}
                    </p>
                    {expandedUsers.has(user._id) && (
                      <div className="mt-2 text-xs text-gray-600 space-y-1">
                        <div>User ID: {user._id}</div>
                        <div>Blocked: {user.blocked ? "Yes" : "No"}</div>
                        {user.createdAt && <div>Joined: {new Date(user.createdAt).toLocaleString()}</div>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => toggleUserDetails(user._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white">
                      {expandedUsers.has(user._id) ? "Hide Details" : "User Details"}
                    </button>
                    <button onClick={() => forceLogoutUser(user._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white">
                      Force Logout
                    </button>
                    <button
                      onClick={() => toggleUserChat(user._id, !user.chatDisabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${user.chatDisabled ? "bg-amber-600 text-white" : "border border-gray-300 bg-white"}`}
                    >
                      {user.chatDisabled ? "Enable Chat" : "Disable Chat"}
                    </button>
                    {!user.roles?.admin && (
                      <button
                        onClick={() => toggleUserBlock(user._id, !user.blocked)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${user.blocked ? "bg-gray-600" : "bg-red-600"}`}
                      >
                        {user.blocked ? "Unblock" : "Block"}
                      </button>
                    )}
                    {user.roles?.seller && !user.roles?.admin && (
                      <button
                        onClick={() => toggleSellerApproval(user._id, !user.sellerProfile?.approved)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${user.sellerProfile?.approved ? "bg-red-600" : "bg-green-600"}`}
                      >
                        {user.sellerProfile?.approved ? "Revoke" : "Approve"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Recent Requirements</h2>
            <div className="space-y-3">
              {requirements.slice(0, 40).map((req) => (
                <div key={req._id} className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div>
                    <p className="font-semibold text-sm">{req.product || req.productName} | {req.city}</p>
                    <p className="text-xs text-gray-500">{req.category || "Category"} | {req.buyerId?.email || "Buyer"}</p>
                  </div>
                  <div className="flex gap-2">
                    {req.moderation?.removed ? (
                      <button onClick={() => restoreRequirement(req._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700">Restore</button>
                    ) : (
                      <button onClick={() => deleteRequirement(req._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600">Remove</button>
                    )}
                    <button
                      onClick={() => toggleRequirementChat(req._id, !req.chatDisabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${req.chatDisabled ? "bg-amber-600 text-white" : "border border-gray-300 bg-white"}`}
                    >
                      {req.chatDisabled ? "Enable Chat" : "Disable Chat"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Recent Offers</h2>
            <div className="space-y-3">
              {offers.slice(0, 40).map((offer) => (
                <div key={offer._id} className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div>
                    <p className="font-semibold text-sm">Rs {offer.price} | {offer.requirementId?.product || offer.requirementId?.productName}</p>
                    <p className="text-xs text-gray-500">{offer.sellerId?.sellerProfile?.firmName || "Seller"} | {offer.sellerId?.email || "-"}</p>
                  </div>
                  {offer.moderation?.removed ? (
                    <button onClick={() => moderateOffer(offer, false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700">Restore</button>
                  ) : (
                    <button onClick={() => moderateOffer(offer, true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Reports</h2>
            <div className="space-y-3">
              {reports.slice(0, 60).map((report) => (
                <div key={report._id} className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div>
                    <p className="font-semibold text-sm">{report.category}</p>
                    <p className="text-xs text-gray-600">
                      Reporter: {report.reporterId?.email || "-"} | Reported: {report.reportedUserId?.email || "-"}
                    </p>
                    {report.details && <p className="text-xs text-gray-700 mt-2">{report.details}</p>}
                    <p className="text-xs text-gray-500 mt-1">Status: {report.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateReportStatus(report, "reviewing")} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600">Mark Reviewing</button>
                    <button onClick={() => updateReportStatus(report, "resolved")} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-700">Resolve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Recent Chats</h2>
            <div className="space-y-3">
              {chats.slice(0, 60).map((chat) => (
                <div key={chat._id} className="bg-white border rounded-2xl p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div>
                    <p className="font-semibold text-sm">{chat.requirementId?.product || chat.requirementId?.productName || "Requirement"}</p>
                    <p className="text-xs text-gray-600">{chat.fromUserId?.email || "User"} to {chat.toUserId?.email || "User"}</p>
                    <p className="text-xs text-gray-800 mt-2">{chat.message}</p>
                  </div>
                  {chat.moderation?.removed ? (
                    <button onClick={() => moderateChat(chat, false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700">Restore</button>
                  ) : (
                    <button onClick={() => moderateChat(chat, true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600">Remove</button>
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
