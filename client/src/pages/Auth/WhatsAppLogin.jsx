import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { setSession } from "../../services/storage";
import { fetchOptions } from "../../services/options";

export default function WhatsAppLogin({ extraParams = {} }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const mobileFromUrl = searchParams.get("mobile") || "";
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
  const redirectUrl = extraParams.redirect || searchParams.get("redirect") || "";
  
  const [step, setStep] = useState("ENTER_OTP");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [mobile, setMobile] = useState(mobileFromUrl);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  // City selection state
  const [showCityModal, setShowCityModal] = useState(false);
  const [pendingCitySession, setPendingCitySession] = useState(null);
  const [city, setCity] = useState("");
  const [cities, setCities] = useState([]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mobileFromUrl) return;
    
    // Check if already logged in
    const existingSession = JSON.parse(localStorage.getItem("hoko_session") || "null");
    if (existingSession?.token) {
      // Already logged in - go to redirect param or based on role
      const targetUrl = redirectUrl || (existingSession?.roles?.seller ? "/seller/dashboard" : "/buyer/dashboard");
      navigate(targetUrl, { replace: true });
      return;
    }
    
    // Not logged in - request OTP
    requestOtp();
  }, [mobileFromUrl, navigate, searchParams]);

  // Always require OTP verification - no auto-login
  const requestOtp = async () => {
    const mobileNum = mobile || mobileFromUrl;
    if (!mobileNum) return;
    setLoading(true);
    setOtpError("");
    
    try {
      const res = await api.post("/seller/otp/request", {
        mobile: "+" + mobileNum.replace(/\D/g, "")
      }, { timeout: 15000 });
      
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
      const res = await api.post("/seller/otp/verify", {
        mobile: "+" + mobile,
        otp: otp
      }, { timeout: 15000 });
      
      if (res.data?.success) {
        const user = res.data.user || {};
        
        // Check if user already has complete seller profile
        const hasSellerProfile = user.sellerProfile?.firmName && user.sellerProfile?.managerName;
        const hasSellerRole = user.roles?.seller;
        
        // Set flag only if new WhatsApp login
        if (!hasSellerProfile) {
          localStorage.setItem("whatsapp_login", "true");
        }
        localStorage.removeItem("whatsapp_seller_mobile");
        
        // Check if user needs to select city - show city modal instead of redirecting
        // userNeedsCity is true when user has no city AND no city in URL
        const userNeedsCity = !user.city && !cityFromUrl;
        
        if (userNeedsCity) {
          // Show city selection modal - user needs to select their city
          setPendingCitySession({
            _id: user._id,
            role: user.role || "seller",
            roles: user.roles || { seller: true, buyer: true },
            email: user.email || "",
            city: "",
            name: user.name || "User",
            preferredCurrency: user.preferredCurrency || "INR",
            mobile: user.mobile || mobile,
            token: res.data.token,
            sellerProfile: user.sellerProfile
          });
          setShowCityModal(true);
          setLoading(false);
          return;
        }
        
        // User has city or city from URL - set session and proceed
        const dashParams = new URLSearchParams();
        if (cityFromUrl) dashParams.set("city", cityFromUrl);
        
        setSession({
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
        
        // Redirect based on registration status or redirect param
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else if (hasSellerProfile && hasSellerRole) {
          window.location.href = `/seller/dashboard?${dashParams.toString()}`;
        } else if (user.roles?.buyer && !hasSellerRole) {
          window.location.href = "/buyer/dashboard";
        } else {
          // No seller profile - go to registration with all params
          const registerParams = new URLSearchParams();
          if (cityFromUrl || user.city) registerParams.set("city", cityFromUrl || user.city);
          if (mobile) registerParams.set("mobile", mobile);
          if (catsFromUrl) registerParams.set("cats", catsFromUrl);
          registerParams.set("ref", "wa");
          registerParams.set("from", "deeplink");
          window.location.href = `/seller/register?${registerParams.toString()}`;
        }
        return;
      } else {
        throw new Error(res.data?.message || "Verification failed");
      }
    } catch (err) {
      const errorData = err?.response?.data;
      if (errorData?.message) {
        setOtpError(errorData.message);
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
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

              {/* Terms Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 w-5 h-5 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-gray-600">
                  I accept the{" "}
                  <a href="#" className="text-amber-600 hover:underline">Terms & Conditions</a>{" "}
                  and{" "}
                  <a href="#" className="text-amber-600 hover:underline">Privacy Policy</a>
                </span>
              </label>

              {/* Submit Button */}
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 4 || !acceptedTerms}
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

        {/* City Selection Modal */}
        {showCityModal && pendingCitySession && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mt-6">
            <h2 className="text-xl font-bold mb-4">Select Your City</h2>
            <p className="text-gray-600 mb-4">Please select your city to continue</p>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
            >
              <option value="">Select City</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!city) {
                  alert("Please select your city");
                  return;
                }
                setShowCityModal(false);
                
                // Finalize session with selected city
                const finalSession = {
                  ...pendingCitySession,
                  city: city
                };
                
                // Save to localStorage
                setSession(finalSession);
                
                const isSellerRole = pendingCitySession?.roles?.seller;
                
                // Update user profile with selected city
                try {
                  const endpoint = isSellerRole ? "/seller/profile" : "/buyer/profile";
                  await api.post(endpoint, { city });
                } catch (e) {
                  console.warn("Profile update error:", e.response?.data || e.message);
                }
                
                // Navigate to appropriate dashboard
                const targetUrl = isSellerRole ? "/seller/dashboard" : "/buyer/dashboard";
                const dashParams = new URLSearchParams();
                dashParams.set("city", city);
                navigate(`${targetUrl}?${dashParams.toString()}`, { replace: true });
              }}
              className="w-full bg-amber-500 text-white font-semibold py-4 rounded-xl hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}