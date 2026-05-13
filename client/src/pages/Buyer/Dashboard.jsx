import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, logout } from "../../services/auth";
import {
  getUiCitySelection,
  onSessionUpdated,
  setSession,
  setUiCitySelection,
  updateSession
} from "../../services/storage";
import MyPosts from "./MyPosts";
import OffersReceived from "./OffersReceived";
import CityDashboard from "../CityDashboard";
import NotificationCenter from "../../components/NotificationCenter";
import ChatModal from "../../components/ChatModal";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import { markNotificationsReadByContext } from "../../services/notifications";
import {
  getNotificationCategory,
  getNotificationRequirementId
} from "../../utils/notifications";

const BUYER_DASHBOARD_STATE_KEY = "buyer_dashboard_state";
const BUYER_DASHBOARD_FORCE_TAB_KEY = "buyer_dashboard_force_tab";

function normalizeBuyerCityFilter(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "all") return "all";
  return raw;
}

function readBuyerDashboardState() {
  if (typeof window === "undefined") {
    return {
      activeTab: "posts",
      selectedCategory: "all"
    };
  }
  try {
    const raw = JSON.parse(localStorage.getItem(BUYER_DASHBOARD_STATE_KEY) || "{}");
    const safeTab =
      raw?.activeTab === "posts" || raw?.activeTab === "city" || raw?.activeTab === "offers"
        ? raw.activeTab
        : "posts";
    return {
      activeTab: safeTab,
      selectedCategory: String(raw?.selectedCategory || "all")
        .trim()
        .toLowerCase() || "all"
    };
  } catch {
    return {
      activeTab: "posts",
      selectedCategory: "all"
    };
  }
}

function readForcedBuyerDashboardTab() {
  if (typeof window === "undefined") return "";
  try {
    const raw = String(localStorage.getItem(BUYER_DASHBOARD_FORCE_TAB_KEY) || "").trim();
    if (raw === "posts" || raw === "city" || raw === "offers") {
      localStorage.removeItem(BUYER_DASHBOARD_FORCE_TAB_KEY);
      return raw;
    }
  } catch {}
  return "";
}

function normalizeDashboardTab(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "posts" || raw === "myposts" || raw === "my-posts" || raw === "mypost") return "posts";
  if (raw === "city" || raw === "citydashboard" || raw === "city-dashboard") return "city";
  if (raw === "offers" || raw === "received-offers" || raw === "receivedoffers") return "offers";
  return "";
}

