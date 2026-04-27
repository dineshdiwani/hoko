import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { setSession } from "../../services/storage";
import { fetchOptions } from "../../services/options";

export default function BuyerWhatsAppLogin({ extraParams = {} }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const mobileFromUrl = searchParams.get("mobile") || "";
  const ref = searchParams.get("ref") || "";
  
  const [step, setStep] = useState("ENTER_OTP");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [mobile, setMobile] = useState(mobileFromUrl);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (!mobileFromUrl) return;
    
    const existingSession = JSON.parse(localStorage.getItem("hoko_session") || "null");
    if (existingSession?.token) {
      const targetUrl = `/buyer/dashboard?activeTab=posts`;
      navigate(targetUrl, { replace: true });
      return;
    }
    
    requestOtp();
  }, [mobileFromUrl, navigate, searchParams]);

  const requestOtp = async () => {
    const mobileNum = mobile || mobileFromUrl;
    if (!mobileNum) return;
    setLoading(true);
    setOtpError("");
    
    try {
      const res = await api.post("/buyer/otp/request", {
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
      const res = await api.post("/buyer/otp/verify", {
        mobile: "+" + mobile,
        otp: otp
      }, { timeout: 15000 });
      
      if (res.data?.success) {
        const user = res.data.user || {};
        
        setSession({
          _id: user._id,
          role: "buyer",
          roles: user.roles || { buyer: true },
          email: user.email || "",
          city: user.city || "",
          name: user.name || "Buyer",
          preferredCurrency: user.preferredCurrency || "INR",
          mobile: user.mobile || mobile,
          token: res.data.token
        });
        
        navigate(`/buyer/dashboard?activeTab=posts`, { replace: true });
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">H</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Hoko Buyer</h1>
          <p className="text-gray-600 mt-1">Verify with WhatsApp to continue</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {step === "ENTER_OTP" && (
            <div className="space-y-6">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-600">WhatsApp OTP sent to</p>
                <p className="text-lg font-semibold text-gray-900">{mobile}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 4-digit OTP
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 text-center text-2xl tracking-widest focus:border-blue-500 focus:outline-none"
                  placeholder="----"
                />
              </div>

              {otpError && (
                <div className="text-red-600 text-sm text-center p-2 bg-red-50 rounded-lg">
                  {otpError}
                </div>
              )}

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">
                  I accept the{" "}
                  <a href="#" className="text-blue-600 hover:underline">Terms & Conditions</a>{" "}
                  and{" "}
                  <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>
                </span>
              </label>

              <button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 4 || !acceptedTerms}
                className="w-full bg-blue-500 text-white font-semibold py-4 rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              {resendTimer > 0 ? (
                <p className="text-center text-gray-500 text-sm">
                  Resend OTP in {resendTimer} seconds
                </p>
              ) : (
                <button
                  onClick={requestOtp}
                  disabled={loading}
                  className="w-full text-blue-600 font-medium py-2 hover:text-blue-700 disabled:opacity-50"
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