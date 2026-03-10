import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, logout } from "../../services/auth";
import { setSession } from "../../services/storage";
import MyPosts from "./MyPosts";
import OffersReceived from "./OffersReceived";
import CityDashboard from "../CityDashboard";
import NotificationCenter from "../../components/NotificationCenter";
import ChatModal from "../../components/ChatModal";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";

const BUYER_DASHBOARD_STATE_KEY = "buyer_dashboard_state";

function readBuyerDashboardState() {
  if (typeof window === "undefined") {
    return {
      activeTab: "posts",
      city: "",
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
      city: String(raw?.city || "").trim(),
      selectedCategory: String(raw?.selectedCategory || "all").trim() || "all"
    };
  } catch {
    return {
      activeTab: "posts",
      city: "",
      selectedCategory: "all"
    };
  }
}

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const [sessionVersion, setSessionVersion] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const session = getSession();
  const persistedState = readBuyerDashboardState();

  const [activeTab, setActiveTab] = useState(persistedState.activeTab);
  const [city, setCity] = useState(session?.city || persistedState.city || "");
  const [selectedCategory, setSelectedCategory] = useState(
    persistedState.selectedCategory || "all"
  );
  const [cities, setCities] = useState([
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Chennai",
    "Hyderabad",
    "Pune"
  ]);
  const [categories, setCategories] = useState([]);
  const [sampleCityPostsEnabled, setSampleCityPostsEnabled] = useState(true);
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
          role: res.data.user.role,
          roles: res.data.user.roles,
          email: res.data.user.email,
          city: res.data.user.city,
          name: "Buyer",
          preferredCurrency: res.data.user.preferredCurrency,
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

  function handleNotificationClick(notification) {
    if (!notification || notification.type !== "new_message") return;

    const requirementId = notification.requirementId;
    const sellerId = notification.fromUserId?._id || notification.fromUserId;
    if (!requirementId || !sellerId) return;

    setChatSeller({
      id: String(sellerId),
      name: "Seller"
    });
    setChatRequirementId(String(requirementId));
    setChatOpen(true);
  }

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
          city,
          selectedCategory
        })
      );
    } catch {}
  }, [activeTab, city, selectedCategory]);

  // Ensure defaults are valid after session/token changes without overwriting persisted selections.
  useEffect(() => {
    if (!session?.token) return;
    setActiveTab((prev) =>
      prev === "posts" || prev === "city" || prev === "offers" ? prev : "posts"
    );
    setCity((prev) => session?.city || prev || "");
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
        const postsRes = await api.get(`/buyer/my-posts/${session._id}`);
        if (cancelled) return;

        const posts = Array.isArray(postsRes.data) ? postsRes.data : [];
        const normalizedCity = String(city || "").trim().toLowerCase();
        const normalizedCategory = String(selectedCategory || "all")
          .trim()
          .toLowerCase();
        const matchesFilters = (item) => {
          const cityMatch =
            !normalizedCity ||
            normalizedCity === "all" ||
            String(item?.city || "")
              .trim()
              .toLowerCase() === normalizedCity;
          const categoryMatch =
            !normalizedCategory ||
            normalizedCategory === "all" ||
            String(item?.category || "")
              .trim()
              .toLowerCase() === normalizedCategory;
          return cityMatch && categoryMatch;
        };

        const filteredPosts = posts.filter(matchesFilters);
        const offersByPost = await Promise.all(
          filteredPosts.map(async (post) => {
            const postId = post?._id || post?.id;
            if (!postId) return 0;
            try {
              const offersRes = await api.get(`/dashboard/offers/${postId}`);
              return Array.isArray(offersRes.data) ? offersRes.data.length : 0;
            } catch {
              return 0;
            }
          })
        );
        if (cancelled) return;

        const cityShouldUseSample =
          sampleCityPostsEnabled &&
          String(import.meta.env.VITE_ENABLE_SAMPLE_CITY_POSTS ?? "true").toLowerCase() !==
            "false" &&
          posts.length === 0;

        let cityCount = 0;
        if (!cityShouldUseSample && city) {
          try {
            const targetCities =
              String(city).trim().toLowerCase() === "all"
                ? cities.filter(Boolean)
                : [city];
            const cityResults = await Promise.all(
              targetCities.map((cityName) =>
                api
                  .get(`/dashboard/city/${encodeURIComponent(cityName)}`)
                  .then((res) => (Array.isArray(res.data) ? res.data : []))
                  .catch(() => [])
              )
            );
            if (!cancelled) {
              cityCount = cityResults
                .flat()
                .filter(matchesFilters).length;
            }
          } catch {
            cityCount = 0;
          }
        }

        if (cancelled) return;

        setTabCounts({
          posts: filteredPosts.length,
          city: cityCount,
          offers: offersByPost.reduce(
            (sum, count) => sum + Number(count || 0),
            0
          )
        });
      } catch {
        if (!cancelled) {
          setTabCounts((prev) => ({ ...prev, posts: 0, offers: 0 }));
        }
      }
    }

    loadTabCounts();

    return () => {
      cancelled = true;
    };
  }, [
    city,
    cities,
    refreshToken,
    sampleCityPostsEnabled,
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
          setCity((prevCity) => {
            const preferredCity = session?.city || "";
            if (preferredCity && nextCities.includes(preferredCity)) {
              return preferredCity;
            }
            if (prevCity && nextCities.includes(prevCity)) {
              return prevCity;
            }
            return nextCities[0];
          });
        }
        const nextCategories = Array.isArray(data?.categories)
          ? data.categories
          : [];
        setCategories(nextCategories);
        setSampleCityPostsEnabled(data?.sampleCityPostsEnabled !== false);
      })
      .catch(() => {});
  }, [session?.city, refreshToken]);

  useEffect(() => {
    const sampleFlagEnabled =
      String(import.meta.env.VITE_ENABLE_SAMPLE_CITY_POSTS ?? "true").toLowerCase() !==
      "false";
    if (!sampleFlagEnabled || !session?._id || !session?.token) {
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
              {city || "Select city"}
            </p>
          </div>

          <div className="dashboard-layout-header-actions">
            <NotificationCenter onNotificationClick={handleNotificationClick} />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="ui-btn-secondary ui-button-text flex items-center gap-1 px-2 md:px-3 py-2"
              >
                {session?.name || "Buyer"} v
              </button>

              {menuOpen && (
                <div className="dashboard-panel absolute right-0 mt-2 w-44 overflow-hidden">
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
                        setSession({
                          _id: res.data.user._id,
                          role: res.data.user.role,
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
                        if (
                          message === "Seller onboarding required" ||
                          message === "Role not enabled"
                        ) {
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
            onCityChange={setCity}
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
            onCityChange={setCity}
            onCategoryChange={setSelectedCategory}
            useSamplePosts={useSampleCityPosts}
            samplePostsEnabled={sampleCityPostsEnabled}
            refreshToken={refreshToken}
          />
        )}
        {activeTab === "offers" && (
          <OffersReceived
            city={city}
            selectedCategory={selectedCategory}
            cities={cities}
            categories={categories}
            refreshToken={refreshToken}
            onCityChange={setCity}
            onCategoryChange={setSelectedCategory}
          />
        )}
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate("/buyer/requirement/new")}
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

