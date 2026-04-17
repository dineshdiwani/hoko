import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import UserLogin from "../Auth/UserLogin";
import WhatsAppLogin from "../Auth/WhatsAppLogin";

export default function SellerLogin() {
  const [searchParams] = useSearchParams();
  
  const mobileFromUrl = searchParams.get("mobile") || "";
  const ref = searchParams.get("ref") || "";
  
  // If coming from WhatsApp with mobile, show WhatsApp login
  const isWhatsAppUser = ref === "wa" && mobileFromUrl;
  
  if (isWhatsAppUser) {
    return <WhatsAppLogin />;
  }
  
  return <UserLogin role="seller" />;
}
