import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Auth from "./pages/Auth";
import CityDashboard from "./pages/CityDashboard";
import RequirementForm from "./pages/Buyer/RequirementForm";
import MyPosts from "./pages/Buyer/MyPosts";
import OfferList from "./pages/Buyer/OfferList";
import BuyerWelcome from "./pages/Buyer/Welcome";
import SellerDashboard from "./pages/Seller/Dashboard";





import SellerRegister from "./pages/Seller/Register";


import AdminLogin from "./pages/Admin/Login";
import AdminDashboard from "./pages/Admin/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Buyer / Seller */}
        <Route path="/" element={<Auth />} />
        <Route path="/dashboard" element={<CityDashboard />} />
        <Route path="/buyer/requirement" element={<RequirementForm />} />
        <Route path="/buyer/myposts" element={<MyPosts />} />
        <Route path="/buyer/offers/:requirementId" element={<OfferList />} />
        <Route  path="/seller/dashboard" element={<SellerDashboard />}/>
        <Route path="/seller/register" element={<SellerRegister />} />
        <Route path="/seller/dashboard" element={<SellerDashboard />} />
        <Route path="/buyer/welcome" element={<BuyerWelcome />} />


        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            localStorage.getItem("admin") ? (
              <AdminDashboard />
            ) : (
              <Navigate to="/admin/login" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
