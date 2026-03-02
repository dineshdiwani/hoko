import { useEffect, useRef, useState } from "react";
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

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const [sessionVersion, setSessionVersion] = useState(0);
  const session = getSession();

  const [activeTab, setActiveTab] = useState("posts");
  const [city, setCity] = useState(session?.city || "");
  const [selectedCategory, setSelectedCategory] = useState("all");
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

  // Always reset dashboard filters to login defaults on load/re-sync.
  useEffect(() => {
    if (!session?.token) return;
    setCity(session?.city || "");
    setSelectedCategory("all");
  }, [sessionVersion, session?.token, session?.city]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        const nextCities = Array.isArray(data?.cities) ? data.cities : [];
        if (nextCities.length) {
          setCities(nextCities);
          setCity((prevCity) => {
            if (prevCity) return prevCity;
            const preferredCity = session?.city || "";
            if (preferredCity && nextCities.includes(preferredCity)) {
              return preferredCity;
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
  }, [session?.city]);

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
  }, [session?._id, session?.token]);

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
            onClick={() => setActiveTab("posts")}
            className={`ui-tab ui-tab-center ${activeTab === "posts" ? "ui-tab-active" : ""}`}
          >
            My Posts
          </button>

          <button
            onClick={() => setActiveTab("city")}
            className={`ui-tab ui-tab-center ${activeTab === "city" ? "ui-tab-active" : ""}`}
          >
            City Dashboard
          </button>

          <button
            onClick={() => setActiveTab("offers")}
            className={`ui-tab ui-tab-center ${activeTab === "offers" ? "ui-tab-active" : ""}`}
          >
            Received Offers
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
          />
        )}
        {activeTab === "offers" && (
          <OffersReceived
            city={city}
            selectedCategory={selectedCategory}
            cities={cities}
            categories={categories}
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

