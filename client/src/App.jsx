import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation
} from "react-router-dom";

import BuyerWelcome from "./pages/Buyer/welcome";
import BuyerLogin from "./pages/Buyer/Login";
import BuyerDashboard from "./pages/Buyer/Dashboard";
import RequirementForm from "./pages/Buyer/RequirementForm";
import OfferList from "./pages/Buyer/OfferList";
import BuyerProfile from "./pages/Buyer/Profile";
import BuyerSettings from "./pages/Buyer/Settings";

import SellerDashboard from "./pages/Seller/Dashboard";
import SellerRegister from "./pages/Seller/Register";
import SellerLogin from "./pages/Seller/Login";
import SellerProfile from "./pages/Seller/SellerProfile";
import SellerSettings from "./pages/Seller/Settings";
import SellerDeepLink from "./pages/Seller/SellerDeepLink";

import AdminLogin from "./pages/Admin/Login";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminAnalytics from "./pages/Admin/AdminAnalytics";

import OfflineBanner from "./components/OfflineBanner";
import AppDialog from "./components/AppDialog";
import { requireAuth, getSession } from "./services/auth";

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

function AppShell() {
  const location = useLocation();
  const showGlobalLogo = location.pathname !== "/";

  return (
    <>
      <OfflineBanner />
      <AppDialog />
      {showGlobalLogo && (
        <Link
          to="/"
          className="fixed top-2 left-2 md:top-4 md:left-4 z-50 flex items-center gap-2 rounded-full border border-white/70 bg-white/95 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 shadow-lg max-w-[calc(100vw-1rem)]"
          aria-label="Go to home"
        >
          <img
            src="/logo.png"
            alt="hoko"
            className="w-12 h-12 md:w-16 md:h-16 rounded-full object-contain"
          />
          <span className="hidden sm:inline text-sm md:text-base font-extrabold text-hoko-brand whitespace-nowrap">
            <span className="text-slate-900">h</span>oko
          </span>
        </Link>
      )}
      <Routes>
        {/* Landing */}
        <Route path="/" element={<BuyerWelcome />} />

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
              <Navigate to="/buyer/dashboard" replace />
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
          path="/buyer/requirement/:id/offers"
          element={
            requireBuyer() ? (
              <OfferList />
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
          element={<AdminDashboard />}
        />

        <Route
          path="/admin/analytics"
          element={<AdminAnalytics />}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
