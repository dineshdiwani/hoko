import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { setSession } from "../../services/storage";

export default function WhatsAppLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const mobileFromUrl = searchParams.get("mobile") || "";
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
  
  const [step, setStep] = useState("ENTER_OTP");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [mobile, setMobile] = useState(mobileFromUrl);

  useEffect(() => {
    console.log("[WhatsAppLogin] useEffect: mobileFromUrl=", mobileFromUrl, "mobile=", mobile);
    if (mobileFromUrl) {
      checkUserAndLogin();
    }
  }, [mobileFromUrl]);

  const checkUserAndLogin = async () => {
    const mobileNum = mobile || mobileFromUrl;
    if (!mobileNum) return;
    
    console.log("[WhatsAppLogin] Checking if user is registered:", mobileNum);
    setLoading(true);
    
    try {
      // Check if user exists and has seller profile
      const res = await api.post("/seller/otp/check-user", {
        mobile: "+" + mobileNum.replace(/\D/g, "")
      }, { timeout: 10000 });
      
      console.log("[WhatsAppLogin] Check user response:", res.data);
      
      if (res.data?.exists && res.data?.user) {
        // User exists - check if has seller profile
        const user = res.data.user;
        const hasSellerProfile = user.sellerProfile?.firmName && user.sellerProfile?.managerName;
        const hasSellerRole = user.roles?.seller;
        
        console.log("[WhatsAppLogin] User exists, hasSellerProfile:", hasSellerProfile, "hasSellerRole:", hasSellerRole);
        
        // Set session and redirect
        localStorage.removeItem("whatsapp_seller_mobile");
        
        await setSession({
          _id: user._id,
          role: user.role || "seller",
          roles: user.roles || { seller: true, buyer: true },
          email: user.email || "",
          city: user.city || "",
          name: user.name || "Seller",
          preferredCurrency: user.preferredCurrency || "INR",
          mobile: user.mobile,
          token: res.data.token,
          sellerProfile: user.sellerProfile
        });
        
        // Redirect based on roles - prioritize seller if has profile, else buyer
        const hasSellerProfile = user.sellerProfile?.firmName && user.sellerProfile?.managerName;
        const hasBothRoles = user.roles?.seller && user.roles?.buyer;
        
        if (hasBothRoles) {
          // User has both roles - go to seller dashboard (can switch to buyer from there)
          window.location.href = "/seller/dashboard";
        } else if (user.roles?.seller) {
          window.location.href = "/seller/dashboard";
        } else if (user.roles?.buyer) {
          window.location.href = "/buyer/dashboard";
        } else {
          window.location.href = "/seller/dashboard";
        }
        return;
      }
      
      // User doesn't exist - proceed to OTP
      console.log("[WhatsAppLogin] User not found, sending OTP");
      requestOtp();
      
    } catch (err) {
      console.log("[WhatsAppLogin] Check user error:", err?.response?.data || err?.message);
      // If check fails, proceed to OTP
      requestOtp();
    }
  };

  const requestOtp = async () => {
    const mobileNum = mobile || mobileFromUrl;
    if (!mobileNum) return;
    console.log("[WhatsAppLogin] Requesting OTP for mobile:", mobileNum);
    setLoading(true);
    setOtpError("");
    
    try {
      const res = await api.post("/seller/otp/request", {
        mobile: "+" + mobileNum.replace(/\D/g, "")
      }, { timeout: 10000 });
      
      setResendTimer(60);
      const interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setStep("ENTER_OTP");
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setOtpError("Request timed out. Please try again.");
      } else {
        setOtpError(err?.response?.data?.message || err?.message || "Failed to send OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 4) {
      setOtpError("Please enter 4-digit OTP");
      return;
    }
    setOtpError("");
    setLoading(true);
    try {
      console.log("[WhatsAppLogin] Verifying OTP for mobile:", mobile);
      const res = await api.post("/seller/otp/verify", {
        mobile: "+" + mobile,
        otp: otp
      });
      console.log("[WhatsAppLogin] Verify response:", res.data);
      
      if (res.data?.success) {
        const user = res.data.user || {};
        
        const dashParams = new URLSearchParams();
        if (cityFromUrl) dashParams.set("city", cityFromUrl);
        
        // Check if user already has complete seller profile
        const hasSellerProfile = user.sellerProfile?.firmName && user.sellerProfile?.managerName;
        const hasSellerRole = user.roles?.seller;
        console.log("[WhatsAppLogin] hasSellerProfile:", hasSellerProfile, "hasSellerRole:", hasSellerRole);
        
        // Set flag only if new WhatsApp login
        if (!hasSellerProfile) {
          localStorage.setItem("whatsapp_login", "true");
        }
        localStorage.removeItem("whatsapp_seller_mobile");
        
        await setSession({
          _id: user._id,
          role: user.role || "seller",
          roles: user.roles || { seller: true, buyer: true },
          email: user.email || "",
          city: cityFromUrl || user.city || "",
          name: user.name || "Seller",
          preferredCurrency: user.preferredCurrency || "INR",
          mobile: user.mobile || mobile,
          token: res.data.token,
          sellerProfile: user.sellerProfile
        });
        
        // Redirect based on registration status
        if (hasSellerProfile && hasSellerRole) {
          window.location.href = `/seller/dashboard?${dashParams.toString()}`;
        } else if (user.roles?.buyer && !hasSellerRole) {
          window.location.href = "/buyer/dashboard";
        } else {
          window.location.href = `/seller/dashboard?${dashParams.toString()}`;
        }
        return;
      } else {
        throw new Error(res.data?.message || "Verification failed");
      }
    } catch (err) {
      console.log("[WhatsAppLogin] Verify error:", err?.response?.data || err?.message);
      if (err.code === 'ECONNABORTED') {
        setOtpError("Request timed out. Please try again.");
      } else {
        setOtpError(err?.response?.data?.message || err?.message || "Invalid OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">H</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Hoko Seller</h1>
          <p className="text-gray-600 mt-1">Verify with WhatsApp to continue</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {step === "ENTER_OTP" && (
            <div className="space-y-6">
              {/* Mobile Display */}
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-600">WhatsApp OTP sent to</p>
                <p className="text-lg font-semibold text-gray-900">{mobile}</p>
              </div>

              {/* OTP Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 4-digit OTP
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 text-center text-2xl tracking-widest focus:border-amber-500 focus:outline-none"
                  placeholder="----"
                />
              </div>

              {/* Error Message */}
              {otpError && (
                <div className="text-red-600 text-sm text-center p-2 bg-red-50 rounded-lg">
                  {otpError}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 4}
                className="w-full bg-amber-500 text-white font-semibold py-4 rounded-xl hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              {/* Resend Link */}
              {resendTimer > 0 ? (
                <p className="text-center text-gray-500 text-sm">
                  Resend OTP in {resendTimer} seconds
                </p>
              ) : (
                <button
                  onClick={requestOtp}
                  disabled={loading}
                  className="w-full text-amber-600 font-medium py-2 hover:text-amber-700 disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}