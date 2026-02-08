import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

/* Pages */
import Welcome from "./pages/Welcome";
import Auth from "./pages/Auth";
import CityDashboard from "./pages/CityDashboard";

/* Buyer */
import RequirementForm from "./pages/Buyer/RequirementForm";
import MyPosts from "./pages/Buyer/MyPosts";
import OffersReceived from "./pages/Buyer/OffersReceived";
import OfferList from "./pages/Buyer/OfferList";

/* Seller */
import SellerRegister from "./pages/Seller/SellerRegister";
import SellerProfile from "./pages/Seller/SellerProfile";
import SellerDashboard from "./pages/Seller/SellerDashboard";

/* Admin */
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminAnalytics from "./pages/Admin/AdminAnalytics";

/* Context */
import { NotificationProvider } from "./context/NotificationContext";

export default function App() {
  const userId = localStorage.getItem("userId");

  return (
    <NotificationProvider userId={userId}>
      <BrowserRouter>
        <Routes>

          {/* Public */}
          <Route path="/" element={<Welcome />} />
          <Route path="/auth" element={<Auth />} />

          {/* Buyer */}
          <Route path="/requirement" element={<RequirementForm />} />
          <Route path="/dashboard" element={<CityDashboard />} />
          <Route path="/myposts" element={<MyPosts />} />
          <Route path="/offers" element={<OffersReceived />} />
          <Route path="/offers/:id" element={<OfferList />} />

          {/* Seller */}
          <Route path="/seller/register" element={<SellerRegister />} />
          <Route path="/seller/profile" element={<SellerProfile />} />
          <Route path="/seller/dashboard" element={<SellerDashboard />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />

        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}
