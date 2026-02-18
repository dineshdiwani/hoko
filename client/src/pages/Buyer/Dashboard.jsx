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
  const [cities, setCities] = useState([
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Chennai",
    "Hyderabad",
    "Pune"
  ]);

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
        }
      })
      .catch(() => {});
  }, []);

  if (roleSyncing) {
    return (
      <div className="page">
        <div className="page-shell py-10 text-gray-600">
          Switching to buyer role...
        </div>
      </div>
    );
  }

  return (
    <div className="page flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between px-4 py-3 pl-16 md:pl-20 gap-2">
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              Buyer Dashboard
            </h1>
            <p className="text-xs text-gray-500">
              {city || "Select city"}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 w-full md:w-auto">
            <NotificationCenter onNotificationClick={handleNotificationClick} />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1 px-2 md:px-3 py-2 border rounded-xl text-xs md:text-sm font-medium bg-white"
              >
                {session?.name || "Buyer"} v
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border overflow-hidden">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/buyer/settings");
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-100"
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
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-100"
                  >
                    {switching
                      ? "Switching..."
                      : session?.roles?.seller
                      ? "Switch to Seller"
                      : "Become Seller"}
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

        {/* CITY SELECTOR */}
        <div className="max-w-6xl mx-auto px-4 pb-3 pl-16 md:pl-20">
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              City
            </span>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setActiveTab("city");
              }}
              className="w-full md:w-auto max-w-full px-4 py-3 rounded-xl border text-base"
            >
              <option value="">Select city</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* TABS */}
        <div className="max-w-6xl mx-auto flex border-t px-4 pl-16 md:pl-20">
          <button
            onClick={() => setActiveTab("posts")}
            className={`tab-stretch flex-1 py-3 text-sm font-semibold ${
              activeTab === "posts"
                ? "text-amber-700 border-b-2 border-indigo-600"
                : "text-gray-500"
            }`}
          >
            My Posts
          </button>

          <button
            onClick={() => setActiveTab("city")}
            className={`tab-stretch flex-1 py-3 text-sm font-semibold ${
              activeTab === "city"
                ? "text-amber-700 border-b-2 border-indigo-600"
                : "text-gray-500"
            }`}
          >
            City Dashboard
          </button>

          <button
            onClick={() => setActiveTab("offers")}
            className={`tab-stretch flex-1 py-3 text-sm font-semibold ${
              activeTab === "offers"
                ? "text-amber-700 border-b-2 border-indigo-600"
                : "text-gray-500"
            }`}
          >
            Received Offers
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1">
        <div className="page-shell pt-4">
        {activeTab === "posts" && <MyPosts />}
        {activeTab === "city" && (
          <CityDashboard key={city} city={city} />
        )}
        {activeTab === "offers" && <OffersReceived />}
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate("/buyer/requirement/new")}
        className="fixed bottom-6 right-6 btn-brand w-14 h-14 rounded-full shadow-lg text-3xl flex items-center justify-center"
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

