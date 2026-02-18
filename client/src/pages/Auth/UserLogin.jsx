import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, setSession } from "../../services/storage";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import GoogleLoginButton from "../../components/GoogleLoginButton";

export default function UserLogin({ role = "buyer" }) {
  const isSeller = role === "seller";
  const currentRole = isSeller ? "seller" : "buyer";
  const navigate = useNavigate();
  const defaultTermsContent = [
    "By using hoko, you agree to these Terms & Conditions.",
    "hoko is a marketplace platform connecting buyers and sellers. You are responsible for all negotiations, pricing, delivery, and payments.",
    "You must provide accurate information and use the platform responsibly. Impersonation, fraud, or misuse is strictly prohibited.",
    "Abusive, hateful, or harassing language is not allowed in chat or messages. Violations may result in suspension or permanent removal from the platform.",
    "Sellers must ensure their business details are truthful and buyers must post genuine requirements. Any abuse may result in account restrictions.",
    "You are responsible for complying with all applicable laws, taxes, and regulations related to your transactions.",
    "hoko may update these terms at any time. Continued use of the platform indicates acceptance of the updated terms."
  ].join("\n\n");

  const [step, setStep] = useState("LOGIN");
  const [authMode, setAuthMode] = useState("LOGIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState("REQUEST");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [termsContent, setTermsContent] = useState(defaultTermsContent);
  const [cities, setCities] = useState([
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Chennai",
    "Hyderabad",
    "Pune"
  ]);

  const redirect = isSeller
    ? localStorage.getItem("post_login_redirect") || "/seller/dashboard"
    : "/buyer/dashboard";
  const loginIntent = localStorage.getItem("login_intent_role") || "buyer";
  const cityRef = useRef(city);
  const acceptedTermsRef = useRef(acceptedTerms);

  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  useEffect(() => {
    acceptedTermsRef.current = acceptedTerms;
  }, [acceptedTerms]);

  useEffect(() => {
    const session = getSession();
    if (session?.role === currentRole && session?.token) {
      navigate(redirect, { replace: true });
    }
  }, [navigate, redirect, currentRole]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
          const defaults = data?.defaults || {};
          const desiredCity = String(
            defaults.loginCity || defaults.city || ""
          ).trim();
          setCity((prevCity) => {
            if (prevCity) return prevCity;
            if (!desiredCity) return prevCity;
            const matchedCity = data.cities.find(
              (cityName) =>
                String(cityName).toLowerCase() ===
                desiredCity.toLowerCase()
            );
            return matchedCity || prevCity;
          });
        }
        const terms = String(
          data?.termsAndConditions?.content || ""
        ).trim();
        if (terms) {
          setTermsContent(terms);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isSeller) return;
    const profile = JSON.parse(
      localStorage.getItem("seller_profile") || "{}"
    );
    if (profile) {
      setEmail(profile.email || "");
      setCity(profile.city || "");
    }
  }, [isSeller]);

  function validEmail(value) {
    return /\S+@\S+\.\S+/.test(String(value || ""));
  }

  function sendLoginOtp() {
    setSubmitted(true);

    if (!validEmail(email)) {
      alert("Please enter a valid email");
      return;
    }
    if (!password || String(password).length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (!acceptedTerms) {
      alert("Please accept the Terms & Conditions");
      return;
    }

    if (authMode === "SIGNUP") {
      if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }
    }

    if (!city) {
      if (isSeller) {
        alert("City missing. Please register again.");
        navigate("/seller/register");
      } else {
        alert("Please select your city");
      }
      return;
    }

    setLoading(true);
    api
      .post("/auth/login", {
        email,
        password,
        role: currentRole,
        city,
        acceptTerms: acceptedTerms
      })
      .then(() => {
        setStep("OTP");
        alert("OTP sent to your email");
      })
      .catch((err) => {
        alert(
          err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.message ||
            "Failed to send OTP. Try again."
        );
      })
      .finally(() => setLoading(false));
  }

  async function applySellerProfile(cityValue) {
    const profile = JSON.parse(
      localStorage.getItem("seller_profile") || "{}"
    );
    if (!profile || Object.keys(profile).length === 0) {
      return profile;
    }
    await api.post("/seller/profile", {
      businessName: profile.businessName,
      registrationDetails: profile.registrationDetails,
      businessAddress: profile.businessAddress,
      ownerName: profile.ownerName,
      firmName: profile.firmName,
      managerName: profile.managerName,
      website: profile.website,
      taxId: profile.taxId,
      city: profile.city || cityValue
    });
    return profile;
  }

  function buildDisplayName(user, roleValue, profile) {
    if (roleValue === "seller") {
      return (
        profile?.businessName ||
        profile?.firmName ||
        user?.name ||
        "Seller"
      );
    }
    return user?.name || "Buyer";
  }

  function verifyOtp() {
    setSubmitted(true);
    if (!acceptedTerms) {
      alert("Please accept the Terms & Conditions");
      return;
    }
    if (String(otp).trim().length !== 6) {
      alert("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    api
      .post("/auth/verify-otp", {
        email,
        otp,
        role: currentRole,
        city,
        acceptTerms: acceptedTerms
      })
      .then(async (res) => {
        const user = res.data.user || {};
        const profile = isSeller ? await applySellerProfile(city) : null;

        setSession({
          _id: user._id,
          role: currentRole,
          roles: user.roles,
          email: user.email || email,
          city: user.city || city,
          name: buildDisplayName(user, currentRole, profile),
          preferredCurrency: user.preferredCurrency || "INR",
          token: res.data.token
        });

        localStorage.removeItem("post_login_redirect");
        if (acceptedTerms) {
          localStorage.setItem(
            "terms_accepted_at",
            new Date().toISOString()
          );
        }

        if (!isSeller && loginIntent === "seller") {
          try {
            const switchRes = await api.post("/auth/switch-role", {
              role: "seller"
            });
            setSession({
              _id: switchRes.data.user._id,
              role: switchRes.data.user.role,
              roles: switchRes.data.user.roles,
              email: switchRes.data.user.email,
              city: switchRes.data.user.city,
              name: "Seller",
              preferredCurrency:
                switchRes.data.user.preferredCurrency || "INR",
              token: switchRes.data.token
            });
            localStorage.removeItem("login_intent_role");
            navigate("/seller/dashboard", { replace: true });
            return;
          } catch (err) {
            const message = err?.response?.data?.message || "";
            localStorage.removeItem("login_intent_role");
            if (
              message === "Seller onboarding required" ||
              message === "Role not enabled"
            ) {
              navigate("/seller/register", { replace: true });
              return;
            }
          }
        }

        localStorage.removeItem("login_intent_role");
        navigate(redirect, { replace: true });
      })
      .catch((err) => {
        alert(
          err?.response?.data?.message ||
            "Invalid OTP. Please try again."
        );
      })
      .finally(() => setLoading(false));
  }

  function handleForgotRequest() {
    if (!validEmail(forgotEmail)) {
      alert("Please enter a valid email");
      return;
    }
    setForgotLoading(true);
    api
      .post("/auth/forgot-password", { email: forgotEmail })
      .then(() => {
        setForgotStep("VERIFY");
        alert("OTP sent to your email");
      })
      .catch((err) => {
        alert(
          err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.message ||
            "Failed to send OTP. Try again."
        );
      })
      .finally(() => setForgotLoading(false));
  }

  function handleForgotReset() {
    if (String(forgotOtp).trim().length !== 6) {
      alert("Please enter a valid 6-digit OTP");
      return;
    }
    if (!forgotPassword || String(forgotPassword).length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    setForgotLoading(true);
    api
      .post("/auth/reset-password", {
        email: forgotEmail,
        otp: forgotOtp,
        newPassword: forgotPassword
      })
      .then(() => {
        alert("Password reset successful. Please login.");
        setShowForgot(false);
        setForgotStep("REQUEST");
        setForgotEmail("");
        setForgotOtp("");
        setForgotPassword("");
      })
      .catch((err) => {
        alert(
          err?.response?.data?.message ||
            "Failed to reset password."
        );
      })
      .finally(() => setForgotLoading(false));
  }

  function handleGoogleLogin(credential) {
    const selectedCity = cityRef.current || city;
    const hasAcceptedTerms =
      acceptedTermsRef.current || acceptedTerms;

    if (!selectedCity) {
      alert(
        isSeller
          ? "City missing. Please register again."
          : "Please select your city"
      );
      if (isSeller) {
        navigate("/seller/register");
      }
      return;
    }

    if (!hasAcceptedTerms) {
      alert("Please accept the Terms & Conditions");
      return;
    }

    setLoading(true);
    api
      .post("/auth/google", {
        credential,
        role: currentRole,
        city: selectedCity,
        acceptTerms: hasAcceptedTerms
      })
      .then(async (res) => {
        const user = res.data.user || {};
        const profile = isSeller
          ? await applySellerProfile(selectedCity)
          : null;

        setSession({
          _id: user._id,
          role: currentRole,
          roles: user.roles,
          email: user.email,
          city: user.city || selectedCity,
          name: buildDisplayName(user, currentRole, profile),
          picture: user.picture,
          preferredCurrency: user.preferredCurrency || "INR",
          token: res.data.token
        });

        localStorage.removeItem("post_login_redirect");
        if (hasAcceptedTerms) {
          localStorage.setItem(
            "terms_accepted_at",
            new Date().toISOString()
          );
        }

        if (!isSeller && loginIntent === "seller") {
          try {
            const switchRes = await api.post("/auth/switch-role", {
              role: "seller"
            });
            setSession({
              _id: switchRes.data.user._id,
              role: switchRes.data.user.role,
              roles: switchRes.data.user.roles,
              email: switchRes.data.user.email,
              city: switchRes.data.user.city,
              name: "Seller",
              preferredCurrency:
                switchRes.data.user.preferredCurrency || "INR",
              token: switchRes.data.token
            });
            localStorage.removeItem("login_intent_role");
            navigate("/seller/dashboard", { replace: true });
            return;
          } catch (err) {
            const message = err?.response?.data?.message || "";
            localStorage.removeItem("login_intent_role");
            if (
              message === "Seller onboarding required" ||
              message === "Role not enabled"
            ) {
              navigate("/seller/register", { replace: true });
              return;
            }
          }
        }

        localStorage.removeItem("login_intent_role");
        navigate(redirect, { replace: true });
      })
      .catch((err) => {
        alert(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            "Google login failed."
        );
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] items-center">
          <div className="text-slate-900">
            <h1 className="page-hero mb-4">
              Access, fast and secure
            </h1>
            <p className="text-slate-600 text-lg leading-relaxed">
              Sign in with your email and password, then verify with an
              OTP sent to your inbox.
            </p>
            <div className="mt-8 hidden lg:block">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 px-4 py-2 text-slate-500 text-sm">
                Verified sellers * Live offers * Email OTP
              </div>
            </div>
          </div>

          <div className="w-full flex justify-center">
            <div
              className={`w-full max-w-md bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-5 mx-auto ${
                submitted ? "form-submitted" : ""
              }`}
            >
              <h1 className="text-2xl font-bold text-center text-gray-800 mb-1">
                Login
              </h1>
              <p className="text-center text-gray-500 mb-4">
                {authMode === "SIGNUP"
                  ? "Create account with email OTP"
                  : "Continue with email OTP"}
              </p>

              {step === "LOGIN" && (
                <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  City
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                  required
                >
                  <option value="">Select your city</option>
                  {cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>

                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                  required
                />

                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Password
                </label>
                <div className="relative mb-4">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-16"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-700"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                {authMode === "SIGNUP" && (
                  <>
                    <div className="relative mb-4">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(e.target.value)
                        }
                        placeholder="Confirm your password"
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-16"
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword((v) => !v)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-700"
                      >
                        {showConfirmPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </>
                )}

                <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) =>
                      setAcceptedTerms(e.target.checked)
                    }
                    className="mt-1"
                    required
                  />
                  <span>
                    I accept the{" "}
                    <button
                      type="button"
                      className="bg-transparent shadow-none text-amber-700 hover:underline"
                      onClick={() => setShowTerms(true)}
                    >
                      Terms & Conditions
                    </button>
                  </span>
                </div>

                <button
                  onClick={sendLoginOtp}
                  disabled={loading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold mt-3"
                >
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>

                <GoogleLoginButton
                  onSuccess={(credential) => {
                    handleGoogleLogin(credential);
                  }}
                  onError={(error) => {
                    const reason =
                      error?.message ||
                      "Google login failed to initialize.";
                    alert(reason);
                  }}
                  disabled={!city || !acceptedTerms}
                  onDisabledClick={() => {
                    if (!city && !acceptedTerms) {
                      alert("Please select city and accept Terms & Conditions first.");
                      return;
                    }
                    if (!city) {
                      alert("Please select your city first.");
                      return;
                    }
                    alert("Please accept the Terms & Conditions first.");
                  }}
                />

                {authMode === "LOGIN" ? (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setShowForgot(true)}
                      className="bg-transparent shadow-none text-amber-700 hover:underline"
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("SIGNUP");
                        setAcceptedTerms(false);
                      }}
                      className="bg-transparent shadow-none text-amber-700 hover:underline"
                    >
                      Sign up
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("LOGIN");
                        setAcceptedTerms(false);
                        setConfirmPassword("");
                      }}
                      className="bg-transparent shadow-none text-amber-700 hover:underline"
                    >
                      Already have an account? Login
                    </button>
                  </div>
                )}
                </>
              )}

              {step === "OTP" && (
                <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Enter OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                  required
                />

                <button
                  onClick={verifyOtp}
                  disabled={loading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {loading ? "Verifying..." : "Verify & Continue"}
                </button>

                <button
                  onClick={() => setStep("LOGIN")}
                  className="w-full mt-3 text-sm text-amber-700 hover:underline"
                >
                  Change details
                </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6 max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                Terms & Conditions (Buyers and Sellers)
              </h2>
              <button
                onClick={() => setShowTerms(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              {String(termsContent || "")
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (
                  <p key={`term-${index}`}>{line}</p>
                ))}
            </div>
          </div>
        </div>
      )}

      {showForgot && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Forgot Password</h2>
              <button
                onClick={() => setShowForgot(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            {forgotStep === "REQUEST" && (
              <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />
                <button
                  onClick={handleForgotRequest}
                  disabled={forgotLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {forgotLoading ? "Sending..." : "Send OTP"}
                </button>
              </>
            )}

            {forgotStep === "VERIFY" && (
              <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />

                <label className="block text-sm font-medium mb-1 text-gray-700">
                  New Password
                </label>
                <div className="relative mb-4">
                  <input
                    type={showForgotPassword ? "text" : "password"}
                    value={forgotPassword}
                    onChange={(e) => setForgotPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-700"
                  >
                    {showForgotPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <button
                  onClick={handleForgotReset}
                  disabled={forgotLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {forgotLoading ? "Resetting..." : "Reset Password"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
