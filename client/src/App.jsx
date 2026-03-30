import { Suspense, lazy, memo, useEffect } from "react";
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation
} from "react-router-dom";

const BuyerWelcome = lazy(() => import("./pages/Buyer/welcome"));
const BuyerLogin = lazy(() => import("./pages/Buyer/Login"));
const BuyerDashboard = lazy(() => import("./pages/Buyer/Dashboard"));
const MyPosts = lazy(() => import("./pages/Buyer/MyPosts"));
const RequirementForm = lazy(() => import("./pages/Buyer/RequirementForm"));
const OfferList = lazy(() => import("./pages/Buyer/OfferList"));
const CompareOffers = lazy(() => import("./pages/Buyer/CompareOffers"));
const BuyerProfile = lazy(() => import("./pages/Buyer/Profile"));
const BuyerSettings = lazy(() => import("./pages/Buyer/Settings"));

const SellerDashboard = lazy(() => import("./pages/Seller/Dashboard"));
const SellerRegister = lazy(() => import("./pages/Seller/Register"));
const SellerLogin = lazy(() => import("./pages/Seller/Login"));
const SellerProfile = lazy(() => import("./pages/Seller/SellerProfile"));
const SellerSettings = lazy(() => import("./pages/Seller/Settings"));
const SellerDeepLink = lazy(() => import("./pages/Seller/SellerDeepLink"));

const AdminLogin = lazy(() => import("./pages/Admin/Login"));
const AdminDashboard = lazy(() => import("./pages/Admin/AdminDashboard"));
const AdminAnalytics = lazy(() => import("./pages/Admin/AdminAnalytics"));
const AdminWhatsApp = lazy(() => import("./pages/Admin/AdminWhatsApp"));
const AdminOperations = lazy(() => import("./pages/Admin/AdminOperations"));

import OfflineBanner from "./components/OfflineBanner";
import AppDialog from "./components/AppDialog";
import NotificationPermissionPrompt from "./components/NotificationPermissionPrompt";
import { getSession } from "./services/auth";
import { ensurePushSubscription } from "./services/pushNotifications";
import socket, { connectSocket } from "./services/socket";
import { showRuntimeNotification } from "./services/runtimeNotifications";
import {
  getSettings,
  getSeenNotificationIds,
  rememberSeenNotificationIds
} from "./services/storage";
import { fetchNotifications } from "./services/notifications";
import { isFileProtocolRuntime, isNativeAppRuntime } from "./utils/runtime";
import { ensureNativePushRegistration, isNativePushEnabled } from "./services/nativePush";
import { getNotificationCategory } from "./utils/notifications";

function RouteLoader() {
  return <div className="min-h-[35vh] w-full" aria-hidden="true" />;
}

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