function getDisplayName(session, fallbackRole = "buyer") {
  const rawName = String(session?.name || "").trim();
  const lowered = rawName.toLowerCase();
  const placeholderNames = new Set([
    "whatsapp user",
    "app user",
    "buyer",
    "seller",
    "user",
    "unknown",
    "user_default"
  ]);
  if (rawName && !placeholderNames.has(lowered)) return rawName;
  const mobile = String(session?.mobile || "").trim();
  if (mobile) return mobile;
  return fallbackRole === "seller" ? "Seller" : "Buyer";
}

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedTab = normalizeDashboardTab(searchParams.get("tab"));
  const highlightId = searchParams.get("highlight") || "";
  const openChatFromUrl =
    searchParams.get("openChat") === "1" || searchParams.get("chat") === "1";
  const chatRequirementFromUrl = searchParams.get("chatRequirementId") || "";
  const chatPeerFromUrl = searchParams.get("chatPeerId") || "";
  const chatPeerNameFromUrl = searchParams.get("chatPeerName") || "";
  const [session, setSessionState] = useState(() => getSession());
  const [sessionVersion, setSessionVersion] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const persistedState = readBuyerDashboardState();
  const forcedTab = readForcedBuyerDashboardTab();
  const lastSyncedProfileCityRef = useRef(String(session?.city || "").trim());

  const [activeTab, setActiveTab] = useState(
    forcedTab || requestedTab || persistedState.activeTab
  );
  const [city, setCity] = useState(
    normalizeBuyerCityFilter(getUiCitySelection(session?.city || "")) || "all"
  );
  const [selectedCategory, setSelectedCategory] = useState(
    persistedState.selectedCategory || "all"
  );
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [useSampleCityPosts, setUseSampleCityPosts] = useState(false);
  const [tabCounts, setTabCounts] = useState({
    posts: 0,
    city: 0,
    offers: 0
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [roleSyncing, setRoleSyncing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeller, setChatSeller] = useState(null);
  const [chatRequirementId, setChatRequirementId] = useState(null);
  const menuRef = useRef(null);
  const handleCityChange = useCallback((nextCity) => {
    const normalized = normalizeBuyerCityFilter(nextCity);
    setCity(normalized);
    setUiCitySelection(normalized);
  }, []);

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

  useEffect(() => {
    const latestProfileCity = String(session?.city || "").trim();
    if (!latestProfileCity) return;
    setCity((prev) => {
      const current = String(prev || "").trim();
      if (!current) return current;
      const previousDefault = String(lastSyncedProfileCityRef.current || "").trim();
      const shouldFollowDefault =
        current.toLowerCase() === "all" ||
        current.toLowerCase() === previousDefault.toLowerCase();
      if (shouldFollowDefault) {
        lastSyncedProfileCityRef.current = latestProfileCity;
        setUiCitySelection(latestProfileCity);
        return latestProfileCity;
      }
      return prev;
    });
  }, [session?.city]);

  // Safety guard
  useEffect(() => {
    if (!session || !session.token) navigate("/buyer/login");
  }, [session, navigate]);
  // Ensure we have a buyer-role token if user has buyer role
  useEffect(() => {
    if (!session?.token || !session?.roles?.buyer) return;
    if (session.role === "buyer") return;

    setRoleSyncing(true);
    api
      .post("/auth/switch-role", { role: "buyer" })
      .then((res) => {
        setSession({
          _id: res.data.user._id,
          role: "buyer",
          roles: res.data.user.roles,
          email: res.data.user.email,
          city: res.data.user.city,
          name: "Buyer",
          preferredCurrency: res.data.user.preferredCurrency,
          mobile: res.data.user.mobile || "",
          token: res.data.token
        });
        setSessionVersion((v) => v + 1);
      })
      .catch(() => {
        alert("Unable to switch to buyer role");
        navigate("/buyer/login");
      })
      .finally(() => setRoleSyncing(false));
  }, [session, navigate]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    }, []);

  useEffect(() => {
    if (highlightId) {
      setRefreshToken((v) => v + 1);
      setActiveTab("posts");
      const timer = setTimeout(() => {
        const element = document.getElementById(`req-${highlightId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("highlight-flash");
          setTimeout(() => element.classList.remove("highlight-flash"), 3000);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  useEffect(() => {
    if (forcedTab) {
      setActiveTab("posts");
      return;
    }
    if (!requestedTab) return;
    setActiveTab(requestedTab);
  }, [forcedTab, requestedTab]);

  function handleNotificationClick(notification) {
    if (!notification) return;
    const category = getNotificationCategory(notification);
    const requirementId = getNotificationRequirementId(notification);

    if (category === "chat") {
      const sellerId = notification.fromUserId?._id || notification.fromUserId;
      if (!requirementId || !sellerId) return;

      markNotificationsReadByContext({
        category: "chat",
        requirementId: String(requirementId),
        fromUserId: String(sellerId)
      }).catch(() => {});
      setChatSeller({
        id: String(sellerId),
        name: "Seller"
      });
      setChatRequirementId(String(requirementId));
      setChatOpen(true);
      return;
    }

    if (category === "offer" && requirementId) {
      markNotificationsReadByContext({
        category: "offer",
        requirementId: String(requirementId)
      }).catch(() => {});
      navigate(`/buyer/requirement/${encodeURIComponent(String(requirementId))}/offers`);
    }
  }

  useEffect(() => {
    if (!session?.token || !openChatFromUrl) return;
    const requirementId = String(chatRequirementFromUrl || "").trim();
    const peerId = String(chatPeerFromUrl || "").trim();
    if (!requirementId || !peerId || chatOpen) return;

    setChatSeller({
      id: peerId,
      name: String(chatPeerNameFromUrl || "Seller").trim() || "Seller"
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

  const triggerRefresh = useCallback(() => {
    setRefreshToken((prev) => prev + 1);
  }, []);

  const handleTabClick = useCallback(
    (nextTab) => {
      setActiveTab(nextTab);
      triggerRefresh();
    },
    [triggerRefresh]
  );

  // Keep selected filters/tabs on browser refresh.
  useEffect(() => {
    try {
      localStorage.setItem(
        BUYER_DASHBOARD_STATE_KEY,
        JSON.stringify({
          activeTab,
          selectedCategory
        })
      );
    } catch {}
  }, [activeTab, selectedCategory]);

  // Ensure defaults are valid after session/token changes without overwriting persisted selections.
  useEffect(() => {
    if (!session?.token) return;
    setActiveTab((prev) =>
      prev === "posts" || prev === "city" || prev === "offers" ? prev : "posts"
    );
    setSelectedCategory((prev) => prev || "all");
  }, [sessionVersion, session?.token, session?.city]);

  useEffect(() => {
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
  }, [triggerRefresh]);

  useEffect(() => {
    if (!session?._id || !session?.token) {
      setTabCounts({ posts: 0, city: 0, offers: 0 });
      return;
    }

    let cancelled = false;

    async function loadTabCounts() {
      try {
        const buyerCity = String(city || "").trim();
        const buyerCategory = String(selectedCategory || "all").trim();
        const buyerParams = {
          page: 1,
          limit: 1
        };
        if (buyerCity && buyerCity.toLowerCase() !== "all") {
          buyerParams.city = buyerCity;
        }
        if (buyerCategory && buyerCategory.toLowerCase() !== "all") {
          buyerParams.category = buyerCategory;
        }

        const [postsRes, cityRes] = await Promise.all([
          api.get(`/buyer/my-posts/${session._id}`, { params: buyerParams }),
          api.get(`/dashboard/city/${encodeURIComponent(buyerCity || "all")}`, {
            params: {
              ...(buyerCategory && buyerCategory.toLowerCase() !== "all"
                ? { category: buyerCategory }
                : {}),
              page: 1,
              limit: 1
            }
          })
        ]);
        if (cancelled) return;

        const postsCount = Number(postsRes?.headers?.["x-total-count"] || 0);
        const offersCount = Number(postsRes?.headers?.["x-total-offer-count"] || 0);
        const cityCount = Number(cityRes?.headers?.["x-total-count"] || 0);

        setTabCounts({
          posts: Number.isFinite(postsCount) ? postsCount : 0,
          city: cityCount,
          offers: Number.isFinite(offersCount) ? offersCount : 0
        });
      } catch {
        if (!cancelled) {
          setTabCounts((prev) => ({ ...prev, posts: 0, city: 0, offers: 0 }));
        }
      }
    }

    loadTabCounts();

    return () => {
      cancelled = true;
    };
  }, [
    city,
    refreshToken,
    selectedCategory,
    session?._id,
    session?.token
  ]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        const nextCities = Array.isArray(data?.cities) ? data.cities : [];
        if (nextCities.length) {
          setCities(nextCities);
        }
      })
      .catch(() => {});
  }, [refreshToken]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        const nextCategories = Array.isArray(data?.categories) ? data.categories : [];
        setCategories(nextCategories);
      })
      .catch(() => {});
  }, [refreshToken]);

  useEffect(() => {
    if (!session?.token) return;

    let cancelled = false;

    api
      .get("/buyer/profile")
      .then((res) => {
        if (cancelled) return;
        const latestCity = String(res?.data?.city || "").trim();
        const latestCurrency = String(res?.data?.preferredCurrency || "").trim();

        setCity((prev) => {
          const currentCity = String(prev || "").trim();
          if (!currentCity || currentCity === String(session?.city || "").trim()) {
            return latestCity || prev;
          }
          return prev;
        });

        if (
          (latestCity && latestCity !== String(session?.city || "").trim()) ||
          (latestCurrency &&
            latestCurrency !== String(session?.preferredCurrency || "").trim())
        ) {
          updateSession({
            ...(latestCity ? { city: latestCity } : {}),
            ...(latestCurrency ? { preferredCurrency: latestCurrency } : {})
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [session?.token, session?.city, session?.preferredCurrency]);

  useEffect(() => {
    if (!import.meta.env.DEV || !session?._id || !session?.token) {
      setUseSampleCityPosts(false);
      return;
    }

    api
      .get(`/buyer/my-posts/${session._id}`)
      .then((res) => {
        const posts = Array.isArray(res.data) ? res.data : [];
        setUseSampleCityPosts(posts.length === 0);
      })
      .catch(() => setUseSampleCityPosts(false));
  }, [session?._id, session?.token, refreshToken]);

  if (roleSyncing) {
    return (
      <div className="page">
        <div className="dashboard-shell dashboard-empty text-gray-600">
          Switching to buyer role...
        </div>
      </div>
    );
  }

  return (
    <div className="page dashboard-layout">
      {/* HEADER */}
      <header className="dashboard-header dashboard-layout-header">
        <div className="dashboard-shell dashboard-layout-header-row pl-16 md:pl-20">
          <div>
            <h1 className="ui-heading">
              Buyer Dashboard
            </h1>
            <p className="ui-label text-gray-500">
              {String(city || "").trim().toLowerCase() === "all"
                ? "All cities"
                : city || "Set city"}
            </p>
          </div>

          <div className="dashboard-layout-header-actions">
            <NotificationCenter onNotificationClick={handleNotificationClick} />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="ui-btn-secondary ui-button-text flex items-center gap-1 px-2 md:px-3 py-2"
              >
                {getDisplayName(session, session?.role || "buyer")} v
              </button>

              {menuOpen && (
                <div className="dashboard-panel absolute right-0 mt-2 w-44 overflow-hidden">
                  <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">
                    Set city: {session?.city || "Not set"}
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/buyer/settings");
                    }}
                    className="ui-menu-item"
                  >
                    Profile Settings
                  </button>

                  <button
                    onClick={async () => {
                      if (!session?.roles?.seller) {
                        setMenuOpen(false);
                        navigate("/seller/register");
                        return;
                      }
                      try {
                        setSwitching(true);
                        const res = await api.post("/auth/switch-role", {
                          role: "seller"
                        });
                        if (res?.data?.requiresSellerRegistration) {
                          setSession({
                            _id: res.data.user._id,
                            role: "seller",
                            roles: res.data.user.roles,
                            email: res.data.user.email,
                            city: res.data.user.city,
                            name: "Seller",
                            preferredCurrency: res.data.user.preferredCurrency,
                            token: res.data.token
                          });
                          setMenuOpen(false);
                          navigate("/seller/register");
                          return;
                        }
                        setSession({
                          _id: res.data.user._id,
                          role: "seller",
                          roles: res.data.user.roles,
                          email: res.data.user.email,
                          city: res.data.user.city,
                          name: "Seller",
                          preferredCurrency: res.data.user.preferredCurrency,
                          token: res.data.token
                        });
                        setMenuOpen(false);
                        navigate("/seller/dashboard");
                      } catch (err) {
                        const message =
                          err?.response?.data?.message || "";
                        if (message === "Role not enabled") {
                          setMenuOpen(false);
                          navigate("/seller/register");
                          return;
                        }
                        alert(
                          message || "Unable to switch role"
                        );
                      } finally {
                        setSwitching(false);
                      }
                    }}
                    className="ui-menu-item"
                  >
                    {switching
                      ? "Switching..."
                      : session?.roles?.seller
                      ? "Switch to Seller"
                      : "Become Seller"}
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

        {/* TABS */}
        <div className="dashboard-shell dashboard-tabs dashboard-tabs-center border-t md:pl-20">
          <button
            onClick={() => handleTabClick("posts")}
            className={`ui-tab ui-tab-center ${activeTab === "posts" ? "ui-tab-active" : ""}`}
          >
            My Posts ({tabCounts.posts})
          </button>

          <button
            onClick={() => handleTabClick("city")}
            className={`ui-tab ui-tab-center ${activeTab === "city" ? "ui-tab-active" : ""}`}
          >
            City Dashboard ({tabCounts.city})
          </button>

          <button
            onClick={() => handleTabClick("offers")}
            className={`ui-tab ui-tab-center ${activeTab === "offers" ? "ui-tab-active" : ""}`}
          >
            Received Offers ({tabCounts.offers})
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="dashboard-layout-content">
        <div className="dashboard-shell dashboard-main">
        {activeTab === "posts" && (
          <MyPosts
            city={city}
            selectedCategory={selectedCategory}
            cities={cities}
            categories={categories}
            refreshToken={refreshToken}
            onCityChange={handleCityChange}
            onCategoryChange={setSelectedCategory}
          />
        )}
        {activeTab === "city" && (
          <CityDashboard
            key={`${city}-${selectedCategory}`}
            city={city}
            category={selectedCategory}
            categories={categories}
            cities={cities}
            onCityChange={handleCityChange}
            onCategoryChange={setSelectedCategory}
            useSamplePosts={useSampleCityPosts}
            samplePostsEnabled={import.meta.env.DEV}
            refreshToken={refreshToken}
            onVisibleCountChange={(count) =>
              setTabCounts((prev) => ({
                ...prev,
                city: Number.isFinite(Number(count)) ? Number(count) : 0
              }))
            }
          />
        )}
        {activeTab === "offers" && (
          <OffersReceived
            city={city}
            selectedCategory={selectedCategory}
            cities={cities}
            categories={categories}
            refreshToken={refreshToken}
            onCityChange={handleCityChange}
            onCategoryChange={setSelectedCategory}
          />
        )}
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => {
          localStorage.removeItem("buyer_requirement_form_draft");
          localStorage.removeItem("buyer_pending_requirement_data");
          sessionStorage.removeItem("pending_requirement_data");
          localStorage.removeItem("draft_requirement_text");
          navigate("/buyer/requirement/new");
        }}
        className="dashboard-layout-fab btn-brand w-14 h-14 rounded-full shadow-lg text-3xl flex items-center justify-center"
      >
        +
      </button>

      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sellerId={chatSeller?.id}
sellerName={chatSeller?.name || "Seller"}
        requirementId={chatRequirementId}
      />
    </div>
  );
}
