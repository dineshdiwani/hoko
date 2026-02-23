import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, logout } from "../../services/auth";
import { updateSession, setSession } from "../../services/storage";
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
  // Persist city change
  useEffect(() => {
    if (!city || !session) return;

    updateSession({ city });
    api.post("/buyer/profile/city", { city }).catch(() => {});
  }, [city, session]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
          setCity((prevCity) => {
            if (prevCity) return prevCity;
            const preferredCity = session?.city || "";
            if (preferredCity && data.cities.includes(preferredCity)) {
              return preferredCity;
            }
            return data.cities[0];
          });
        }
        if (Array.isArray(data.categories) && data.categories.length) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, [session?.city]);

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

        {/* CITY SELECTOR */}
        <div className="dashboard-shell pb-3 pl-16 md:pl-20">
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
            <span className="ui-label text-gray-700">
              City
            </span>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setActiveTab("city");
              }}
              className="w-full md:w-auto max-w-full px-4 py-3 rounded-xl border ui-body"
            >
              <option value="">Select city</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            {activeTab === "city" && (
              <>
                <span className="ui-label text-gray-700 md:ml-3">
                  Category
                </span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full md:w-auto max-w-full px-4 py-3 rounded-xl border ui-body"
                >
                  <option value="all">All categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* TABS */}
        <div className="dashboard-shell flex border-t pl-16 md:pl-20">
          <button
            onClick={() => setActiveTab("posts")}
            className={`ui-tab ${activeTab === "posts" ? "ui-tab-active" : ""}`}
          >
            My Posts
          </button>

          <button
            onClick={() => setActiveTab("city")}
            className={`ui-tab ${activeTab === "city" ? "ui-tab-active" : ""}`}
          >
            City Dashboard
          </button>

          <button
            onClick={() => setActiveTab("offers")}
            className={`ui-tab ${activeTab === "offers" ? "ui-tab-active" : ""}`}
          >
            Received Offers
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="dashboard-layout-content">
        <div className="dashboard-shell dashboard-main">
        {activeTab === "posts" && <MyPosts />}
        {activeTab === "city" && (
          <CityDashboard
            key={`${city}-${selectedCategory}`}
            city={city}
            category={selectedCategory}
            categories={categories}
            onCategoryChange={setSelectedCategory}
          />
        )}
        {activeTab === "offers" && <OffersReceived />}
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

