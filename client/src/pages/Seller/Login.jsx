import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import UserLogin from "../Auth/UserLogin";

export default function SellerLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mobileFromUrl = searchParams.get("mobile") || "";
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";

  // Store WhatsApp params when page loads
  useEffect(() => {
    if (mobileFromUrl) {
      localStorage.setItem("whatsapp_mobile", mobileFromUrl);
    }
    if (cityFromUrl) {
      localStorage.setItem("whatsapp_city", cityFromUrl);
    }
    if (catsFromUrl) {
      localStorage.setItem("whatsapp_categories", catsFromUrl);
    }
    if (mobileFromUrl || cityFromUrl || catsFromUrl) {
      localStorage.setItem("whatsapp_login", "true");
    }
  }, [mobileFromUrl, cityFromUrl, catsFromUrl]);

  return <UserLogin role="seller" />;
}