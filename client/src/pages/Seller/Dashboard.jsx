import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../services/api";
import socket, { connectSocket } from "../../services/socket";
import {
  fetchNotifications,
  markNotificationsReadByContext
} from "../../services/notifications";
import { fetchOptions } from "../../services/options";
import { getSession, logout } from "../../services/auth";
import { getSellerDashboardCategories, setSession } from "../../services/storage";
import { generateSamplePostsForCity } from "../../services/samplePosts";
import NotificationCenter from "../../components/NotificationCenter";
import OfferModal from "../../components/OfferModal";
import ReviewModal from "../../components/ReviewModal";
import ReportModal from "../../components/ReportModal";
import ChatModal from "../../components/ChatModal";
import { confirmDialog } from "../../utils/dialogs";
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
  const [showingSampleData, setShowingSampleData] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const allowSellerSamplePosts =
    import.meta.env.DEV;

  const currentUserId = session?._id || session?.id || session?.userId || null;

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
    const triggerRefresh = () => setRefreshToken((prev) => prev + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };
    const onFocus = () => triggerRefresh();
    const onPageShow = (event) => {
      if (event.persisted) {
        triggerRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        setCities(Array.isArray(data?.cities) ? data.cities : []);
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
      })
      .catch(() => {});
  }, [refreshToken]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cityFromLink = String(params.get("city") || "").trim();
    if (cityFromLink) {
      setSelectedCity((prev) => resolveCityValue(cityFromLink, cities, prev));
    }
  }, [location.search, cities]);

  useEffect(() => {
    const buildSamplePosts = () => {
      const cityValue = String(selectedCity || "").trim();
      if (cityValue && cityValue.toLowerCase() !== "all") {
        return generateSamplePostsForCity(cityValue, categories, 50);
      }
      const sampleCities = (Array.isArray(cities) ? cities : []).filter(Boolean);
      if (!sampleCities.length) {
        const fallbackCity = String(session?.city || "").trim();
        return fallbackCity
          ? generateSamplePostsForCity(fallbackCity, categories, 50)
          : [];
      }
      return sampleCities.flatMap((cityName) =>
        generateSamplePostsForCity(cityName, categories, 30)
      );
    };

    async function load() {
      setLoading(true);
      try {
        const res = await api.get("/seller/dashboard", {
          params: {
            city: selectedCity || "all",
            category: selectedCategory || "all"
          }
        });
        const liveRows = Array.isArray(res.data) ? res.data : [];
        if (allowSellerSamplePosts && liveRows.length === 0) {
          setRequirements(buildSamplePosts());
          setShowingSampleData(true);
          return;
        }
        setRequirements(liveRows);
        setShowingSampleData(false);
      } catch (err) {
        console.error(err);
        if (allowSellerSamplePosts) {
          setRequirements(buildSamplePosts());
          setShowingSampleData(true);
        } else {
          setRequirements([]);
          setShowingSampleData(false);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [
    selectedCity,
    selectedCategory,
    cities,
    categories,
    allowSellerSamplePosts,
    session?.city,
    refreshToken
  ]);

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
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(reqId)}`;
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
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(reqId)}`;
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
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(reqId)}`;
    const whatsappText = encodeURIComponent(getWhatsAppShareText(req));
    const socialText = encodeURIComponent(getSocialShareText(req));
    const socialTextRaw = getSocialShareText(req);
    const facebookQuote = encodeURIComponent(getFacebookQuoteText(req).slice(0, 450));
    const url = encodeURIComponent(deepLink);
    const encodedTitle = encodeURIComponent("URGENT BUYER REQUIREMENT");
    const encodedSummary = encodeURIComponent(socialTextRaw.slice(0, 256));
    const linkedinShareUrl = `https://www.linkedin.com/feed/?shareArticle?mini=true&url=${url}&title=${encodedTitle}&summary=${encodedSummary}`;
    const linkedinAppLink = `linkedin://shareArticle?mini=true&url=${url}&title=${encodedTitle}&summary=${encodedSummary}`;
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
      linkedin: linkedinShareUrl,
      linkedinApp: linkedinAppLink
    };
  }

  function openShareLink(url, fallbackUrl = "") {
    const target = String(url || "").trim();
    const fallback = String(fallbackUrl || "").trim();
    if (!target) return;
    if (isNativeAppRuntime()) {
      window.location.href = target;
      if (target.startsWith("linkedin://") && fallback) {
        window.setTimeout(() => {
          window.location.href = fallback;
        }, 1200);
      }
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

  return (
    <div className="page dashboard-layout">
      <header className="dashboard-header dashboard-layout-header">
        <div className="dashboard-shell dashboard-layout-header-row pl-16 md:pl-20">
          <div>
            <h1 className="ui-heading">Seller Dashboard</h1>
            <p className="ui-label text-[var(--ui-muted)]">Matching buyer requirements</p>
          </div>

          <div className="flex items-center flex-wrap md:flex-nowrap gap-2 w-full md:w-auto">
            <div className="flex items-center flex-wrap gap-2 flex-1 min-w-0">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
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
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="ui-btn-secondary ui-button-text px-2 md:px-3 py-2"
              >
                {session?.name || "Seller"} v
              </button>

              {menuOpen && (
                <div className="dashboard-panel absolute right-0 mt-2 w-44 overflow-hidden">
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
                <p className="ui-heading text-hoko-brand">{filteredRequirements.length}</p>
              </div>
              <div className="app-stat">
                <p className="ui-label text-[var(--ui-muted)]">Live Auctions</p>
                <p className="ui-heading ui-status-warning">{liveAuctions}</p>
              </div>
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
            <div className="dashboard-empty text-[var(--ui-text)]">
              No matching buyer requirements right now.
            </div>
          )}

          {!loading && requirements.length > 0 && visibleRequirements.length === 0 && (
            <div className="dashboard-empty text-gray-600">
              No posts match your dashboard categories. Update them in your profile.
            </div>
          )}

          {!loading &&
            requirements.length > 0 &&
            visibleRequirements.length > 0 &&
            filteredRequirements.length === 0 && (
              <div className="dashboard-empty text-gray-600">
                {activeSmartTab === "auctions"
                  ? "No live auctions right now."
                  : "No posts match the selected filters."}
              </div>
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
                      <h3 className="ui-heading">{req.product || req.productName || "-"}</h3>
                      <p className="ui-body text-[var(--ui-muted)]">
                        City: {req.city || "-"} | Category: {req.category || "-"}
                      </p>
                      <p className="ui-body text-[var(--ui-muted)]">
                        Make/Brand: {req.makeBrand || req.brand || "-"} | Type/Model: {req.typeModel || "-"}
                      </p>
                      <p className="ui-body text-[var(--ui-muted)]">
                        Quantity: {req.quantity || "-"} {req.type || req.unit || ""}
                      </p>
                      <p className="ui-body text-[var(--ui-muted)]">
                        Offer invited from: {effectiveInviteMode === "anywhere" ? "Anywhere" : "City"}
                      </p>
                      {isCityLocked && (
                        <p className="ui-body text-red-600">
                          {req.offerLockedAfterCitySelection
                            ? "Offer locked: buyer already selected chat with a same-city seller."
                            : "Offer locked: buyer invited offers only from their city."}
                        </p>
                      )}
                      {req.myOffer && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      {requirementDetails && (
                        <p className="ui-body text-[var(--ui-text)] mt-1 whitespace-pre-line">
                          {requirementDetails}
                        </p>
                      )}
                      {attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="ui-label text-indigo-700">
                            Attachments
                          </p>
                          {attachments.map((attachment, index) => {
                            const filename = extractAttachmentFileName(attachment, index);
                            const displayName = getAttachmentDisplayName(attachment, index);
                            const typeMeta = getAttachmentTypeMeta(attachment, index);
                            return (
                              <button
                                key={`${displayName}-${index}`}
                                type="button"
                                onClick={() => openRequirementAttachment(attachment, index)}
                                className="ui-label text-indigo-700 hover:underline break-all inline-flex items-center gap-2"
                                title={filename || "Attachment path missing"}
                              >
                                <span
                                  className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                                >
                                  {typeMeta.label}
                                </span>
                                {displayName}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

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

                  {showAuctionForSeller && (
                    <>
                      <p className="ui-body ui-status-warning mb-1">
                        Buyer has invoked Reverse Auction.
                      </p>
                      <p className="ui-body ui-status-warning mb-2">
                        Current lowest price: Rs {lowestPrice}
                      </p>
                      <button
                        onClick={() => setActiveRequirement(req)}
                        className="ui-link ui-status-warning"
                      >
                        Edit your offer now
                      </button>
                    </>
                  )}

                  <div className="mt-3 flex items-center gap-2">
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
                        openShareLink(
                          shareLinks.linkedinApp || shareLinks.linkedin,
                          shareLinks.linkedin
                        )
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
                    onClick={() => {
                      if (isSample || isCityLocked) return;
                      setActiveRequirement(req);
                    }}
                    disabled={isSample || isCityLocked}
                    className={`mt-3 block w-fit px-4 py-2.5 rounded-xl text-center font-semibold ${
                      isSample || isCityLocked
                        ? "bg-gray-200 text-gray-600 cursor-not-allowed"
                        : req.myOffer
                        ? "bg-green-600 text-white active:scale-95"
                        : "btn-brand active:scale-95"
                    }`}
                  >
                    {isSample
                      ? "Preview Only (Sample Post)"
                      : isCityLocked
                      ? "Offer Locked (City)"
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
              );
            })}
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
