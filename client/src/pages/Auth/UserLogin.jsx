import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, setSession, clearSession } from "../../services/storage";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import GoogleLoginButton from "../../components/GoogleLoginButton";
import { isNativeAppRuntime } from "../../utils/runtime";
import { ensureNativePushRegistration, isNativePushEnabled } from "../../services/nativePush";

export default function UserLogin({ role = "buyer" }) {
  const isSeller = role === "seller";
  const currentRole = isSeller ? "seller" : "buyer";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mobileFromUrl = searchParams.get("mobile") || "";
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
  const isFromUrl = searchParams.has("ref");
  const isFromRequirement = searchParams.has("redirect");
  const postLoginRedirect = String(
    localStorage.getItem("post_login_redirect") || ""
  ).trim();
  const postLoginRedirectSource = String(
    localStorage.getItem("post_login_redirect_source") || ""
  )
    .trim()
    .toLowerCase();
  const isDeepLinkRedirect =
    postLoginRedirect.startsWith("/seller/deeplink/");
  const useSellerPostLoginRedirect =
    isSeller &&
    Boolean(postLoginRedirect) &&
    (postLoginRedirectSource === "deeplink" || isDeepLinkRedirect);
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
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [city, setCity] = useState(cityFromUrl);
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalModalType, setLegalModalType] = useState("terms");
  const [submitted, setSubmitted] = useState(false);
  const [termsContent, setTermsContent] = useState(defaultTermsContent);
  const [privacyPolicyContent, setPrivacyPolicyContent] = useState(defaultPrivacyPolicyContent);
  const [cities, setCities] = useState([]);
  const [waLinkLoading, setWaLinkLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState("");
  const [showCityModal, setShowCityModal] = useState(false);
  const [pendingCitySession, setPendingCitySession] = useState(null);

  const urlRedirect = searchParams.get("redirect") || "";
  
  const redirect = isSeller
    ? (useSellerPostLoginRedirect ? postLoginRedirect : "/seller/dashboard")
    : (urlRedirect || (localStorage.getItem("login_intent_role") === "seller"
        ? (postLoginRedirect || "/seller/register")
        : "/buyer/dashboard"));
  const cityRef = useRef(city);
  const acceptedTermsRef = useRef(acceptedTerms);

  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  useEffect(() => {
    acceptedTermsRef.current = acceptedTerms;
  }, [acceptedTerms]);

  useEffect(() => {
    if (mobileFromUrl) return;
    
    const session = getSession();
    if (session?.role === currentRole && session?.token) {
      const urlRedirect = searchParams.get("redirect");
      if (urlRedirect && !isSeller) {
        navigate(urlRedirect, { replace: true });
      } else {
        navigate(redirect, { replace: true });
      }
    }
  }, [navigate, redirect, currentRole, searchParams, isSeller, mobileFromUrl]);

  useEffect(() => {
    if (!mobileFromUrl || step !== "LOGIN") return;
    if (isSeller) return;

    if (!acceptedTerms) {
      setAcceptedTerms(true);
    }

    const sendWhatsAppOtp = async () => {
      try {
        const res = await api.post("/auth/login", {
          mobile: mobileFromUrl,
          role: currentRole,
          city: city || cityFromUrl
        });
        if (res.data?.success) {
          setMobile(mobileFromUrl);
          setStep("OTP");
          alert("OTP sent via WhatsApp to " + mobileFromUrl);
        }
      } catch (err) {
      }
    };

    sendWhatsAppOtp();
  }, [mobileFromUrl, step, acceptedTerms, city, cityFromUrl, currentRole, isSeller]);

  useEffect(() => {
    if (!isSeller || !mobileFromUrl) return;
    
    if (typeof clearSession === "function") {
      clearSession();
    }
    
    if (catsFromUrl) {
      localStorage.setItem("whatsapp_seller_cats", catsFromUrl);
    }
    if (cityFromUrl) {
      localStorage.setItem("whatsapp_seller_city", cityFromUrl);
    }
    localStorage.setItem("whatsapp_seller_mobile", mobileFromUrl);
    localStorage.setItem("whatsapp_login", "true");
  }, [isSeller, mobileFromUrl, cityFromUrl, catsFromUrl]);

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
      setCity(profile.city || cityFromUrl || "");
    }
  }, [isSeller, cityFromUrl]);

  useEffect(() => {
    if (!isSeller || !isFromUrl) return;
    if (catsFromUrl) {
      localStorage.setItem("whatsapp_categories", catsFromUrl);
    }
    if (cityFromUrl) {
      localStorage.setItem("whatsapp_city", cityFromUrl);
    }
    if (mobileFromUrl) {
      localStorage.setItem("whatsapp_mobile", mobileFromUrl);
    }
  }, [isSeller, isFromUrl, catsFromUrl, cityFromUrl, mobileFromUrl]);

  function validEmail(value) {
    return /\S+@\S+\.\S+/.test(String(value || ""));
  }

  async function requestWhatsAppLogin() {
    if (!mobile || mobile.length < 10) {
      alert("Please enter your 10-digit mobile number");
      return;
    }
    
    if (!city) {
      alert("Please select your city");
      return;
    }
    if (!acceptedTerms) {
      alert("Please accept Terms & Conditions");
      return;
    }
    
    setLoginMethod("whatsapp");
    setWaLinkLoading(true);
    try {
      const res = await api.post("/auth/whatsapp/request", {
        mobile: mobile,
        city
      });
      if (res.data?.success) {
        window.open(res.data.wa_link, "_blank");
        setStep("OTP");
      } else {
        alert(res.data?.message || "Failed to generate login link");
      }
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to generate login link");
    } finally {
      setWaLinkLoading(false);
    }
  }

  function sendLoginOtp() {
    setSubmitted(true);

    if (!validEmail(email)) {
      alert("Please enter a valid email address");
      return;
    }

    if (!city) {
      alert("Please select your city");
      return;
    }
    if (!acceptedTerms) {
      alert("Please accept Terms & Conditions");
      return;
    }

    setOtpLoading(true);
    setLoginMethod("email");
    api.post("/auth/login", { email, role: currentRole, city, acceptTerms: acceptedTerms })
      .then((res) => {
        if (res.data?.success) {
          setStep("OTP");
          alert("OTP sent to your email");
        } else {
          alert(res.data?.message || "Failed to send OTP");
        }
      })
      .catch((err) => {
        const message =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to send OTP. Try again.";
        if (
          isSeller &&
          (message ===
            "Complete buyer login and seller registration first" ||
            message === "Complete seller registration before login")
        ) {
          alert(message);
          navigate("/seller/register");
          return;
        }
        alert(message);
      })
      .finally(() => setOtpLoading(false));
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

  function setBuyerDashboardDefaultTab(nextCity) {
    if (currentRole !== "buyer") return;
    try {
      localStorage.setItem(
        "buyer_dashboard_state",
        JSON.stringify({
          activeTab: "posts",
          city: String(nextCity || city || "").trim(),
          selectedCategory: "all"
        })
      );
    } catch {}
  }

  function startNativePushRegistration() {
    if (!isNativeAppRuntime() || !isNativePushEnabled()) return;
    window.setTimeout(() => {
      ensureNativePushRegistration(true).catch(() => false);
    }, 0);
  }

  function verifyOtp() {
    setSubmitted(true);
    if (!acceptedTerms) {
      alert("Please accept the Terms & Conditions and Privacy Policy");
      return;
    }
    const otpLength = String(otp).trim().length;
    if (otpLength !== 4 && otpLength !== 6) {
      alert("Please enter a valid 4 or 6-digit OTP");
      return;
    }

    setOtpLoading(true);
    const payload = {
      otp,
      role: currentRole,
      city,
      acceptTerms: acceptedTerms
    };
    let endpoint = "/auth/verify-otp";
    if (loginMethod === "whatsapp") {
      endpoint = "/auth/whatsapp/verify";
      payload.mobile = mobile;
    } else {
      payload.email = email;
      payload.mobile = mobileFromUrl;
    }
    api
      .post(endpoint, payload)
      .then(async (res) => {
        const user = res.data.user || {};
        const profile = isSeller ? await applySellerProfile(city) : null;
        const sellerIntent =
          localStorage.getItem("login_intent_role") === "seller";
        const sellerCapable = Boolean(user?.roles?.seller);

        setSession({
          _id: user._id,
          role: currentRole,
          roles: user.roles,
          email: user.email || email,
          city: user.city || city,
          name: buildDisplayName(user, currentRole, profile),
          preferredCurrency: user.preferredCurrency || "INR",
          mobile: user.mobile || mobile || "",
          token: res.data.token
        });

        localStorage.setItem("seller_email", user.email || email || "");

        if (!(currentRole === "buyer" && sellerIntent)) {
          localStorage.removeItem("post_login_redirect");
          localStorage.removeItem("post_login_redirect_source");
        }
        if (acceptedTerms) {
          localStorage.setItem(
            "terms_accepted_at",
            new Date().toISOString()
          );
        }

        if (!(currentRole === "buyer" && sellerIntent)) {
          localStorage.removeItem("login_intent_role");
        }
        setBuyerDashboardDefaultTab(user.city || city);
        
        const pendingWhatsAppData = localStorage.getItem("pending_whatsapp_offer_data");
        
        if (currentRole === "buyer" && sellerIntent && !sellerCapable) {
          if (pendingWhatsAppData) {
            try {
              const data = JSON.parse(pendingWhatsAppData);
              if (data.mobile && data.sellerCity) {
                await api.post("/seller/profile", {
                  businessName: data.sellerName || data.mobile,
                  city: data.sellerCity
                });
                await api.post("/auth/switch-role", { role: "seller" });
                setSession({
                  ...JSON.parse(localStorage.getItem("session") || "{}"),
                  role: "seller",
                  roles: { ...(user?.roles || {}), seller: true }
                });
                localStorage.removeItem("pending_whatsapp_offer_data");
                const dashboardParams = new URLSearchParams();
                dashboardParams.set("openRequirement", data.requirementId || "");
                if (data.sellerCity) dashboardParams.set("city", data.sellerCity);
                navigate(`/seller/dashboard?${dashboardParams.toString()}`, { replace: true });
                return;
              }
            } catch (e) {
              console.error("[Login] Failed to auto-register seller:", e);
            }
          }
          navigate("/seller/register", { replace: true });
          return;
        }
        startNativePushRegistration();
        navigate(redirect, { replace: true });
      })
      .catch((err) => {
        const message =
          err?.response?.data?.message ||
          "Invalid OTP. Please try again.";
        if (isSeller && message === "Complete seller registration before login") {
          alert(message);
          navigate("/seller/register", { replace: true });
          return;
        }
        alert(message);
      })
      .finally(() => setOtpLoading(false));
  }

  function handleGoogleLogin(credential) {
    setGoogleLoading(true);
    api
      .post("/auth/google", {
        credential,
        role: currentRole,
        city: "",
        acceptTerms: true,
        mobile: mobileFromUrl
      })
      .then(async (res) => {
        const user = res.data.user || {};
        
        // Store session temporarily without city
        const tempSession = {
          _id: user._id,
          role: currentRole,
          roles: user.roles,
          email: user.email,
          city: "",
          name: user.name || "Buyer",
          picture: user.picture,
          preferredCurrency: user.preferredCurrency || "INR",
          token: res.data.token
        };
        
        localStorage.setItem("seller_email", user.email || "");
        localStorage.setItem("terms_accepted_at", new Date().toISOString());
        
        // Show city modal before navigating
        setPendingCitySession(tempSession);
        setShowCityModal(true);
      })
      .catch((err) => {
        alert(err?.response?.data?.message || "Login failed");
      })
      .finally(() => setGoogleLoading(false));
  }
.then(async (res) => {
        const user = res.data.user || {};
        const profile = isSeller
          ? await applySellerProfile(user.city || "")
          : null;
        const sellerIntent =
          localStorage.getItem("login_intent_role") === "seller";
        const sellerCapable = Boolean(user?.roles?.seller);

        setSession({
          _id: user._id,
          role: currentRole,
          roles: user.roles,
          email: user.email,
          city: user.city || "",
          name: buildDisplayName(user, currentRole, profile),
          picture: user.picture,
          preferredCurrency: user.preferredCurrency || "INR",
          token: res.data.token
        });

        localStorage.setItem("seller_email", user.email || "");

        if (!(currentRole === "buyer" && sellerIntent)) {
          localStorage.removeItem("post_login_redirect");
          localStorage.removeItem("post_login_redirect_source");
        }
        if (true) {
          localStorage.setItem(
            "terms_accepted_at",
            new Date().toISOString()
          );
        }

        if (!(currentRole === "buyer" && sellerIntent)) {
          localStorage.removeItem("login_intent_role");
        }
        setBuyerDashboardDefaultTab(user.city || "");
        
        localStorage.setItem("pending_city_selection", "true");
        
        const pendingWhatsAppData = localStorage.getItem("pending_whatsapp_offer_data");
        
        if (currentRole === "buyer" && sellerIntent && !sellerCapable) {
          if (pendingWhatsAppData) {
            try {
              const data = JSON.parse(pendingWhatsAppData);
              if (data.mobile && data.sellerCity) {
                await api.post("/seller/profile", {
                  businessName: data.sellerName || data.mobile,
                  city: data.sellerCity
                });
                await api.post("/auth/switch-role", { role: "seller" });
                setSession({
                  ...JSON.parse(localStorage.getItem("session") || "{}"),
                  role: "seller",
                  roles: { ...(user?.roles || {}), seller: true }
                });
                localStorage.removeItem("pending_whatsapp_offer_data");
                const dashboardParams = new URLSearchParams();
                dashboardParams.set("openRequirement", data.requirementId || "");
                if (data.sellerCity) dashboardParams.set("city", data.sellerCity);
                navigate(`/seller/dashboard?${dashboardParams.toString()}`, { replace: true });
                return;
              }
            } catch (e) {
              console.error("[Login] Failed to auto-register seller:", e);
            }
          }
          navigate("/seller/register", { replace: true });
          return;
        }
        startNativePushRegistration();
        navigate(redirect, { replace: true });
      })
      .catch((err) => {
        const message =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Google login failed.";
        const debug = err?.response?.data?.debug;
        console.error("[GoogleLogin] error:", message, "debug:", debug);
        if (
          isSeller &&
          (message ===
            "Complete seller registration before Google login" ||
            message === "Complete seller registration before login")
        ) {
          alert(message);
          navigate("/seller/register", { replace: true });
          return;
        }
        alert(message + (debug ? `\n\nDebug: token aud=${debug.tokenAud}, expected=${debug.expected}, error=${debug.error}` : ""));
      })
      .finally(() => setGoogleLoading(false));
  }

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] items-center">
          <div className="text-slate-900">
            <h1 className="page-hero mb-4">
              {isFromRequirement ? "Login to track your requirement" : "Access, fast and secure"}
            </h1>
            <p className="text-slate-600 text-lg leading-relaxed">
              {isFromRequirement
                ? "Get instant notifications when sellers respond to your requirement"
                : "Sign in with your email and verify instantly using an OTP sent to your inbox."}
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
                {isFromRequirement ? "One step away!" : "Login to Hoko"}
              </h1>

              {step === "LOGIN" && (
                <>
                <p className="text-center text-gray-500 text-sm mb-4">
                  Choose your login method
                </p>

                <button
                  onClick={() => {
                    setLoginMethod("whatsapp");
                    setStep("WHATSAPP_LOGIN");
                  }}
                  className="w-full py-4 rounded-xl bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold flex items-center justify-center gap-3 mb-3"
                >
                  <svg viewBox="0 0 48 48" className="h-6 w-6" fill="white">
                    <path d="M40.8 7.2c-4.5-4.5-10.5-7-17-7-.8 0-1.6.1-2.4.2-2.2.4-4.2 1.4-5.8 3l-3.2 3.2c-.4.4-.7 1-.8 1.6l-1 8.4c-.1.5 0 1 .2 1.5.2.5.6 1 1 1.3l13.8 9.2c.5.3 1.1.5 1.6.5h.2l8.6-.8c.8-.1 1.5-.5 2-1.2.6-.8.7-1.8.4-2.7L43 12c-.1-.8-.4-1.5-1-2.2-.5-.6-1.2-1.2-2.2-1.6zm-3 14.2l-9.5 1c-.7.1-1.4-.1-2-.5L15.5 18.5l2.8-2.6c.4-.4.9-.7 1.5-.8l7.2-.8c.5 0 1-.2 1.4-.5l3-2.6c2.4-1.8 5.4-2.3 8.2-1.3.7.2 1.4.6 1.9 1.2l2.6 3.2c.4.5.5 1.2.4 1.8z"/>
                  </svg>
                  <span>Continue with WhatsApp</span>
                </button>

                <div className="flex items-center gap-3 my-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold text-slate-400">OR</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                  onClick={() => {
                    setLoginMethod("email");
                    setStep("EMAIL_LOGIN");
                  }}
                  className="w-full py-4 rounded-xl border-2 border-amber-500 hover:bg-amber-50 text-amber-700 font-semibold flex items-center justify-center gap-3 mb-4"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Continue with Email</span>
                </button>
                </>
              )}

