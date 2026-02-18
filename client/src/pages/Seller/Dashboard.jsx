import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../services/api";
import socket from "../../services/socket";
import { fetchNotifications } from "../../services/notifications";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import { getSellerDashboardCategories, setSession } from "../../services/storage";
import NotificationCenter from "../../components/NotificationCenter";
import OfferModal from "../../components/OfferModal";
import ReviewModal from "../../components/ReviewModal";
import ReportModal from "../../components/ReportModal";
import ChatModal from "../../components/ChatModal";
import { confirmDialog } from "../../utils/dialogs";

export default function SellerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const menuRef = useRef(null);

  const [requirements, setRequirements] = useState([]);
  const [activeRequirement, setActiveRequirement] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRequirementId, setReviewRequirementId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [dashboardCategories, setDashboardCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCity, setSelectedCity] = useState("all");
  const [activeSmartTab, setActiveSmartTab] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPeer, setChatPeer] = useState(null);
  const [chatRequirementId, setChatRequirementId] = useState(null);
  const [unreadChatRequirementIds, setUnreadChatRequirementIds] = useState(new Set());
  const [reverseAuctionNotice, setReverseAuctionNotice] = useState("");

  const currentUserId = session?._id || session?.id || session?.userId || null;

  const normalizeCategory = (cat) => String(cat || "").toLowerCase().trim();
  const normalizeCity = (value) => String(value || "").trim().toLowerCase();
  const resolveCityValue = (value, cityList, fallback = "") => {
    const raw = String(value || "").trim();
    if (!raw) {
      return String(fallback || "").trim();
    }
    const matched = (Array.isArray(cityList) ? cityList : []).find(
      (city) => normalizeCity(city) === normalizeCity(raw)
    );
    return matched || raw;
  };
  const smartTabs = [
    { key: "all", label: "All" },
    { key: "today", label: "New Today" },
    { key: "offers", label: "My Offers" },
    { key: "auctions", label: "Auctions" }
  ];

  const isToday = (value) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date.toDateString() === new Date().toDateString();
  };

  const matchesSmartTab = (req) => {
    if (activeSmartTab === "all") return true;
    const createdAt = req.createdAt || req.created_at;
    if (activeSmartTab === "today") return isToday(createdAt);
    if (activeSmartTab === "offers") return !!req.myOffer;
    if (activeSmartTab === "auctions") {
      return req.myOffer && req.reverseAuction?.active === true;
    }
    return true;
  };

  useEffect(() => {
    if (!session?.token) {
      navigate("/seller/login");
    }
  }, [session, navigate]);

  useEffect(() => {
    const stored = getSellerDashboardCategories();
    setDashboardCategories(stored);
  }, []);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        setCities(Array.isArray(data?.cities) ? data.cities : []);
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
        const defaults = data?.defaults || {};
        const defaultCity = String(
          defaults.sellerDashboardCity || "all"
        ).trim();
        const defaultCategory = String(
          defaults.sellerDashboardCategory || "all"
        ).trim();
        setSelectedCity(defaultCity || "all");
        setSelectedCategory(defaultCategory || "all");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cityFromLink = String(params.get("city") || "").trim();
    if (cityFromLink) {
      setSelectedCity((prev) => resolveCityValue(cityFromLink, cities, prev));
    }
  }, [location.search, cities]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await api.get("/seller/dashboard", {
          params: {
            city: selectedCity || "all"
          }
        });
        setRequirements(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCity]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const openRequirement = String(
      params.get("openRequirement") || params.get("postId") || ""
    ).trim();
    if (!openRequirement) return;

    let cancelled = false;

    async function openLinkedRequirement() {
      let targetRequirement = requirements.find(
        (req) => String(req._id) === openRequirement
      );

      if (!targetRequirement) {
        try {
          const res = await api.get(`/seller/requirement/${openRequirement}`);
          targetRequirement = res.data || null;
        } catch {
          targetRequirement = null;
        }
      }

      if (cancelled) return;

      if (targetRequirement) {
        setActiveRequirement(targetRequirement);
      } else {
        setActiveRequirement({
          _id: openRequirement,
          product: "Requirement",
          productName: "Requirement"
        });
      }

      const nextParams = new URLSearchParams(location.search);
      nextParams.delete("openRequirement");
      nextParams.delete("postId");
      navigate(
        {
          pathname: location.pathname,
          search: nextParams.toString()
        },
        { replace: true }
      );
    }

    openLinkedRequirement();

    return () => {
      cancelled = true;
    };
  }, [loading, requirements, location.pathname, location.search, navigate]);

  useEffect(() => {
    let mounted = true;

    async function loadChatNotifications() {
      try {
        const allNotifications = await fetchNotifications();
        if (!mounted) return;
        const unreadIds = new Set(
          (allNotifications || [])
            .filter((n) => n?.type === "new_message" && !n?.read && n?.requirementId)
            .map((n) => String(n.requirementId))
        );
        setUnreadChatRequirementIds(unreadIds);
      } catch {
        if (mounted) {
          setUnreadChatRequirementIds(new Set());
        }
      }
    }

    if (currentUserId) {
      socket.emit("join", currentUserId);
    }
    loadChatNotifications();

    const onIncomingNotification = (notif) => {
      if (notif?.type !== "new_message" || !notif?.requirementId) return;
      setUnreadChatRequirementIds((prev) => {
        const next = new Set(prev);
        next.add(String(notif.requirementId));
        return next;
      });
    };

    socket.on("notification", onIncomingNotification);
    return () => {
      mounted = false;
      socket.off("notification", onIncomingNotification);
    };
  }, [currentUserId]);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const visibleRequirements = requirements.filter((req) => {
    if (selectedCategory === "all") return true;
    const normalizedCategory = normalizeCategory(req.category);
    if (!dashboardCategories.length) return true;
    return dashboardCategories.includes(normalizedCategory);
  });

  const smartTabRequirements = visibleRequirements.filter(matchesSmartTab);

  const filteredRequirements = smartTabRequirements.filter((req) => {
    const normalizedCategory = normalizeCategory(req.category);
    if (
      selectedCategory !== "all" &&
      normalizedCategory !== selectedCategory
    ) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      String(req.product || "").toLowerCase().includes(query) ||
      String(req.category || "").toLowerCase().includes(query) ||
      String(req.city || "").toLowerCase().includes(query)
    );
  });

  const liveAuctions = filteredRequirements.filter(
    (req) => req.myOffer && req.reverseAuction?.active === true
  ).length;
  const categoryFilterOptions = (
    categories.length ? categories : dashboardCategories
  )
    .map((cat) => {
      const label = String(cat || "").trim();
      const value = normalizeCategory(cat);
      return {
        label,
        value,
        preferred: dashboardCategories.includes(value)
      };
    })
    .filter((item) => item.value)
    .filter(
      (item, index, arr) =>
        arr.findIndex((other) => other.value === item.value) === index
    );

  const markOfferSubmitted = (requirementId) => {
    if (!requirementId) return;
    setRequirements((prev) =>
      prev.map((req) =>
        String(req._id) === String(requirementId) ? { ...req, myOffer: true } : req
      )
    );
  };

  async function handleDeleteOffer(requirementId) {
    const ok = await confirmDialog("Delete your offer for this requirement?", {
      title: "Delete Offer",
      confirmText: "Delete",
      cancelText: "Cancel"
    });
    if (!ok) return;
    try {
      await api.delete(`/seller/offer/${requirementId}`);
      setRequirements((prev) =>
        prev.map((req) =>
          String(req._id) === String(requirementId) ? { ...req, myOffer: false } : req
        )
      );
    } catch {
      alert("Failed to delete offer");
    }
  }

  function openSellerChat({ buyerId, buyerName, requirementId }) {
    if (!buyerId || !requirementId) return;
    const reqId = String(requirementId);
    setChatPeer({
      id: String(buyerId),
      name: buyerName || "Buyer"
    });
    setChatRequirementId(reqId);
    setUnreadChatRequirementIds((prev) => {
      const next = new Set(prev);
      next.delete(reqId);
      return next;
    });
    setChatOpen(true);
  }

  function handleNotificationClick(notification) {
    if (!notification) return;

    if (notification.type === "new_message") {
      const requirementId = notification.requirementId;
      const buyerId = notification.fromUserId?._id || notification.fromUserId;
      if (!requirementId || !buyerId) return;

      openSellerChat({
        buyerId,
        buyerName: "Buyer",
        requirementId
      });
      return;
    }

    if (notification.type === "reverse_auction_invoked") {
      const notificationReqId =
        notification?.data?.requirementId || notification.requirementId;
      if (!notificationReqId) return;
      const lowestPrice = notification?.data?.lowestPrice;
      const productName = notification?.data?.productName || "Product";
      setReverseAuctionNotice(
        typeof lowestPrice === "number"
          ? `Reverse Auction enabled by buyer for ${productName}. Current lowest price: Rs ${lowestPrice}.`
          : `Reverse Auction enabled by buyer for ${productName}.`
      );
      const existingRequirement = requirements.find(
        (req) => String(req._id) === String(notificationReqId)
      );
      if (existingRequirement) {
        setActiveRequirement({
          ...existingRequirement,
          reverseAuction: {
            ...(existingRequirement.reverseAuction || {}),
            active: true,
            lowestPrice:
              typeof lowestPrice === "number"
                ? lowestPrice
                : existingRequirement.reverseAuction?.lowestPrice ??
                  existingRequirement.currentLowestPrice ??
                  null
          },
          reverseAuctionActive: true,
          currentLowestPrice:
            typeof lowestPrice === "number"
              ? lowestPrice
              : existingRequirement.currentLowestPrice ??
                existingRequirement.reverseAuction?.lowestPrice ??
                null
        });
        return;
      }
      setActiveRequirement({
        _id: notificationReqId,
        product:
          notification?.data?.productName || "Product",
        productName:
          notification?.data?.productName || "Product",
        reverseAuction: {
          active: true,
          lowestPrice: notification?.data?.lowestPrice ?? null
        },
        reverseAuctionActive: true,
        currentLowestPrice: notification?.data?.lowestPrice ?? null
      });
    }
  }

  return (
    <div className="page flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[var(--ui-border)]">
        <div className="max-w-6xl mx-auto flex flex-wrap md:flex-nowrap justify-between items-center px-4 py-3 pl-16 md:pl-20 gap-2">
          <div>
            <h1 className="text-lg font-bold">Seller Dashboard</h1>
            <p className="text-xs text-[var(--ui-muted)]">Matching buyer requirements</p>
          </div>

          <div className="flex items-center flex-wrap md:flex-nowrap gap-2 w-full md:w-auto">
            <div className="flex items-center flex-wrap gap-2 flex-1 min-w-0">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="app-select w-[calc(50%-0.25rem)] md:w-auto text-xs"
              aria-label="Filter posts by city"
              title="Filter posts by city"
            >
              <option value="all">All cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="app-select w-[calc(50%-0.25rem)] md:w-auto text-xs"
              aria-label="Filter posts by category"
              title="Filter posts by category"
            >
              <option value="all">All categories</option>
              {categoryFilterOptions.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.preferred ? `✓ ${cat.label}` : cat.label}
                </option>
              ))}
            </select>

            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <NotificationCenter onNotificationClick={handleNotificationClick} />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="px-2 md:px-3 py-2 border rounded-xl text-xs md:text-sm font-medium bg-white"
              >
                {session?.name || "Seller"} v
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border overflow-hidden">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/seller/settings");
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-100"
                  >
                    Profile Settings
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        setSwitching(true);
                        const res = await api.post("/auth/switch-role", {
                          role: "buyer"
                        });
                        setSession({
                          _id: res.data.user._id,
                          role: res.data.user.role,
                          roles: res.data.user.roles,
                          email: res.data.user.email,
                          city: res.data.user.city,
                          name: "Buyer",
                          preferredCurrency: res.data.user.preferredCurrency,
                          token: res.data.token
                        });
                        setMenuOpen(false);
                        navigate("/buyer/dashboard");
                      } catch (err) {
                        const message = err?.response?.data?.message || "";
                        alert(message || "Unable to switch role");
                      } finally {
                        setSwitching(false);
                      }
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-100"
                  >
                    {switching
                      ? "Switching..."
                      : session?.roles?.buyer
                      ? "Switch to Buyer"
                      : "Become Buyer"}
                  </button>

                  <button
                    onClick={() => logout(navigate)}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="page-shell pt-4 pb-28">
          {reverseAuctionNotice && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-start justify-between gap-3">
              <span>{reverseAuctionNotice}</span>
              <button
                onClick={() => setReverseAuctionNotice("")}
                className="text-red-700 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {!loading && (
            <div className="flex flex-wrap gap-2 mb-4">
              {smartTabs.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setActiveSmartTab(option.key)}
                  className={`app-chip ${
                    activeSmartTab === option.key ? "app-chip-active" : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {!loading && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="app-stat">
                <p className="text-xs text-[var(--ui-muted)]">Total Matches</p>
                <p className="text-xl font-bold text-hoko-brand">{filteredRequirements.length}</p>
              </div>
              <div className="app-stat">
                <p className="text-xs text-[var(--ui-muted)]">Live Auctions</p>
                <p className="text-xl font-bold text-red-600">{liveAuctions}</p>
              </div>
            </div>
          )}

          {!loading && (
            <div className="app-filter-bar mb-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product, category, or city"
                  className="app-input flex-1"
                />
              </div>
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-gray-200 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && requirements.length === 0 && (
            <div className="text-center py-12 text-yellow-300">
              No matching buyer requirements right now.
            </div>
          )}

          {!loading && requirements.length > 0 && visibleRequirements.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              No posts match your dashboard categories. Update them in your profile.
            </div>
          )}

          {!loading &&
            requirements.length > 0 &&
            visibleRequirements.length > 0 &&
            filteredRequirements.length === 0 && (
              <div className="text-center py-12 text-gray-600">
                {activeSmartTab === "offers"
                  ? "No submitted offers yet."
                  : "No posts match the selected filters."}
              </div>
            )}

          <div className="space-y-4">
            {filteredRequirements.map((req) => {
              const isAuction = req.reverseAuction?.active === true;
              const showAuctionForSeller = req.myOffer && isAuction;
              const lowestPrice = req.reverseAuction?.lowestPrice ?? req.currentLowestPrice ?? "-";
              const attachments = Array.isArray(req.attachments) ? req.attachments : [];

              return (
                <div key={req._id} className="relative app-card">
                  {req.myOffer && (
                    <button
                      onClick={() => handleDeleteOffer(req._id)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center"
                      aria-label="Delete offer"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Z" />
                      </svg>
                    </button>
                  )}

                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-base text-[var(--ui-text)]">{req.product}</h3>
                      <p className="text-sm text-[var(--ui-muted)]">
                        Buyer from {req.city || "your city"} · {req.category}
                      </p>
                      {attachments.length > 0 && (
                        <p className="text-xs text-indigo-700 mt-1">
                          Attachments: {attachments.length}
                        </p>
                      )}
                    </div>

                    {showAuctionForSeller && (
                      <span
                        className={`text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium ${
                          req.myOffer ? "mr-10" : ""
                        }`}
                      >
                        REVERSE AUCTION
                      </span>
                    )}
                  </div>

                  {showAuctionForSeller && (
                    <>
                      <p className="text-sm text-red-700 mb-1">
                        Buyer has invoked Reverse Auction.
                      </p>
                      <p className="text-sm text-red-700 mb-2">
                        Current lowest price: Rs {lowestPrice}
                      </p>
                      <button
                        onClick={() => setActiveRequirement(req)}
                        className="text-sm font-semibold text-red-700 underline"
                      >
                        Edit your offer now
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => setActiveRequirement(req)}
                    className={`mt-3 block w-fit px-4 py-2.5 rounded-xl text-center font-semibold active:scale-95 ${
                      req.myOffer ? "bg-green-600 text-white" : "btn-brand"
                    }`}
                  >
                    {req.myOffer ? "Submitted Offer / Edit Offer" : "Submit Offer"}
                  </button>

                  {req.myOffer && req.buyerId && req.contactEnabledByBuyer && (
                    <>
                    <button
                      onClick={() =>
                        openSellerChat({
                          buyerId: req.buyerId?._id || req.buyerId,
                          buyerName: "Buyer",
                          requirementId: req._id
                        })
                      }
                      className="w-full mt-3 py-2 border border-blue-300 text-blue-700 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 relative"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                        <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4V7a2 2 0 0 1 2-2Zm2 4h12v2H6V9Zm0 4h8v2H6v-2Z" />
                      </svg>
                      Chat with Buyer
                      {unreadChatRequirementIds.has(String(req._id)) && (
                        <span className="absolute right-2 top-2 w-2.5 h-2.5 bg-red-500 rounded-full" />
                      )}
                    </button>
                    <div className="w-full mt-3 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setReviewTarget(req.buyerId);
                          setReviewRequirementId(req._id);
                          setReviewOpen(true);
                        }}
                        className="w-full py-2 border border-gray-300 rounded-xl text-sm font-semibold"
                      >
                        Rate Buyer
                      </button>
                      <button
                        onClick={() => {
                          setReportTarget(req.buyerId);
                          setReviewRequirementId(req._id);
                          setReportOpen(true);
                        }}
                        className="w-full py-2 border border-red-300 text-red-600 rounded-xl text-sm font-semibold"
                      >
                        Report Buyer
                      </button>
                    </div>
                    </>
                  )}

                  {req.myOffer && req.buyerId && !req.contactEnabledByBuyer && (
                    <p className="mt-3 text-xs text-[var(--ui-muted)]">
                      Buyer has not enabled chat for this post yet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {activeRequirement && (
        <OfferModal
          open={!!activeRequirement}
          requirement={activeRequirement}
          onClose={() => setActiveRequirement(null)}
          onSubmitted={markOfferSubmitted}
        />
      )}

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        reviewedUserId={reviewTarget}
        requirementId={reviewRequirementId}
        targetRole="buyer"
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={reportTarget}
        requirementId={reviewRequirementId}
      />

      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sellerId={chatPeer?.id}
        sellerName={chatPeer?.name || "Buyer"}
        requirementId={chatRequirementId}
      />
    </div>
  );
}
