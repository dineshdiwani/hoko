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
    if (mobileFromUrl) {
      requestOtp();
    }
  }, []);

  // Debug: show OTP in dev mode
  const [debugOtp, setDebugOtp] = useState(null);

  const requestOtp = async () => {
    if (!mobile) return;
    setLoading(true);
    setOtpError("");
    setDebugOtp(null);
    try {
      console.log("[WhatsAppLogin] Sending OTP request to +" + mobile.replace(/\D/g, ""));
      const res = await api.post("/seller/otp/request", {
        mobile: "+" + mobile.replace(/\D/g, "")
      });
      console.log("[WhatsAppLogin] OTP request success, response:", res?.data);
      
      // Show OTP in dev mode for testing
      if (res?.data?.otp) {
        setDebugOtp(res.data.otp);
      }
      
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
      console.error("[WhatsAppLogin] OTP request error:", err);
      console.error("[WhatsAppLogin] Error status:", err?.response?.status);
      console.error("[WhatsAppLogin] Error data:", err?.response?.data);
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP";
      setOtpError(msg);
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
        mobile: "+" + mobile.replace(/\D/g, ""),
        otp: otp
      });
      console.log("[WhatsAppLogin] Verify response:", res.data);
      
      if (res.data?.success) {
        const user = res.data.user || {};
        
        // Store WhatsApp params
        if (catsFromUrl) {
          localStorage.setItem("whatsapp_seller_cats", catsFromUrl);
        }
        if (cityFromUrl) {
          localStorage.setItem("whatsapp_seller_city", cityFromUrl);
        }
        
        if (res.data.token && res.data.user) {
          setSession({
            _id: user._id,
            role: user.role || "seller",
            roles: user.roles || { seller: true, buyer: true },
            email: user.email || "",
            city: cityFromUrl || user.city || "",
            name: user.name || "Seller",
            preferredCurrency: user.preferredCurrency || "INR",
            mobile: user.mobile || mobile,
            token: res.data.token
          });
        }
        
        // Clear WhatsApp temp storage
        localStorage.removeItem("whatsapp_seller_mobile");
        
        // Redirect to dashboard
        const dashParams = new URLSearchParams();
        if (cityFromUrl) dashParams.set("city", cityFromUrl);
        navigate(`/seller/dashboard?${dashParams.toString()}`, { replace: true });
      } else {
        throw new Error(res.data?.message || "Verification failed");
      }
    } catch (err) {
      setOtpError(err?.response?.data?.message || err?.message || "Invalid OTP");
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
              {/* Mobile display */}
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-600 mb-1">Verification code sent to</p>
                <p className="text-lg font-semibold text-gray-900">+{mobile}</p>
              </div>

              {/* OTP Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 4-digit code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="----"
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] focus:border-amber-500 focus:outline-none transition"
                  maxLength={4}
                />
                {otpError && (
                  <p className="text-red-500 text-sm mt-2 text-center">{otpError}</p>
                )}
                {/* Debug OTP display */}
                {debugOtp && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-700 font-medium mb-1">🔐 Test Mode - Your OTP:</p>
                    <p className="text-xl font-bold text-center text-yellow-800">{debugOtp}</p>
                    <p className="text-xs text-yellow-600 mt-1">Check console for more logs</p>
                  </div>
                )}
              </div>

              {/* Verify Button */}
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 4}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition"
              >
                {loading ? "Verifying..." : "Verify & Continue"}
              </button>

              {/* Resend */}
              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-gray-500 text-sm">Resend code in {resendTimer}s</p>
                ) : (
                  <button
                    onClick={requestOtp}
                    disabled={loading}
                    className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "SUCCESS" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Verified!</h2>
              <p className="text-gray-600">Redirecting to dashboard...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          By continuing, you agree to Hoko's Terms & Privacy Policy
        </p>
      </div>
    </div>
  );
}