{step === "WHATSAPP_LOGIN" && (
                <>
                <button
                  onClick={() => {
                    setStep("LOGIN");
                    setOtp("");
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-4"
                >
                  ← Back
                </button>

                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />

                <div className="flex items-start gap-2 text-sm text-gray-600 mb-4">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I accept the{" "}
                    <button type="button" className="text-amber-700 hover:underline" onClick={() => { setLegalModalType("terms"); setShowLegalModal(true); }}>
                      Terms
                    </button>
                    {" "}and{" "}
                    <button type="button" className="text-amber-700 hover:underline" onClick={() => { setLegalModalType("privacy"); setShowLegalModal(true); }}>
                      Privacy Policy
                    </button>
                  </span>
                </div>

                <button
                  onClick={requestWhatsAppLogin}
                  disabled={waLinkLoading}
                  className="w-full py-3 rounded-xl bg-[#25D366] hover:bg-[#20BD5A] disabled:opacity-50 text-white font-semibold"
                >
                  {waLinkLoading ? "Generating link..." : "Open WhatsApp & Get OTP"}
                </button>

                <p className="text-center text-xs text-gray-500 mt-3">
                  Opens WhatsApp. Send "LOGIN" to receive OTP.
                </p>
                </>
              )}

              {step === "EMAIL_LOGIN" && (
                <>
                <button
                  onClick={() => {
                    setStep("LOGIN");
                    setOtp("");
                    setEmail("");
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-4"
                >
                  ← Back
                </button>

                <GoogleLoginButton
                  disabled={googleLoading}
                  autoSelect={true}
                  onSuccess={(credential) => {
                    setLoginMethod("google");
                    handleGoogleLogin(credential);
                  }}
                  onError={(error) => {
                    const reason = error?.message || "Google login failed";
                    if (!reason.includes("cancelled")) {
                      alert(reason);
                    }
                  }}
                />

                <div className="flex items-center gap-3 my-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold text-slate-400">OR</span>
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
                />

                <div className="text-sm text-gray-600 mb-4">
                  <span className="text-sm">
                    By continuing, you accept our{" "}
                    <button type="button" className="text-amber-700 hover:underline" onClick={() => { setLegalModalType("terms"); setShowLegalModal(true); }}>
                      Terms & Conditions
                    </button>
                    {" "}and{" "}
                    <button type="button" className="text-amber-700 hover:underline" onClick={() => { setLegalModalType("privacy"); setShowLegalModal(true); }}>
                      Privacy Policy
                    </button>
                  </span>
                </div>

                <button
                  onClick={() => {
                    setLoginMethod("email");
                    sendLoginOtp();
                  }}
                  disabled={otpLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {otpLoading ? "Sending OTP..." : "Send OTP to Email"}
                </button>
              </>
              )}

              {step === "OTP" && (
                <>
                  <button
                    onClick={() => {
                      if (loginMethod === "whatsapp") {
                        setStep("WHATSAPP_LOGIN");
                      } else {
                        setStep("EMAIL_LOGIN");
                      }
                      setOtp("");
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 mb-4"
                  >
                    ← Back
                  </button>

                  <div className="text-center mb-4 p-3 bg-green-50 rounded-xl">
                    <p className="text-sm text-gray-600">OTP sent via {loginMethod} to:</p>
                    <p className="font-semibold text-gray-800">{loginMethod === "whatsapp" ? mobile : email}</p>
                  </div>

                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Enter OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter OTP"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4 text-center text-xl tracking-widest"
                />

                <button
                  onClick={verifyOtp}
                  disabled={otpLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {otpLoading ? "Verifying..." : "Verify & Login"}
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

      {showCityModal && pendingCitySession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 mx-4">
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
              onClick={() => {
                if (!city) {
                  alert("Please select your city");
                  return;
                }
                setShowCityModal(false);
                
                // Finalize session with selected city
                setSession({
                  ...pendingCitySession,
                  city: city
                });
                
                localStorage.setItem("buyer_dashboard_state", JSON.stringify({
                  activeTab: "posts",
                  city: city,
                  selectedCategory: "all"
                }));
                
                navigate(redirect, { replace: true });
              }}
              className="w-full py-3 rounded-xl btn-brand font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}