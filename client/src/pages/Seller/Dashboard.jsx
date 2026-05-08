import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import socket, { connectSocket } from "../../services/socket";
import {
  fetchNotifications,
  markNotificationsReadByContext
} from "../../services/notifications";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import {
  getSellerDashboardCategories,
  getUiCitySelection,
  onSessionUpdated,
  setSession,
  setUiCitySelection
} from "../../services/storage";
import { generateSamplePostsForCity } from "../../services/samplePosts";
import NotificationCenter from "../../components/NotificationCenter";
import OfferModal from "../../components/OfferModal";
import ReviewModal from "../../components/ReviewModal";
import ReportModal from "../../components/ReportModal";
import ChatModal from "../../components/ChatModal";
import EmptyState from "../../components/EmptyState";
import { confirmDialog } from "../../utils/dialogs";
import { launchWhatsAppLink } from "../../utils/whatsapp";
import {
  extractAttachmentFileName,
  getAttachmentDisplayName,
  getAttachmentTypeMeta
} from "../../utils/attachments";
import { getPublicAppUrl, isNativeAppRuntime } from "../../utils/runtime";
import {
  getNotificationCategory,
  getNotificationEvent,
  getNotificationRequirementId,
  getNotificationState
} from "../../utils/notifications";



export default function SellerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [session, setSessionState] = useState(() => getSession());
  const menuRef = useRef(null);

  // Handle city/cats from URL params (from WhatsApp deep link)
  const sourceFromUrl = String(searchParams.get("from") || "").trim().toLowerCase();
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
  const openChatFromUrl =
    searchParams.get("openChat") === "1" || searchParams.get("chat") === "1";
  const chatRequirementFromUrl = searchParams.get("chatRequirementId") || "";
  const chatPeerFromUrl = searchParams.get("chatPeerId") || "";
  const chatPeerNameFromUrl = searchParams.get("chatPeerName") || "";
  const normalizeMobileValue = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/\+?\d{10,15}/);
    return match ? match[0].replace(/[^\d]/g, "") : raw.replace(/[^\d]/g, "");
  };
  const mobileFromUrl = normalizeMobileValue(searchParams.get("mobile") || "");
  const openRequirementFromUrl =
    searchParams.get("openRequirement") || searchParams.get("postId") || "";
  const whatsappContextMobile = mobileFromUrl || normalizeMobileValue(localStorage.getItem("whatsapp_mobile") || "");
  const whatsappContextCity = String(cityFromUrl || localStorage.getItem("whatsapp_city") || "").trim();
  const whatsappContextCats = String(catsFromUrl || localStorage.getItem("whatsapp_categories") || "").trim();

  const normalizeCategoryValue = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const normalizeSellerCityFilter = (value) => {
    const raw = String(value || "").trim();
    if (!raw || raw.toLowerCase() === "all") return "all";
    return raw;
  };
  const parseCategoryFromUrl = (value) =>
    String(value || "")
      .split(",")
      .map((entry) => normalizeCategoryValue(entry))
      .find(Boolean) || "all";
  const compactText = (value, fallback = "-") => {
    const text = String(value || "").trim();
    return text || fallback;
  };

  // Check for WhatsApp flow - simple check for from=wa
  const isWhatsAppFlow = sourceFromUrl === "wa";
  
  // Handle WhatsApp deep link - set mobile in localStorage for later use
  useEffect(() => {
    if (!isWhatsAppFlow) return;
    if (whatsappContextMobile) {
      localStorage.setItem("whatsapp_mobile", whatsappContextMobile);
    }
    if (whatsappContextCity) {
      localStorage.setItem("whatsapp_city", whatsappContextCity);
    }
    if (whatsappContextCats) {
      localStorage.setItem("whatsapp_categories", whatsappContextCats);
    }
  }, [isWhatsAppFlow, whatsappContextMobile, whatsappContextCity, whatsappContextCats]);

  // COMPLETELY BYPASS AUTH for WhatsApp flow - let them see dashboard
  const isWhatsAppPublicView = isWhatsAppFlow;
  
  const isPublicRequirementView = !session?.token && Boolean(openRequirementFromUrl);

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
  const [selectedCategory, setSelectedCategory] = useState(
    parseCategoryFromUrl(catsFromUrl)
  );
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCity, setSelectedCity] = useState(
    normalizeSellerCityFilter(
      cityFromUrl || getUiCitySelection(session?.city || "all")
    )
  );
  const [cityManuallySet, setCityManuallySet] = useState(false);
  const [activeSmartTab, setActiveSmartTab] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPeer, setChatPeer] = useState(null);
  const [chatRequirementId, setChatRequirementId] = useState(null);
  const [unreadChatRequirementIds, setUnreadChatRequirementIds] = useState(new Set());
  const [reverseAuctionNotice, setReverseAuctionNotice] = useState("");
  const [showingSampleData, setShowingSampleData] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const loadMoreRef = useRef(null);
  
  const allowSellerSamplePosts =
    import.meta.env.DEV;

  const currentUserId = session?._id || session?.id || session?.userId || null;
  const lastSyncedProfileCityRef = useRef(String(session?.city || "").trim());
  const handleCityChange = useCallback((nextCity) => {
    const normalized = normalizeSellerCityFilter(nextCity);
    setSelectedCity(normalized);
    setCityManuallySet(true);
    setUiCitySelection(normalized);
  }, []);
  const shouldPaginateRequirements =
    isWhatsAppPublicView ||
    String(selectedCity || "").trim().toLowerCase() === "all" ||
    String(selectedCategory || "").trim().toLowerCase() === "all";
  const loadSellerRequirements = useCallback(
    async ({ nextPage = 1, append = false } = {}) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        if (isWhatsAppPublicView) {
          const publicCity =
            String(selectedCity || "").trim().toLowerCase() === "all"
              ? ""
              : String(selectedCity || "").trim();
          const publicCategory =
            String(selectedCategory || "").trim().toLowerCase() === "all"
              ? ""
              : String(selectedCategory || "").trim();
          const params = shouldPaginateRequirements
            ? {
                ...(publicCity ? { city: publicCity } : {}),
                ...(publicCategory ? { category: publicCategory } : {}),
                page: nextPage,
                limit: 50
              }
            : {
                ...(publicCity ? { city: publicCity } : {}),
                ...(publicCategory ? { category: publicCategory } : {})
              };
          const res = await api.get("/meta/requirements", { params });
          const rows = Array.isArray(res.data) ? res.data : [];
          const nextTotal = Number(res?.headers?.["x-total-count"] || rows.length || 0);
          if (allowSellerSamplePosts && rows.length === 0 && !append) {
            const samplePosts = generateSamplePostsForCity(
              selectedCity && selectedCity !== "all" ? selectedCity : (session?.city || "Mumbai"),
              categories.length ? categories : ["Electronics & Appliances"],
              50
            );
            setRequirements(samplePosts);
            setShowingSampleData(true);
            setHasMore(false);
            setPage(1);
            setTotalCount(samplePosts.length);
            return;
          }
          setRequirements((prev) => (append ? [...prev, ...rows] : rows));
          setShowingSampleData(false);
          setTotalCount(Number.isFinite(nextTotal) ? nextTotal : 0);
          setHasMore(shouldPaginateRequirements && rows.length >= 50);
          setPage(nextPage);
        } else {
          const params = shouldPaginateRequirements
            ? {
                city: selectedCity || "all",
                category: selectedCategory || "all",
                page: nextPage,
                limit: 50
              }
            : {
                city: selectedCity || "all",
                category: selectedCategory || "all"
              };
          const res = await api.get("/seller/dashboard", { params });
          const liveRows = Array.isArray(res.data) ? res.data : [];
          const nextTotal = Number(res?.headers?.["x-total-count"] || liveRows.length || 0);

          if (allowSellerSamplePosts && liveRows.length === 0 && !append) {
            const samplePosts = generateSamplePostsForCity(
              selectedCity && selectedCity !== "all" ? selectedCity : (session?.city || "Mumbai"),
              categories.length ? categories : ["Electronics & Appliances"],
              50
            );
            setRequirements(samplePosts);
            setShowingSampleData(true);
            setHasMore(false);
            setPage(1);
            setTotalCount(samplePosts.length);
            return;
          }

          setRequirements((prev) => (append ? [...prev, ...liveRows] : liveRows));
          setShowingSampleData(false);
          setTotalCount(Number.isFinite(nextTotal) ? nextTotal : 0);
          setHasMore(shouldPaginateRequirements && liveRows.length >= 50);
          setPage(nextPage);
        }
      } catch (err) {
        if (!append) {
          setRequirements([]);
        }
        setShowingSampleData(false);
        setHasMore(false);
        setTotalCount(0);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      allowSellerSamplePosts,
      categories,
      isWhatsAppPublicView,
      selectedCategory,
      selectedCity,
      session?.city,
      shouldPaginateRequirements
    ]
  );

  useEffect(() => {
    const syncSession = () => setSessionState(getSession());
    syncSession();
    const unsubscribe = onSessionUpdated(syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  // Handle post-login redirect for pending offer submission
  useEffect(() => {
    if (!session?.token) return;
    
    const pendingOffer = JSON.parse(localStorage.getItem("pending_seller_offer_intent") || "null");
    if (!pendingOffer || !pendingOffer.requirementId) return;
    
    // Check if this is a post-login redirect
    const redirectSource = localStorage.getItem("post_login_redirect_source");
    if (redirectSource !== "offer") return;
    
    // Clear the pending offer and redirect
    localStorage.removeItem("pending_seller_offer_intent");
    localStorage.removeItem("pending_offer_data");
    localStorage.removeItem("post_login_redirect");
    localStorage.removeItem("post_login_redirect_source");
    localStorage.removeItem(`seller_offer_draft:${String(pendingOffer.requirementId).trim()}`);
    
    // Submit the offer
    const submitOffer = async () => {
      try {
        const payload = {
          price: Number(pendingOffer.offerPayload?.price) || 0,
          message: pendingOffer.offerPayload?.message || "",
          deliveryTime: pendingOffer.offerPayload?.deliveryTime || "",
          paymentTerms: pendingOffer.offerPayload?.paymentTerms || "",
          mobile: pendingOffer.offerPayload?.mobile || session?.mobile || "",
          sellerCity: pendingOffer.offerPayload?.sellerCity || session?.city || ""
        };
        
        await api.post(`/seller/requirement/${pendingOffer.requirementId}/offer`, payload);
        alert("Offer submitted successfully!");
        
        // Refresh the page to show updated offers
        window.location.reload();
      } catch (err) {
        console.error("[Dash] Failed to submit pending offer:", err);
        alert(err?.response?.data?.message || "Failed to submit offer. Please try again.");
      }
    };
    
    submitOffer();
  }, [session?.token]);

  // Handle autoSubmit from URL (WhatsApp flow)
  useEffect(() => {
    const autoSubmit = searchParams.get("autoSubmit");
    if (autoSubmit !== "true") return;
    if (!session?.token) return;
    
    // Check if we have requirementId to submit to
    const requirementId = searchParams.get("requirementId") || "";
    if (!requirementId) return;
    
    // Clear the autoSubmit param
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("autoSubmit");
    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString()
      },
      { replace: true }
    );
    
    // The actual submission will be handled by the OfferModal when opened
  }, [session?.token, location.search, navigate, searchParams]);

  useEffect(() => {
    if (cityManuallySet) return;
    const latestProfileCity = String(session?.city || "").trim();
    if (!latestProfileCity) return;
    setSelectedCity((prev) => {
      const current = String(prev || "").trim();
      const previousDefault = String(lastSyncedProfileCityRef.current || "").trim();
      const shouldFollowDefault =
        !current ||
        current.toLowerCase() === "all" ||
        current.toLowerCase() === previousDefault.toLowerCase();
      if (shouldFollowDefault) {
        setUiCitySelection(latestProfileCity);
      }
      return shouldFollowDefault ? latestProfileCity : prev;
    });
    lastSyncedProfileCityRef.current = latestProfileCity;
  }, [session?.city, cityManuallySet]);

  const normalizeCategory = (cat) => String(cat || "").toLowerCase().trim();
  const normalizeCity = (value) => String(value || "").trim().toLowerCase();
  const normalizeCityKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const cityMatches = (left, right) => {
    const a = normalizeCityKey(left);
    const b = normalizeCityKey(right);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
  };
  const getEffectiveInviteMode = (req) => {
    const explicitMode = String(req?.offerInvitedFromEffective || "").trim();
    if (explicitMode === "anywhere" || explicitMode === "city") {
      return explicitMode;
    }
    return String(req?.offerInvitedFrom || "").trim().toLowerCase() === "anywhere"
      ? "anywhere"
      : "city";
  };
  const getOutcomeLabel = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "selected") return "Selected";
    if (normalized === "shortlisted") return "Shortlisted";
    if (normalized === "rejected") return "Rejected";
    return "Pending";
  };
  const getOutcomeClassName = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "selected") {
      return "border border-green-200 bg-green-50 text-green-700";
    }
    if (normalized === "shortlisted") {
      return "border border-amber-200 bg-amber-50 text-amber-800";
    }
    if (normalized === "rejected") {
      return "border border-red-200 bg-red-50 text-red-700";
    }
    return "border border-slate-200 bg-slate-50 text-slate-700";
  };
  const appBaseUrl =
    getPublicAppUrl();
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
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
    { key: "auctions", label: "Auctions" }
  ];

  const isToday = (value) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date.toDateString() === new Date().toDateString();
  };

  const isThisWeek = (value) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return date >= start && date < end;
  };

  const isThisMonth = (value) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  };

  const isThisYear = (value) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === new Date().getFullYear();
  };

  const matchesSmartTab = (req) => {
    if (activeSmartTab === "all") return true;
    const createdAt = req.createdAt || req.created_at;
    if (activeSmartTab === "today") return isToday(createdAt);
    if (activeSmartTab === "week") return isThisWeek(createdAt);
    if (activeSmartTab === "month") return isThisMonth(createdAt);
    if (activeSmartTab === "year") return isThisYear(createdAt);
    if (activeSmartTab === "auctions") {
      return req.myOffer && req.reverseAuction?.active === true;
    }
    return true;
  };

  function navigateToLogin() {
    const params = new URLSearchParams();
    if (whatsappContextMobile) params.set("mobile", whatsappContextMobile);
    if (whatsappContextCity) params.set("city", whatsappContextCity);
    if (whatsappContextCats) params.set("cats", whatsappContextCats);
    params.set("from", "wa");
    navigate(`/seller/login?${params.toString()}`);
  }

  function buildWhatsAppOfferResumeTarget(req) {
    const params = new URLSearchParams();
    const requirementId = String(req?._id || "").trim();
    const waMobile =
      whatsappContextMobile ||
      normalizeMobileValue(localStorage.getItem("whatsapp_mobile") || "");
    const reqCity = String(whatsappContextCity || req?.city || "").trim();
    const reqCategory = String(whatsappContextCats || req?.category || "").trim();
    if (requirementId) params.set("openRequirement", requirementId);
    if (waMobile) params.set("mobile", waMobile);
    if (reqCity) params.set("city", reqCity);
    if (reqCategory) params.set("cats", reqCategory);
    params.set("from", "wa");
    return `/seller/dashboard${params.toString() ? `?${params.toString()}` : ""}`;
  }

  function goToSellerLoginForOffer(req) {
    const requirementId = String(req?._id || "").trim();
    if (!requirementId) return;

    const waMobile =
      whatsappContextMobile ||
      normalizeMobileValue(localStorage.getItem("whatsapp_mobile") || "");
    const params = new URLSearchParams();
    if (waMobile) params.set("mobile", waMobile);
    if (whatsappContextCity || String(req?.city || "").trim()) params.set("city", whatsappContextCity || String(req.city).trim());
    if (whatsappContextCats || String(req?.category || "").trim()) params.set("cats", whatsappContextCats || String(req.category).trim());
    params.set("from", "wa");

    const resumeTarget = buildWhatsAppOfferResumeTarget(req);
    localStorage.setItem("post_login_redirect", resumeTarget);
    localStorage.setItem("post_login_redirect_source", "offer");
    localStorage.setItem("login_intent_role", "seller");

    navigate(`/seller/login?${params.toString()}`, { replace: true });
  }

  function goToSellerRegisterForOffer(req) {
    const requirementId = String(req?._id || "").trim();
    if (!requirementId) return;

    const waMobile =
      whatsappContextMobile ||
      normalizeMobileValue(localStorage.getItem("whatsapp_mobile") || "");
    const params = new URLSearchParams();
    if (waMobile) params.set("mobile", waMobile);
    if (whatsappContextCity || String(req?.city || "").trim()) params.set("city", whatsappContextCity || String(req.city).trim());
    if (whatsappContextCats || String(req?.category || "").trim()) params.set("cats", whatsappContextCats || String(req.category).trim());
    params.set("from", "wa");
    params.set("requirementId", requirementId);

    const resumeTarget = buildWhatsAppOfferResumeTarget(req);
    localStorage.setItem("post_login_redirect", resumeTarget);
    localStorage.setItem("post_login_redirect_source", "offer");
    localStorage.setItem("login_intent_role", "seller");

    navigate(`/seller/register?${params.toString()}`, { replace: true });
  }

  function handleSellerOfferClick(req, { isSample = false, isCityLocked = false } = {}) {
    if (!req || isSample || isCityLocked) return;
    if (!session?.token) {
      goToSellerLoginForOffer(req);
      return;
    }
    const hasSellerProfile =
      Boolean(session?.roles?.seller) &&
      Boolean(session?.sellerProfile?.registeredBusinessName) &&
      Boolean(session?.sellerProfile?.managerName);
    if (!hasSellerProfile) {
      goToSellerRegisterForOffer(req);
      return;
    }
    setActiveRequirement(req);
  }

  useEffect(() => {
    // NEVER redirect for WhatsApp flow - let them see the dashboard
    if (isWhatsAppFlow || isWhatsAppPublicView) {
      return;
    }
    // For logged-in users, also stay on dashboard
    if (session?.token) {
      return;
    }
    // Only redirect if NOT in WhatsApp flow and NOT logged in
    navigate("/seller/login");
  }, [session, navigate, isWhatsAppPublicView, isWhatsAppFlow]);

  useEffect(() => {
    const stored = getSellerDashboardCategories();
    setDashboardCategories(stored);
  }, []);

  useEffect(() => {
    setRequirements([]);
    setHasMore(false);
    setPage(1);
    setShowingSampleData(false);
    loadSellerRequirements({ nextPage: 1, append: false });
  }, [
    selectedCity,
    selectedCategory,
    session?.city,
    allowSellerSamplePosts,
    isWhatsAppPublicView,
    isWhatsAppFlow,
    categories,
    loadSellerRequirements
  ]);

  useEffect(() => {
    if (!shouldPaginateRequirements || !hasMore || loading || loadingMore || showingSampleData) {
      return undefined;
    }
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && !loadingMore && !loading && hasMore) {
          loadSellerRequirements({ nextPage: page + 1, append: true });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    hasMore,
    loadSellerRequirements,
    loading,
    loadingMore,
    page,
    shouldPaginateRequirements,
    showingSampleData
  ]);

  useEffect(() => {
    const openRequirement = String(
      searchParams.get("openRequirement") || searchParams.get("postId") || ""
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

      if (isPublicRequirementView) {
        return;
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
            .filter(
              (n) =>
                getNotificationCategory(n) === "chat" &&
                !n?.read &&
                getNotificationRequirementId(n)
            )
            .map((n) => String(getNotificationRequirementId(n)))
        );
        setUnreadChatRequirementIds(unreadIds);
      } catch {
        if (mounted) {
          setUnreadChatRequirementIds(new Set());
        }
      }
    }

    if (currentUserId) {
      connectSocket();
    }
    loadChatNotifications();

    const onIncomingNotification = (notif) => {
      const requirementId = getNotificationRequirementId(notif);
      if (getNotificationCategory(notif) !== "chat" || !requirementId) return;
      setUnreadChatRequirementIds((prev) => {
        const next = new Set(prev);
        next.add(String(requirementId));
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

  // Load cities and categories for filters
  useEffect(() => {
    fetchOptions()
      .then((data) => {
        // Use defaults if API fails or returns empty
        const nextCities = Array.isArray(data?.cities) && data.cities.length ? data.cities : [
          "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune",
          "Ahmedabad", "Surat", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore",
          "Thane", "Bhopal", "Visakhapatnam", "Patna", "Vadodara", "Ghaziabad",
          "Noida", "Coimbatore", "Chandigarh", "Jodhpur", "Madurai", "Kochi"
        ];
        setCities(nextCities);
        
        if (!cityManuallySet) {
          const profileCity = String(session?.city || "").trim();
          if (isWhatsAppFlow && cityFromUrl) {
            setSelectedCity(cityFromUrl);
          } else if (profileCity) {
            setSelectedCity(profileCity);
          }
        }
        
        const nextCategories = Array.isArray(data?.categories) && data.categories.length ? data.categories : [
          "Electronics & Appliances", "Furniture & Home", "Vehicles & Parts",
          "Industrial Machinery", "Electrical Parts", "Construction Materials",
          "Services & Maintenance", "Raw Materials", "Chemicals & Plastics",
          "Packaging", "Textiles & Apparel", "Food & Agriculture",
          "Health & Safety", "Logistics & Transport", "Business Services"
        ];
        setCategories(nextCategories);
        const urlCategory = parseCategoryFromUrl(catsFromUrl);
        if (urlCategory !== "all") {
          setSelectedCategory(urlCategory);
        } else {
          setSelectedCategory("all");
        }
      })
      .catch(() => {});
  }, [session?.city, catsFromUrl, isWhatsAppFlow, cityFromUrl, cityManuallySet]);

  const visibleRequirements = requirements;

  const smartTabRequirements = visibleRequirements.filter(matchesSmartTab);

  const filteredRequirements = smartTabRequirements.filter((req) => {
    const effectiveInviteMode = getEffectiveInviteMode(req);
    if (
      selectedCity !== "all" &&
      effectiveInviteMode !== "anywhere" &&
      !cityMatches(req.city, selectedCity)
    ) {
      return false;
    }
    const normalizedCategory = normalizeCategoryValue(req.category);
    if (
      selectedCategory !== "all" &&
      normalizedCategory !== selectedCategory
    ) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      String(req.product || req.productName || "").toLowerCase().includes(query) ||
      String(req.makeBrand || req.brand || "").toLowerCase().includes(query) ||
      String(req.typeModel || "").toLowerCase().includes(query) ||
      String(req.category || "").toLowerCase().includes(query) ||
      String(req.city || "").toLowerCase().includes(query) ||
      String(req.details || req.description || "").toLowerCase().includes(query)
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
      const value = normalizeCategoryValue(cat);
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

    // Check if seller already has profile
    const hasSellerProfile = session?.sellerProfile?.registeredBusinessName && session?.sellerProfile?.managerName;
    
    // Show prompt for registration only if not registered
    setTimeout(() => {
      alert("Offer submitted successfully!");
      
      if (!hasSellerProfile) {
        const wantsToRegister = confirm(
          "Complete your seller profile to get better visibility and manage offers?"
        );
        if (wantsToRegister) {
          navigate("/seller/register");
        }
      }
    }, 500);
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
    markNotificationsReadByContext({
      category: "chat",
      requirementId: reqId,
      fromUserId: String(buyerId)
    }).catch(() => {});
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

  async function openRequirementAttachment(attachment, index = 0) {
    const newTab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const filename = extractAttachmentFileName(attachment, index);
      if (!filename) throw new Error("Invalid attachment path");
      const res = await api.get(`/buyer/attachments/${encodeURIComponent(filename)}`, {
        responseType: "blob"
      });
      const blobUrl = window.URL.createObjectURL(res.data);
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      if (newTab) newTab.close();
      alert("Unable to open attachment.");
    }
  }

  function getShareText(req) {
    const reqId = String(req?._id || "").trim();
    if (!reqId) return "";
    const packed = encodeURIComponent(
      JSON.stringify({
        postId: reqId,
        city: String(req?.city || ""),
        product: String(req?.product || req?.productName || ""),
        category: String(req?.category || ""),
        qty: String(req?.quantity || ""),
        unit: String(req?.type || req?.unit || ""),
        brand: String(req?.makeBrand || req?.brand || ""),
        model: String(req?.typeModel || ""),
        details: String(req?.details || req?.description || ""),
        invite: String(req?.offerInvitedFrom || "")
      })
    );
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(
      reqId
    )}?pd=${packed}`;
    const product = req.product || req.productName || "Requirement";
    const quantity = req.quantity ? `${req.quantity} ${req.type || req.unit || ""}` : "";
    const parts = [
      `${product}${quantity ? ` (${quantity})` : ""}`,
      req.category ? `Category: ${req.category}` : "",
      req.city ? `City: ${req.city}` : ""
    ].filter(Boolean);
    return `${parts.join(" | ")}\nSubmit offer on hoko: ${deepLink}`;
  }

  function getWhatsAppShareText(req) {
    const reqId = String(req?._id || "").trim();
    if (!reqId) return "";
    const query = new URLSearchParams();
    query.set("openRequirement", reqId);
    const city = String(req?.city || "").trim();
    const category = String(req?.category || "").trim();
    if (city) query.set("city", city);
    if (category) query.set("cats", category);
    const deepLink = `${appBaseUrl}/seller/dashboard?${query.toString()}`;
    const product = String(req?.product || req?.productName || "PRODUCT / SERVICE").trim();
    const quantityValue = String(req?.quantity || "").trim();
    const quantityUnit = String(req?.type || req?.unit || "").trim();
    const quantity = [quantityValue, quantityUnit].filter(Boolean).join(" ") || "NUMBER + UNIT";
    const make = String(req?.makeBrand || req?.brand || "").trim();
    const model = String(req?.typeModel || "").trim();
    const makeModel = [make, model].filter(Boolean).join(" ") || "BRAND + MODEL";
    const buyerCity = String(req?.city || "").trim() || "CITY";

    return [
      "*URGENT BUYER REQUIREMENT*",
      "",
      `Looking for: *${product}*`,
      `Quantity: *${quantity}*`,
      `Make/Model: *${makeModel}*`,
      `Buyer City: *${buyerCity}*`,
      "",
      "Suppliers, please share:",
      "- Best Price",
      "- Delivery Timeline",
      "- Availability Status",
      "",
      "*Send your best offer now:*",
      deepLink
    ].join("\n");
  }

  function getSocialShareText(req) {
    const reqId = String(req?._id || "").trim();
    if (!reqId) return "";
    const query = new URLSearchParams();
    const city = String(req?.city || "").trim();
    const category = String(req?.category || "").trim();
    if (city) query.set("city", city);
    if (category) query.set("cats", category);
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(reqId)}${query.toString() ? `?${query.toString()}` : ""}`;
    const product = String(req?.product || req?.productName || "PRODUCT / SERVICE").trim();
    const quantityValue = String(req?.quantity || "").trim();
    const quantityUnit = String(req?.type || req?.unit || "").trim();
    const quantity = [quantityValue, quantityUnit].filter(Boolean).join(" ") || "NUMBER + UNIT";
    const make = String(req?.makeBrand || req?.brand || "").trim();
    const model = String(req?.typeModel || "").trim();
    const makeModel = [make, model].filter(Boolean).join(" ") || "BRAND + MODEL";
    const buyerCity = String(req?.city || "").trim() || "CITY";

    return [
      "URGENT BUYER REQUIREMENT",
      "",
      `Looking for: ${product}`,
      `Quantity: ${quantity}`,
      `Make/Model: ${makeModel}`,
      `Buyer City: ${buyerCity}`,
      "",
      "Suppliers, please share:",
      "- Best Price",
      "- Delivery Timeline",
      "- Availability Status",
      "",
      "Send your best offer now:",
      deepLink
    ].join("\n");
  }

  function getFacebookQuoteText(req) {
    const product = String(req?.product || req?.productName || "PRODUCT / SERVICE").trim();
    const quantityValue = String(req?.quantity || "").trim();
    const quantityUnit = String(req?.type || req?.unit || "").trim();
    const quantity = [quantityValue, quantityUnit].filter(Boolean).join(" ") || "NUMBER + UNIT";
    const make = String(req?.makeBrand || req?.brand || "").trim();
    const model = String(req?.typeModel || "").trim();
    const makeModel = [make, model].filter(Boolean).join(" ") || "BRAND + MODEL";
    const buyerCity = String(req?.city || "").trim() || "CITY";
    return [
      "URGENT BUYER REQUIREMENT",
      `Looking for: ${product}`,
      `Quantity: ${quantity}`,
      `Make/Model: ${makeModel}`,
      `Buyer City: ${buyerCity}`,
      "Suppliers: Best Price | Delivery Timeline | Availability"
    ].join(" | ");
  }

  function getShareLinks(req) {
    const reqId = String(req?._id || "").trim();
    const query = new URLSearchParams();
    query.set("openRequirement", reqId);
    const city = String(req?.city || "").trim();
    const category = String(req?.category || "").trim();
    if (city) query.set("city", city);
    if (category) query.set("cats", category);
    const deepLink = `${appBaseUrl}/seller/dashboard?${query.toString()}`;
    const whatsappText = encodeURIComponent(getWhatsAppShareText(req));
    const socialText = encodeURIComponent(getSocialShareText(req));
    const socialTextRaw = getSocialShareText(req);
    const url = encodeURIComponent(deepLink);
    const facebookQuote = encodeURIComponent(getFacebookQuoteText(req).slice(0, 450));
    const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    const facebookAppId = String(import.meta.env.VITE_FACEBOOK_APP_ID || "").trim();
    const facebookLink = facebookAppId
      ? `https://www.facebook.com/dialog/share?app_id=${encodeURIComponent(
          facebookAppId
        )}&display=popup&href=${url}&quote=${facebookQuote}`
      : `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${facebookQuote}`;
    return {
      whatsapp: `https://wa.me/?text=${whatsappText}`,
      facebook: facebookLink,
      mail: `mailto:?subject=${encodeURIComponent("URGENT BUYER REQUIREMENT")}&body=${socialText}`,
      linkedin: linkedinShareUrl
    };
  }

  function openShareLink(url) {
    const target = String(url || "").trim();
    if (!target) return;
    if (/wa\.me|api\.whatsapp\.com|whatsapp:|intent:\/\//i.test(target)) {
      launchWhatsAppLink(target);
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  }

  async function openRequirementWithHighlights(requirementId, changedFields = []) {
    if (!requirementId) return;
    const existingRequirement = requirements.find(
      (req) => String(req._id) === String(requirementId)
    );
    const highlightPayload = {
      _changeHighlights: Array.isArray(changedFields) ? changedFields : []
    };
    if (existingRequirement) {
      setActiveRequirement({
        ...existingRequirement,
        ...highlightPayload
      });
      return;
    }
    try {
      const res = await api.get(`/seller/requirement/${requirementId}`);
      const latestRequirement = res?.data || null;
      if (!latestRequirement) return;
      setActiveRequirement({
        ...latestRequirement,
        ...highlightPayload
      });
    } catch {
      setActiveRequirement({
        _id: requirementId,
        product: "Requirement",
        productName: "Requirement",
        ...highlightPayload
      });
    }
  }

  function handleNotificationClick(notification) {
    if (!notification) return;
    const category = getNotificationCategory(notification);
    const event = getNotificationEvent(notification);
    const state = getNotificationState(notification);
    const requirementId = getNotificationRequirementId(notification);

    if (category === "chat") {
      const buyerId = notification.fromUserId?._id || notification.fromUserId;
      if (!requirementId || !buyerId) return;

      openSellerChat({
        buyerId,
        buyerName: "Buyer",
        requirementId
      });
      return;
    }

    if (category === "reverse_auction") {
      if (!requirementId) return;
      markNotificationsReadByContext({
        category: "reverse_auction",
        requirementId: String(requirementId)
      }).catch(() => {});
      const lowestPrice = notification?.data?.lowestPrice;
      const productName = notification?.data?.productName || "Product";
      setReverseAuctionNotice(
        typeof lowestPrice === "number"
          ? `Reverse Auction enabled by buyer for ${productName}. Current lowest price: Rs ${lowestPrice}.`
          : `Reverse Auction enabled by buyer for ${productName}.`
      );
      const existingRequirement = requirements.find(
        (req) => String(req._id) === String(requirementId)
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
        _id: requirementId,
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
      return;
    }

    if (category === "offer_outcome") {
      if (!requirementId) return;
      markNotificationsReadByContext({
        category: "offer_outcome",
        requirementId: String(requirementId),
        state: state || undefined
      }).catch(() => {});
      openRequirementWithHighlights(requirementId, state ? ["offerOutcome", state] : ["offerOutcome"]);
      return;
    }

    if (category === "requirement" || category === "lead" || event === "new_offer") {
      if (!requirementId) return;
      if (category === "requirement") {
        markNotificationsReadByContext({
          category: "requirement",
          requirementId: String(requirementId)
        }).catch(() => {});
      }
      const changedFields = Array.isArray(notification?.data?.changedFields)
        ? notification.data.changedFields
        : [];
      openRequirementWithHighlights(requirementId, changedFields);
    }
  }

  useEffect(() => {
    if (!session?.token || !openChatFromUrl) return;
    const requirementId = String(chatRequirementFromUrl || "").trim();
    const peerId = String(chatPeerFromUrl || "").trim();
    if (!requirementId || !peerId || chatOpen) return;

    setChatPeer({
      id: peerId,
      name: String(chatPeerNameFromUrl || "Buyer").trim() || "Buyer"
    });
    setChatRequirementId(requirementId);
    setChatOpen(true);

    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("openChat");
    nextParams.delete("chat");
    nextParams.delete("chatRequirementId");
    nextParams.delete("chatPeerId");
    nextParams.delete("chatPeerName");
    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString()
      },
      { replace: true }
    );
  }, [
    session?.token,
    openChatFromUrl,
    chatRequirementFromUrl,
    chatPeerFromUrl,
    chatPeerNameFromUrl,
    chatOpen,
    navigate,
    location.pathname,
    location.search
  ]);

  return (
    <div className="page dashboard-layout">
      <header className="dashboard-header dashboard-layout-header">
        <div className="dashboard-shell dashboard-layout-header-row pl-16 md:pl-20">
          <div>
            <h1 className="ui-heading">Seller Dashboard</h1>
            <p className="ui-label text-[var(--ui-muted)]">
              Matching buyer requirements {loading ? "..." : `(${totalCount})`}
            </p>
          </div>

          <div className="flex items-center flex-wrap md:flex-nowrap gap-2 w-full md:w-auto">
            <div className="flex items-center flex-wrap gap-2 flex-1 min-w-0">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Set city
              </span>
              <select
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                className="app-select ui-body w-[calc(50%-0.25rem)] md:w-auto"
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
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="app-select ui-body w-[calc(50%-0.25rem)] md:w-auto"
              aria-label="Filter posts by category"
              title="Filter posts by category"
            >
              <option value="all">All categories</option>
              {categoryFilterOptions.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.preferred ? `[Preferred] ${cat.label}` : cat.label}
                </option>
              ))}
            </select>

            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <NotificationCenter onNotificationClick={handleNotificationClick} />

            <div className="relative" ref={menuRef}>
              {!session?.token && isWhatsAppPublicView ? (
                <button
                  onClick={() => navigateToLogin()}
                  className="ui-btn-primary px-4 py-2"
                >
                  Login
                </button>
              ) : (
                <>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="ui-btn-secondary ui-button-text px-2 md:px-3 py-2"
                >
                  {session?.name || "Seller"} v
                </button>

                {menuOpen && (
                  <div className="dashboard-panel absolute right-0 mt-2 w-44 overflow-hidden">
                    <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">
                      Set city: {session?.city || "Not set"}
                    </div>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/seller/settings");
                      }}
                      className="ui-menu-item"
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
                            mobile: res.data.user.mobile || "",
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
                      className="ui-menu-item"
                    >
                      {switching
                        ? "Switching..."
                        : session?.roles?.buyer
                        ? "Switch to Buyer"
                        : "Become Buyer"}
                    </button>

                    <button
                      onClick={() => logout(navigate)}
                      className="ui-menu-item ui-menu-item-danger"
                    >
                      Logout
                    </button>
                  </div>
                )}
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-layout-content">
        <div className="dashboard-shell dashboard-main-spacious">
          <div className="dashboard-flow">
          {reverseAuctionNotice && (
            <div className="dashboard-panel-soft ui-surface-warning rounded-xl border px-4 py-3 ui-body flex items-start justify-between gap-3">
              <span>{reverseAuctionNotice}</span>
              <button
                onClick={() => setReverseAuctionNotice("")}
                className="ui-status-warning ui-label"
              >
                Dismiss
              </button>
            </div>
          )}

          {!loading && (
            <div className="flex flex-wrap gap-2">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="app-stat">
                <p className="ui-label text-[var(--ui-muted)]">Total Matches</p>
                <p className="ui-heading text-hoko-brand">{totalCount}</p>
              </div>
              <div className="app-stat">
                <p className="ui-label text-[var(--ui-muted)]">Live Auctions</p>
                <p className="ui-heading ui-status-warning">{liveAuctions}</p>
              </div>
            </div>
          )}

          {!loading && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="app-chip">
                {selectedCity && selectedCity !== "all" ? selectedCity : "All cities"}
              </span>
              <span className="app-chip">
                {selectedCategory && selectedCategory !== "all" ? selectedCategory : "All categories"}
              </span>
              <span className="app-chip">
                {isWhatsAppPublicView ? "WhatsApp public view" : "App view"}
              </span>
            </div>
          )}

          {showingSampleData && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Showing sample posts for local preview only. These are synthetic examples, not real buyer data.
            </div>
          )}

          {!loading && (
            <div className="app-filter-bar">
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
            <div className="dashboard-list">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-gray-200 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && requirements.length === 0 && (
            <EmptyState
              icon="search"
              title="No buyer requirements right now"
              description="Check back soon! New requirements are posted daily. You can also update your categories to see more relevant posts."
              actionLabel="Update categories"
              action={() => {
                if (session?.token) {
                  navigate("/seller/settings");
                } else {
                  navigateToLogin();
                }
              }}
            />
          )}

          {!loading && requirements.length > 0 && visibleRequirements.length === 0 && (
            <EmptyState
              icon="clipboard"
              compact
              title="No posts match your dashboard categories"
              description="Update your categories in profile settings."
            />
          )}

          {!loading &&
            requirements.length > 0 &&
            visibleRequirements.length > 0 &&
            filteredRequirements.length === 0 && (
              <EmptyState
                icon="search"
                compact
                title={activeSmartTab === "auctions" ? "No live auctions" : "No posts match selected filters"}
              />
            )}

          <div className="dashboard-list">
            {filteredRequirements.map((req) => {
              const isSample = Boolean(req.isSample);
              const isCityLocked = req.offerBlockedByCity === true;
              const effectiveInviteMode = getEffectiveInviteMode(req);
              const myOfferOutcomeLabel = getOutcomeLabel(req.myOfferOutcomeStatus);
              const myOfferOutcomeClassName = getOutcomeClassName(req.myOfferOutcomeStatus);
              const isAuction = req.reverseAuction?.active === true;
              const showAuctionForSeller = req.myOffer && isAuction;
              const lowestPrice = req.reverseAuction?.lowestPrice ?? req.currentLowestPrice ?? "-";
              const attachments = Array.isArray(req.attachments) ? req.attachments : [];
              const shareLinks = getShareLinks(req);
              const requirementDetails = String(
                req.details || req.description || ""
              ).trim();

              return (
                <div key={req._id} className="relative app-card flex flex-col gap-4">
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

                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="ui-heading break-words">
                          {compactText(req.productName || req.product)}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {compactText(req.city)}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {compactText(req.category)}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Qty: {compactText(req.quantity)} {compactText(req.type || req.unit, "")}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {effectiveInviteMode === "anywhere" ? "Anywhere" : "City only"}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {showAuctionForSeller && (
                          <span
                            className={`ui-label px-2 py-1 rounded-full ui-surface-warning ${
                              req.myOffer ? "mr-10" : ""
                            }`}
                          >
                            REVERSE AUCTION
                          </span>
                        )}

                        {isSample && (
                          <span className="ui-label px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900">
                            SAMPLE
                          </span>
                        )}
                      </div>
                    </div>

                    {isCityLocked && (
                      <p className="ui-body text-red-600">
                        {req.offerLockedAfterCitySelection
                          ? "Offer locked: buyer already selected chat with a same-city seller."
                          : "Offer locked: buyer invited offers only from their city."}
                      </p>
                    )}

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-slate-50/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                          Requirement preview
                        </p>
                        <p className="ui-body text-[var(--ui-text)] whitespace-pre-line break-words">
                          {requirementDetails || "No extra details provided."}
                        </p>
                        {attachments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {attachments.map((attachment, index) => {
                              const filename = extractAttachmentFileName(attachment, index);
                              const displayName = getAttachmentDisplayName(attachment, index);
                              const typeMeta = getAttachmentTypeMeta(attachment, index);
                              return (
                                <button
                                  key={`${displayName}-${index}`}
                                  type="button"
                                  onClick={() => openRequirementAttachment(attachment, index)}
                                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--ui-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ui-text)] hover:bg-slate-50"
                                  title={filename || "Attachment path missing"}
                                >
                                  <span
                                    className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                                  >
                                    {typeMeta.label}
                                  </span>
                                  <span className="truncate max-w-[11rem]">{displayName}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3 md:min-w-[220px]">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                          Quick status
                        </p>
                        <p className="ui-body text-[var(--ui-muted)]">
                          Make/Brand: {compactText(req.makeBrand || req.brand)} | Type/Model: {compactText(req.typeModel || req.type)}
                        </p>
                        <p className="ui-body text-[var(--ui-muted)] mt-1">
                          Posted: {new Date(req.createdAt || Date.now()).toLocaleDateString()}
                        </p>
                        {req.myOffer && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${myOfferOutcomeClassName}`}
                            >
                              Your offer: {myOfferOutcomeLabel}
                            </span>
                            {req.myOfferOutcomeUpdatedAt && (
                              <span className="ui-label text-[var(--ui-muted)]">
                                Updated {new Date(req.myOfferOutcomeUpdatedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                        {req.myOffer && (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Offer outcome
                            </p>
                            <p className="ui-body text-[var(--ui-text)] mt-1">
                              Buyer decision on your offer is currently{" "}
                              <span className={`font-semibold ${myOfferOutcomeClassName}`}>
                                {myOfferOutcomeLabel}
                              </span>
                              .
                            </p>
                            <p className="ui-body text-[var(--ui-muted)] mt-1">
                              Check this card for updates or open the offer notification to review the requirement.
                            </p>
                          </div>
                        )}
                        {showAuctionForSeller && (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                            <p className="ui-body ui-status-warning mb-1">
                              Buyer has invoked Reverse Auction.
                            </p>
                            <p className="ui-body ui-status-warning">
                              Current lowest price: Rs {lowestPrice}
                            </p>
                            <button
                              onClick={() => handleSellerOfferClick(req, { isSample, isCityLocked })}
                              className="mt-2 ui-link ui-status-warning"
                            >
                              Edit your offer now
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ui-label text-[var(--ui-muted)]">Share:</span>
                    <button
                      type="button"
                      onClick={() => openShareLink(shareLinks.whatsapp)}
                      aria-label="Share on WhatsApp"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-green-200 text-green-700 hover:bg-green-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.93.51 3.77 1.49 5.4L2 22l4.85-1.58a9.85 9.85 0 0 0 5.19 1.46h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.74 14.1c-.24.69-1.19 1.27-1.82 1.36-.6.08-1.35.11-2.2-.14-.51-.16-1.16-.38-2.01-.73-3.54-1.53-5.85-5.09-6.03-5.34-.17-.25-1.45-1.93-1.45-3.68 0-1.75.92-2.62 1.24-2.98.32-.36.69-.45.92-.45.23 0 .46 0 .66.01.22 0 .51-.08.8.6.29.69.98 2.42 1.06 2.59.08.17.14.37.02.6-.11.23-.17.37-.34.57-.17.2-.36.45-.51.61-.17.17-.35.35-.15.69.2.34.89 1.47 1.92 2.38 1.32 1.18 2.43 1.55 2.78 1.72.34.17.55.14.75-.08.2-.23.86-1 1.08-1.35.23-.34.45-.29.75-.17.31.11 1.94.92 2.28 1.08.34.17.57.26.66.4.09.14.09.8-.15 1.49Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => openShareLink(shareLinks.facebook)}
                      aria-label="Share on Facebook"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                        <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.41c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.26c-1.24 0-1.62.77-1.62 1.56v1.87h2.76l-.44 2.91h-2.32v7.03C18.34 21.24 22 17.08 22 12.06Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => openShareLink(shareLinks.mail)}
                      aria-label="Share via Mail"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                        <path d="M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.2-8 6-8-6V6l8 6 8-6v2.2Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openShareLink(shareLinks.linkedin)
                      }
                      aria-label="Share on LinkedIn"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-sky-200 text-sky-700 hover:bg-sky-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                        <path d="M6.94 8.5a1.56 1.56 0 1 1 0-3.12 1.56 1.56 0 0 1 0 3.12ZM5.5 9.75h2.88V19H5.5V9.75Zm4.63 0h2.75v1.26h.04c.38-.72 1.32-1.48 2.72-1.48 2.9 0 3.44 1.91 3.44 4.39V19h-2.87v-4.5c0-1.07-.02-2.45-1.5-2.45-1.5 0-1.73 1.17-1.73 2.38V19h-2.85V9.75Z" />
                      </svg>
                    </button>
                    </div>

                    <button
                      onClick={() => handleSellerOfferClick(req, { isSample, isCityLocked })}
                      disabled={isSample || isCityLocked}
                      className={`mt-1 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-center font-semibold ${
                        isSample || isCityLocked
                          ? "bg-gray-200 text-gray-600 cursor-not-allowed"
                          : req.myOffer
                          ? "bg-green-600 text-white active:scale-95"
                          : !session?.token
                          ? "bg-blue-600 text-white active:scale-95"
                          : "btn-brand active:scale-95"
                      }`}
                    >
                      {isSample
                        ? "Preview Only (Sample Post)"
                        : isCityLocked
                        ? "Offer Locked (City)"
                        : !session?.token
                        ? "Login to Submit Offer"
                        : req.myOffer
                        ? "Submitted Offer / Edit Offer"
                        : "Submit Offer"}
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
                      className="w-full mt-3 py-2 border border-blue-300 text-blue-700 rounded-xl ui-button-text font-semibold inline-flex items-center justify-center gap-2 relative"
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
                        className="w-full py-2 border border-gray-300 rounded-xl ui-button-text font-semibold"
                      >
                        Rate Buyer
                      </button>
                      <button
                        onClick={() => {
                          setReportTarget(req.buyerId);
                          setReviewRequirementId(req._id);
                          setReportOpen(true);
                        }}
                        className="w-full py-2 border border-red-300 text-red-600 rounded-xl ui-button-text font-semibold"
                      >
                        Report Buyer
                      </button>
                    </div>
                    </>
                  )}

                  {req.myOffer && req.buyerId && !req.contactEnabledByBuyer && (
                    <p className="mt-3 ui-label text-[var(--ui-muted)]">
                      Buyer has not enabled chat for this post yet.
                    </p>
                  )}
                  </div>
                </div>
              );
            })}
            {shouldPaginateRequirements && hasMore && (
              <div
                ref={loadMoreRef}
                className="py-4 text-center text-sm text-gray-500"
              >
                {loadingMore ? "Loading more requirements..." : "Scroll to load more"}
              </div>
            )}
          </div>
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
