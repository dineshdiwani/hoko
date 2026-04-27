import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import UserLogin from "../Auth/UserLogin";

export default function BuyerLogin() {
  const [searchParams] = useSearchParams();
  const cityFromUrl = searchParams.get("city") || "";
  const refFromUrl = searchParams.get("ref") || "";
  const productFromUrl = searchParams.get("product") || "";

  // Store WhatsApp params when page loads
  useEffect(() => {
    if (cityFromUrl) {
      localStorage.setItem("whatsapp_city", cityFromUrl);
    }
    if (refFromUrl) {
      localStorage.setItem("whatsapp_ref", refFromUrl);
    }
    if (productFromUrl) {
      localStorage.setItem("whatsapp_product", productFromUrl);
    }
    if (cityFromUrl || refFromUrl) {
      localStorage.setItem("whatsapp_login", "true");
    }
  }, [cityFromUrl, refFromUrl, productFromUrl]);

  return <UserLogin role="buyer" />;
}