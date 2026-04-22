import { useSearchParams } from "react-router-dom";
import UserLogin from "../Auth/UserLogin";
import WhatsAppLogin from "../Auth/WhatsAppLogin";

export default function BuyerLogin() {
  const [searchParams] = useSearchParams();
  
  const mobileFromUrl = searchParams.get("mobile") || "";
  const ref = searchParams.get("ref") || "";
  const src = searchParams.get("src") || "";
  
  // If coming from WhatsApp with mobile, show WhatsApp login
  // Check both "ref=wa" and "src=wa" parameters
  const isWhatsAppUser = (ref === "wa" || src === "wa") && mobileFromUrl;
  
  if (isWhatsAppUser) {
    // Pass ref and other params to WhatsAppLogin
    const ref = searchParams.get("ref") || "";
    const src = searchParams.get("src") || "";
    const campaign = searchParams.get("campaign") || "";
    const redirect = searchParams.get("redirect") || "";
    
    return <WhatsAppLogin extraParams={{ ref, src, campaign, redirect }} />;
  }
  
  return <UserLogin role="buyer" />;
}