const HomeLogo = memo(function HomeLogo({ hidden }) {
  return (
    <Link
      to="/"
      className={`fixed top-2 left-2 md:top-3 md:left-3 z-[70] flex items-center gap-2 rounded-full border border-white/80 bg-white/95 backdrop-blur p-0.5 md:p-1 shadow-lg transition-opacity duration-150 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-label="Go to home"
    >
      <img
        src={logoSrc}
        alt="hoko"
        loading="eager"
        fetchPriority="high"
        decoding="sync"
        draggable="false"
        className="w-11 h-11 md:w-12 md:h-12 rounded-full object-cover"
      />
      <span className="hidden 2xl:inline text-sm font-extrabold text-hoko-brand whitespace-nowrap">
        <span className="text-slate-900">h</span>oko
      </span>
    </Link>
  );
});

function requireBuyer() {
  const session = getSession();
  if (!session?.token) return false;
  if (session.role === "buyer") return true;
  return Boolean(session.roles?.buyer);
}

function requireSeller() {
  const session = getSession();
  if (!session?.token) return false;
  if (session.role === "seller") return true;
  return Boolean(session.roles?.seller);
}

function requireAdmin() {
  return Boolean(localStorage.getItem("admin_token"));
}

function AppShell() {
  const location = useLocation();
  const hideGlobalLogo = location.pathname === "/";

  function isNotificationAllowedForRole(role, notification, currentSettings) {
    const category = getNotificationCategory(notification);
    const buyerNotifSettings = currentSettings?.buyer?.notificationToggles || {};
    const sellerNotifSettings = currentSettings?.seller || {};

    if (role === "buyer") {
      if (buyerNotifSettings.pushEnabled === false) {
        return false;
      }
      if (category === "offer") {
        return buyerNotifSettings.newOffer !== false;
      }
      if (category === "chat") {
        return buyerNotifSettings.chat !== false;
      }
      return buyerNotifSettings.statusUpdate !== false;
    }

    if (category === "reverse_auction") {
      return sellerNotifSettings.notificationsAuction !== false;
    }
    if (category === "chat" || category === "lead") {
      return sellerNotifSettings.notificationsLeads !== false;
    }
    return sellerNotifSettings.notificationsOffers !== false;
  }

  async function syncNativeUnreadNotifications(session) {
    if (!isNativeAppRuntime()) return;
    if (isNativePushEnabled()) return;
    if (!session?.token) return;

    try {
      const currentSettings = getSettings();
      const role = session?.role || (session?.roles?.seller ? "seller" : "buyer");
      const seen = new Set(getSeenNotificationIds());
      const notifications = await fetchNotifications();
      const unread = (Array.isArray(notifications) ? notifications : [])
        .filter((item) => item && item.read !== true)
        .slice(0, 10);

      const justShownIds = [];
      for (const notif of unread.reverse()) {
        const notifId = String(notif?._id || notif?.id || "").trim();
        if (!notifId || seen.has(notifId)) continue;

        const allowed = isNotificationAllowedForRole(role, notif, currentSettings);

        if (!allowed) {
          justShownIds.push(notifId);
          continue;
        }

        const fallbackUrl = role === "seller" ? "/seller/dashboard" : "/buyer/dashboard";
        await showRuntimeNotification({
          title: String(notif?.title || "HOKO"),
          body: String(notif?.message || notif?.body || "You have a new notification"),
          tag: notifId,
          data: { url: String(notif?.data?.url || fallbackUrl) }
        });
        justShownIds.push(notifId);
      }

      if (justShownIds.length) {
        rememberSeenNotificationIds(justShownIds);
      }
    } catch {}
  }

  useEffect(() => {
    ensurePushSubscription().catch(() => {});
    if (isNativeAppRuntime() && isNativePushEnabled()) {
      ensureNativePushRegistration(false).catch(() => {});
    }
  }, [location.pathname]);

  useEffect(() => {
    const session = getSession();
    if (!session?.token) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        ensurePushSubscription().catch(() => {});
        if (isNativeAppRuntime() && isNativePushEnabled()) {
          ensureNativePushRegistration(false).catch(() => {});
        }
        syncNativeUnreadNotifications(session).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = window.setInterval(() => {
      ensurePushSubscription().catch(() => {});
      if (isNativeAppRuntime() && isNativePushEnabled()) {
        ensureNativePushRegistration(false).catch(() => {});
      }
      syncNativeUnreadNotifications(session).catch(() => {});
    }, 60000);

    if (isNativeAppRuntime() && isNativePushEnabled()) {
      ensureNativePushRegistration(false).catch(() => {});
    }
    syncNativeUnreadNotifications(session).catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session?.token) return;
    connectSocket();

    const onNotification = async (notif) => {
      try {
        if (isNativeAppRuntime() && isNativePushEnabled()) {
          return;
        }
        const currentSettings = getSettings();
        const role = session?.role || (session?.roles?.seller ? "seller" : "buyer");
        const allowed = isNotificationAllowedForRole(role, notif, currentSettings);

        if (!allowed) {
          return;
        }

        const fallbackUrl = role === "seller" ? "/seller/dashboard" : "/buyer/dashboard";
        const title = String(notif?.title || "HOKO");
        const body = String(notif?.message || notif?.body || "You have a new notification");
        const url = String(notif?.data?.url || fallbackUrl);
        const tag = String(notif?._id || notif?.id || `live-${Date.now()}`);
        await showRuntimeNotification({
          title,
          body,
          tag,
          data: { url }
        });
        rememberSeenNotificationIds([tag]);
      } catch {}
    };

    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, []);

  return (
      <>
      <OfflineBanner />
      <AppDialog />
      <NotificationPermissionPrompt />
      <HomeLogo hidden={hideGlobalLogo} />
      <div>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
          {/* Landing */}
          <Route path="/" element={<BuyerWelcome />} />
          <Route path="/auth" element={<Navigate to="/buyer/login" replace />} />
          <Route
            path="/dashboard"
            element={<Navigate to="/buyer/dashboard" replace />}
          />

        {/* Buyer */}
        <Route path="/buyer/login" element={<BuyerLogin />} />

        <Route
          path="/buyer/dashboard"
          element={
            requireBuyer() ? (
              <BuyerDashboard />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />

        <Route
          path="/buyer/my-posts"
          element={
            requireBuyer() ? (
              <MyPosts />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />

        <Route
          path="/buyer/profile"
          element={
            requireBuyer() ? (
              <BuyerProfile />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />
        <Route
          path="/buyer/settings"
          element={
            requireBuyer() ? (
              <BuyerSettings />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />

        <Route
          path="/buyer/requirement/new"
          element={
            requireBuyer() ? (
              <RequirementForm />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />

        <Route
          path="/buyer/requirement/:id/edit"
          element={
            requireBuyer() ? (
              <RequirementForm />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />

        <Route
          path="/buyer/requirement/:id/offers"
          element={
            requireBuyer() ? (
              <OfferList />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />
        <Route
          path="/buyer/requirement/:id/compare"
          element={
            requireBuyer() ? (
              <CompareOffers />
            ) : (
              <Navigate to="/buyer/login" replace />
            )
          }
        />

        {/* Seller */}
        <Route path="/seller/register" element={<SellerRegister />} />
        <Route path="/seller/login" element={<SellerLogin />} />
        <Route
          path="/seller/deeplink/:requirementId"
          element={<SellerDeepLink />}
        />

        <Route
          path="/seller/dashboard"
          element={
            requireSeller() ? (
              <SellerDashboard />
            ) : (
              <Navigate to="/seller/login" replace />
            )
          }
        />

        <Route
          path="/seller/profile"
          element={
            requireSeller() ? (
              <SellerProfile />
            ) : (
              <Navigate to="/seller/login" replace />
            )
          }
        />
        <Route
          path="/seller/settings"
          element={
            requireSeller() ? (
              <SellerSettings />
            ) : (
              <Navigate to="/seller/login" replace />
            )
          }
        />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

        <Route
          path="/admin/dashboard"
          element={requireAdmin() ? <AdminDashboard /> : <Navigate to="/admin/login" replace />}
        />

        <Route
          path="/admin/analytics"
          element={requireAdmin() ? <AdminAnalytics /> : <Navigate to="/admin/login" replace />}
        />

        <Route
          path="/admin/whatsapp"
          element={requireAdmin() ? <AdminWhatsApp /> : <Navigate to="/admin/login" replace />}
        />

        <Route
          path="/admin/operations"
          element={requireAdmin() ? <AdminOperations /> : <Navigate to="/admin/login" replace />}
        />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

export default function App() {
  const Router = isNativeAppRuntime() || isFileProtocolRuntime() ? HashRouter : BrowserRouter;
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
