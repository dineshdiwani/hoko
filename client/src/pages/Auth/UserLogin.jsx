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
  const defaultPrivacyPolicyContent = [
    "We collect account, profile, and usage information needed to provide the hoko marketplace.",
    "Buyer and seller contact details and posted requirements/offers are shared as required to enable transactions.",
    "You are responsible for the information you publish and share on the platform.",
    "We use data to operate the service, improve security, prevent fraud/abuse, and comply with legal obligations.",
    "We may use trusted service providers for hosting, analytics, communication, and support operations.",
    "We do not sell personal information. We may disclose data when required by law or valid legal process.",
    "You can request correction or deletion of eligible personal data by contacting support.",
    "By continuing to use hoko, you acknowledge this Privacy Policy and any future updates."
  ].join("\n\n");

  const [step, setStep] = useState("LOGIN");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalModalType, setLegalModalType] = useState("terms");
  const [submitted, setSubmitted] = useState(false);
  const [termsContent, setTermsContent] = useState(defaultTermsContent);
  const [privacyPolicyContent, setPrivacyPolicyContent] = useState(defaultPrivacyPolicyContent);
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
        }
        const terms = String(
          data?.termsAndConditions?.content || ""
        ).trim();
        if (terms) {
          setTermsContent(terms);
        }
        const privacy = String(
          data?.privacyPolicy?.content || ""
        ).trim();
        if (privacy) {
          setPrivacyPolicyContent(privacy);
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

    if (!acceptedTerms) {
      alert("Please accept the Terms & Conditions and Privacy Policy");
      return;
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
      alert("Please accept the Terms & Conditions and Privacy Policy");
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
      alert("Please accept the Terms & Conditions and Privacy Policy");
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
              Sign in with your email and verify instantly using an OTP sent to your inbox.
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
                Continue with email OTP
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

                {!city || !acceptedTerms ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!city && !acceptedTerms) {
                        alert("Please select city and accept Terms & Conditions and Privacy Policy first.");
                        return;
                      }
                      if (!city) {
                        alert("Please select your city first.");
                        return;
                      }
                      alert("Please accept the Terms & Conditions and Privacy Policy first.");
                    }}
                    className="w-full mt-3 h-[44px] rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-2"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center">
                      <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.4 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.14-3.09-.4-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </span>
                    <span>Continue with Google</span>
                  </button>
                ) : (
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
                  />
                )}

                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold tracking-wide text-slate-500">
                    OR
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

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

                <button
                  onClick={sendLoginOtp}
                  disabled={loading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>

                <div className="mt-3 flex items-start gap-2 text-sm text-gray-600">
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
                      onClick={() => {
                        setLegalModalType("terms");
                        setShowLegalModal(true);
                      }}
                    >
                      Terms & Conditions
                    </button>
                    {" "}and{" "}
                    <button
                      type="button"
                      className="bg-transparent shadow-none text-amber-700 hover:underline"
                      onClick={() => {
                        setLegalModalType("privacy");
                        setShowLegalModal(true);
                      }}
                    >
                      Privacy Policy
                    </button>
                  </span>
                </div>
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

      {showLegalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6 max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                {legalModalType === "privacy"
                  ? "Privacy Policy"
                  : "Terms & Conditions (Buyers and Sellers)"}
              </h2>
              <button
                onClick={() => setShowLegalModal(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              {String(
                legalModalType === "privacy"
                  ? privacyPolicyContent
                  : termsContent
              )
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (
                  <p key={`legal-${index}`}>{line}</p>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
