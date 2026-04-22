import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import UserLogin from "../Auth/UserLogin";
import WhatsAppLogin from "../Auth/WhatsAppLogin";

export default function SellerLogin() {
  const [searchParams] = useSearchParams();
  
  const mobileFromUrl = searchParams.get("mobile") || "";
  const ref = searchParams.get("ref") || "";
  const src = searchParams.get("src") || "";
  
  // If coming from WhatsApp with mobile (check both ref and src)
  const isWhatsAppUser = (ref === "wa" || src === "wa") && mobileFromUrl;
  
  if (isWhatsAppUser) {
    // Pass extra params to WhatsAppLogin
    return <WhatsAppLogin extraParams={{ ref, src }} />;
  }
  
  return <UserLogin role="seller" />;
}
