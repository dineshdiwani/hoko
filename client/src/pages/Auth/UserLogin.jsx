import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, setSession } from "../../services/storage";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import GoogleLoginButton from "../../components/GoogleLoginButton";
import { isNativeAppRuntime } from "../../utils/runtime";
import { ensureNativePushRegistration, isNativePushEnabled } from "../../services/nativePush";
import { CapacitorSmsRetriever } from "@shaher/capacitor-sms-retriever";

export default function UserLogin({ role = "buyer" }) {
  const isSeller = role === "seller";
  const currentRole = isSeller ? "seller" : "buyer";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
  const sourceFromUrl = String(searchParams.get("from") || "").trim().toLowerCase();
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
    (postLoginRedirectSource === "deeplink" ||
      postLoginRedirectSource === "offer" ||
      isDeepLinkRedirect);
  const isSellerWhatsAppFlow =
    isSeller &&
    (sourceFromUrl === "wa" || Boolean(cityFromUrl) || Boolean(catsFromUrl));
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

const [step, setStep] = useState("EMAIL_LOGIN");
  const emailOrMobileFromUrl = searchParams.get("mobile") || "";
  const hasMobileInUrl = Boolean(emailOrMobileFromUrl);

  const [email, setEmail] = useState("");
  const [emailOrMobile, setEmailOrMobile] = useState(emailOrMobileFromUrl);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [city, setCity] = useState(cityFromUrl);
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalModalType, setLegalModalType] = useState("terms");
  const [submitted, setSubmitted] = useState(false);
  const [termsContent, setTermsContent] = useState(defaultTermsContent);
  const [privacyPolicyContent, setPrivacyPolicyContent] = useState(defaultPrivacyPolicyContent);
  const [cities, setCities] = useState([]);
  const [loginMethod, setLoginMethod] = useState("");
  const [showCityModal, setShowCityModal] = useState(false);
  const [pendingCitySession, setPendingCitySession] = useState(null);
  const [pendingLoginMethod, setPendingLoginMethod] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const otpInputRefs = useRef([]);
  const otpAutoFillRef = useRef(null);
  const webOtpAbortRef = useRef(null);

  const urlRedirect = searchParams.get("redirect") || "";
  const redirectTab = searchParams.get("tab") || "";
  
  const loginIntentSeller = localStorage.getItem("login_intent_role") === "seller";
  
  const finalRedirect = urlRedirect 
    ? (redirectTab ? `${urlRedirect}?tab=${redirectTab}` : urlRedirect)
    : (isSeller
        ? `/seller/dashboard${
            isSellerWhatsAppFlow
              ? `?${new URLSearchParams({
                  ...(cityFromUrl ? { city: cityFromUrl } : {}),
                  ...(catsFromUrl ? { cats: catsFromUrl } : {}),
                  ...(sourceFromUrl ? { from: sourceFromUrl } : {})
                }).toString()}`
              : ""
          }`
        : "/buyer/dashboard");
  
  const redirect = finalRedirect;

  function hasCompleteSellerProfile(user) {
    return Boolean(
      user?.sellerProfile?.registeredBusinessName &&
      user?.sellerProfile?.managerName
    );
  }

  function buildSellerResumeRedirect() {
    if (!postLoginRedirect) return "";
    try {
      const url = new URL(postLoginRedirect, window.location.origin);
      if (useSellerPostLoginRedirect) {
        url.searchParams.set("autoSubmit", "true");
      }
      // Preserve WhatsApp flow if coming from WhatsApp
      if (localStorage.getItem("whatsapp_mobile")) {
        url.searchParams.set("from", "wa");
        const waMobile = localStorage.getItem("whatsapp_mobile");
        if (waMobile) url.searchParams.set("mobile", waMobile);
      }
      return `${url.pathname}${url.search}`;
    } catch {
      return postLoginRedirect;
    }
  }

  function buildSellerRegisterRedirect() {
    const params = new URLSearchParams();
    const loginMobile = String(mobile || emailOrMobileFromUrl || "").trim();
    if (loginMobile) params.set("mobile", loginMobile);
    if (cityFromUrl) params.set("city", cityFromUrl);
    if (catsFromUrl) params.set("cats", catsFromUrl);
    if (sourceFromUrl) params.set("from", sourceFromUrl);
    return `/seller/register${params.toString() ? `?${params.toString()}` : ""}`;
  }

  function buildSellerDashboardRedirect(cityValue = cityFromUrl) {
    const params = new URLSearchParams();
    const normalizedCity = String(cityValue || "").trim();
    if (normalizedCity) params.set("city", normalizedCity);
    if (catsFromUrl) params.set("cats", catsFromUrl);
    if (sourceFromUrl) params.set("from", sourceFromUrl);
    return `/seller/dashboard${params.toString() ? `?${params.toString()}` : ""}`;
  }

  function forceBuyerPostsTab() {
    try {
      localStorage.setItem("buyer_dashboard_force_tab", "posts");
    } catch {}
  }
  useEffect(() => {
    const session = getSession();
    if (session?.role === currentRole && session?.token) {
      const urlRedirect = searchParams.get("redirect");
      if (urlRedirect && !isSeller) {
        navigate(urlRedirect, { replace: true });
      } else {
        navigate(redirect, { replace: true });
      }
      return;
    }
  }, [navigate, redirect, currentRole, searchParams, isSeller, cityFromUrl, sourceFromUrl]);

useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
        }
        // Pre-select city from URL when available
        const cityFromUrl = searchParams.get("city") || "";
        if (cityFromUrl && data.cities.includes(cityFromUrl)) {
          setCity(cityFromUrl);
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
    if (resendTimer <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendTimer]);

  useEffect(() => {
    if (step !== "OTP") {
      if (webOtpAbortRef.current) {
        webOtpAbortRef.current.abort();
        webOtpAbortRef.current = null;
      }
      // Stop SMS retriever if running
      if (isNativeAppRuntime()) {
        CapacitorSmsRetriever.stopListening().catch(() => {});
      }
      return undefined;
    }

    focusOtpBox(0);

    const isNative = isNativeAppRuntime();

    if (isNative && loginMethod === "sms") {
      // Use SMS Retriever plugin for Android
      CapacitorSmsRetriever.startListening()
        .then((result) => {
          const smsBody = String(result?.body || "");
          const code = (smsBody.match(/\b(\d{6})\b/) || [])[1];
          if (code && code.length === 6) {
            setOtp(code);
          }
        })
        .catch(() => {});
      
      return () => {
        CapacitorSmsRetriever.stopListening().catch(() => {});
      };
    }

    if (isNative) {
      // For native app without SMS retriever, focus the hidden input to trigger keyboard autofill
      setTimeout(() => {
        otpAutoFillRef.current?.focus();
      }, 300);
      return undefined;
    }

    const supportsWebOtp =
      typeof window !== "undefined" &&
      "OTPCredential" in window &&
      navigator.credentials &&
      typeof navigator.credentials.get === "function";

    if (!supportsWebOtp || loginMethod !== "sms") return undefined;

    const controller = new AbortController();
    webOtpAbortRef.current = controller;

    navigator.credentials
      .get({
        otp: { transport: ["sms"] },
        signal: controller.signal
      })
      .then((credential) => {
        const code = String(credential?.code || "").replace(/\D/g, "").slice(0, 6);
        if (code.length === 6) {
          setOtp(code);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (webOtpAbortRef.current === controller) {
          webOtpAbortRef.current = null;
        }
      });

    return () => {
      controller.abort();
      if (webOtpAbortRef.current === controller) {
        webOtpAbortRef.current = null;
      }
    };
  }, [step, loginMethod]);

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

  function validEmail(value) {
    return /\S+@\S+\.\S+/.test(String(value || ""));
  }

  function normalizeMobileDigits(value) {
    return String(value || "").replace(/\D/g, "").slice(-10);
  }

  function getOtpIdentifier(value) {
    const raw = String(value || "").trim();
    if (!raw) return { ok: false, message: "Please enter email or 10-digit mobile number" };

    if (validEmail(raw)) {
      return { ok: true, type: "email", value: raw.toLowerCase() };
    }

    const digits = normalizeMobileDigits(raw);
    if (/^[6-9]\d{9}$/.test(digits)) {
      return { ok: true, type: "mobile", value: digits };
    }

    return { ok: false, message: "Enter a valid email or 10-digit mobile number" };
  }

  function sendLoginOtp() {
    setSubmitted(true);
    const parsed = getOtpIdentifier(emailOrMobile);
    if (!parsed.ok) {
      alert(parsed.message);
      return;
    }

    setOtpLoading(true);
    setLoginMethod(parsed.type === "mobile" ? "sms" : "email");
    const payload = { role: currentRole, acceptTerms: true };
    if (parsed.type === "mobile") {
      payload.mobile = parsed.value;
      setMobile(parsed.value);
    } else {
      payload.email = parsed.value;
      setEmail(parsed.value);
    }
    api.post("/auth/login", payload)
      .then((res) => {
        if (res.data?.success) {
          setPendingLoginMethod(parsed.type);
          setStep("OTP");
          setResendTimer(60);
          setOtp("");
          alert(parsed.type === "mobile" ? "OTP sent to your mobile number" : "OTP sent to your email");
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
          navigate(buildSellerRegisterRedirect());
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
      registeredBusinessName: profile.registeredBusinessName,
      registrationDetails: profile.registrationDetails,
      businessAddress: profile.businessAddress,
      ownerName: profile.ownerName,
      managerName: profile.managerName,
      website: profile.website,
      taxId: profile.taxId,
      city: profile.city || cityValue
    });
    return profile;
  }

  async function persistBuyerDefaultCity(cityValue) {
    const normalizedCity = String(cityValue || "").trim();
    if (!normalizedCity) return "";

    try {
      const res = await api.post("/buyer/profile", {
        city: normalizedCity,
        buyerSettings: {
          defaultCity: normalizedCity
        }
      });
      return String(res?.data?.city || normalizedCity).trim();
    } catch {
      try {
        await api.post("/buyer/profile", { city: normalizedCity });
      } catch {}
      return normalizedCity;
    }
  }

  async function completePendingBuyerRequirementLogin({ user, token, profile, loginCity }) {
    const pendingRequirementData = sessionStorage.getItem("pending_requirement_data");
    if (!pendingRequirementData || isSeller) return false;

    try {
      const reqData = JSON.parse(pendingRequirementData);
      const requirementCity = String(reqData?.city || loginCity || "").trim();
      const sessionCity = requirementCity || String(loginCity || user?.city || "").trim();

      setSession({
        _id: user._id,
        role: user.role || currentRole,
        roles: user.roles,
        email: user.email || email,
        city: sessionCity,
        name: buildDisplayName(user, currentRole, profile),
        preferredCurrency: user.preferredCurrency || "INR",
        mobile: user.mobile || mobile || "",
        token
      });

      if (requirementCity) {
        await persistBuyerDefaultCity(requirementCity);
      }

      const reqPayload = {
        mobile: reqData.mobile,
        city: requirementCity || reqData.city,
        category: reqData.category,
        productName: reqData.productName,
        product: reqData.product,
        quantity: reqData.quantity,
        type: reqData.unit,
        details: reqData.details,
        offerInvitedFrom: reqData.offerInvitedFrom || "city",
        ref: reqData.ref
      };

      const reqRes = await api.post("/buyer/requirement", reqPayload);
      sessionStorage.removeItem("pending_requirement_data");

      if (reqRes.data?._id) {
        setBuyerDashboardDefaultTab(requirementCity || sessionCity);
        forceBuyerPostsTab();
        navigate(`/buyer/dashboard?tab=posts&highlight=${reqRes.data._id}`, { replace: true });
        return true;
      }
    } catch (err) {
      console.error("[Login] Failed to post pending requirement:", err);
      sessionStorage.removeItem("pending_requirement_data");
    }

    setBuyerDashboardDefaultTab(loginCity || user?.city || "");
    forceBuyerPostsTab();
    navigate("/buyer/dashboard?tab=posts", { replace: true });
    return true;
  }

  function buildDisplayName(user, roleValue, profile) {
    if (roleValue === "seller") {
      return (
        profile?.registeredBusinessName || user?.name || "Seller"
      );
    }
    return user?.name || "Buyer";
  }

  function setOtpBoxRef(index) {
    return (node) => {
      otpInputRefs.current[index] = node;
    };
  }

  function focusOtpBox(index) {
    window.setTimeout(() => {
      otpInputRefs.current[index]?.focus?.();
      otpInputRefs.current[index]?.select?.();
    }, 0);
  }

  function normalizeOtpDigits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  function handleOtpChange(index, value) {
    const digit = String(value || "").replace(/\D/g, "").slice(-1);
    const digits = Array.from({ length: 6 }, (_, i) => otp[i] || "");
    digits[index] = digit;
    const next = digits.join("").slice(0, 6);
    setOtp(next);
    if (digit && index < 5) {
      focusOtpBox(index + 1);
    }
  }

  function handleOtpKeyDown(index, event) {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      focusOtpBox(index - 1);
    }
    if (event.key === "ArrowLeft" && index > 0) {
      focusOtpBox(index - 1);
    }
    if (event.key === "ArrowRight" && index < 5) {
      focusOtpBox(index + 1);
    }
  }

  function handleOtpPaste(event) {
    const pasted = normalizeOtpDigits(event.clipboardData?.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    setOtp(pasted);
    if (pasted.length >= 6) {
      focusOtpBox(5);
      return;
    }
    focusOtpBox(pasted.length);
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
    const otpLength = String(otp).trim().length;
    if (otpLength !== 6) {
      alert("Please enter a valid 6-digit OTP");
      return;
    }

    setOtpLoading(true);
    const payload = {
      otp,
      role: currentRole,
      city,
      acceptTerms: acceptedTerms
    };
    const endpoint = "/auth/verify-otp";
    if (pendingLoginMethod === "mobile" || loginMethod === "sms") {
      payload.mobile = mobile;
    } else {
      payload.email = email;
    }
    api
      .post(endpoint, payload)
      .then(async (res) => {
        const user = res.data.user || {};
        const profile = isSeller ? await applySellerProfile(city) : null;
        const sellerIntent =
          localStorage.getItem("login_intent_role") === "seller";

        if (await completePendingBuyerRequirementLogin({
          user,
          token: res.data.token,
          profile,
          loginCity: city
        })) {
          return;
        }

        if (isSeller && isSellerWhatsAppFlow) {
          if (!hasCompleteSellerProfile(user) && !profile?.registeredBusinessName) {
            setSession({
              _id: user._id,
              role: user.role || currentRole,
              roles: user.roles,
              email: user.email || email,
              city: cityFromUrl || user.city || city || "",
              name: buildDisplayName(user, currentRole, profile),
              preferredCurrency: user.preferredCurrency || "INR",
              mobile: user.mobile || mobile || "",
              sellerProfile: user.sellerProfile || profile || {},
              token: res.data.token
            });
            localStorage.setItem("seller_email", user.email || email || "");
            if (acceptedTerms) {
              localStorage.setItem("terms_accepted_at", new Date().toISOString());
            }
            setPendingCitySession({
              _id: user._id,
              role: user.role || currentRole,
              roles: user.roles,
              email: user.email || email,
              city: user.city || city || cityFromUrl || "",
              name: buildDisplayName(user, currentRole, profile),
              preferredCurrency: user.preferredCurrency || "INR",
              mobile: user.mobile || mobile || "",
              sellerProfile: user.sellerProfile || profile || {},
              token: res.data.token
            });
            navigate(buildSellerRegisterRedirect(), { replace: true });
            return;
          }

          setSession({
            _id: user._id,
            role: user.role || currentRole,
            roles: user.roles,
            email: user.email || email,
            city: cityFromUrl || user.city || city,
            name: buildDisplayName(user, currentRole, profile),
            preferredCurrency: user.preferredCurrency || "INR",
            mobile: user.mobile || mobile || "",
            sellerProfile: user.sellerProfile || profile || {},
            token: res.data.token
          });
          localStorage.setItem("seller_email", user.email || email || "");
          if (acceptedTerms) {
            localStorage.setItem("terms_accepted_at", new Date().toISOString());
          }
          localStorage.removeItem("login_intent_role");
          forceBuyerPostsTab();
          navigate(buildSellerDashboardRedirect(cityFromUrl || user.city || city), {
            replace: true
          });
          return;
        }
        
        if (pendingLoginMethod === "email" || pendingLoginMethod === "mobile") {
          setPendingCitySession({
            _id: user._id,
            role: user.role || currentRole,
            roles: user.roles,
            email: user.email || (pendingLoginMethod === "email" ? email : ""),
            city: user.city || "",
            name: buildDisplayName(user, currentRole, profile),
            preferredCurrency: user.preferredCurrency || "INR",
            mobile: user.mobile || mobile || "",
            token: res.data.token
          });
          setShowCityModal(true);
          setOtpLoading(false);
          return;
        }

        // For other flows, proceed with session setup
        setSession({
          _id: user._id,
          role: user.role || currentRole,
          roles: user.roles,
          email: user.email || email,
          city: user.city || city,
          name: buildDisplayName(user, currentRole, profile),
          preferredCurrency: user.preferredCurrency || "INR",
          mobile: user.mobile || mobile || "",
          sellerProfile: user.sellerProfile || profile || {},
          token: res.data.token
        });

        localStorage.setItem("seller_email", user.email || email || "");

        const shouldResumeSellerFlow = isSeller && useSellerPostLoginRedirect;
        if (!(currentRole === "buyer" && sellerIntent) && !shouldResumeSellerFlow) {
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

        if (shouldResumeSellerFlow) {
          if (!hasCompleteSellerProfile(user) && !profile?.registeredBusinessName) {
            navigate(buildSellerRegisterRedirect(), { replace: true });
            return;
          }
          navigate(buildSellerResumeRedirect(), { replace: true });
          return;
        }

        setBuyerDashboardDefaultTab(city);
        const dashboardParams = new URLSearchParams();
        if (city) dashboardParams.set("city", city);
        if (isSeller) dashboardParams.set("from", "seller-login");
        if (!isSeller) dashboardParams.set("tab", "posts");
        const targetDashboard = isSeller ? "/seller/dashboard" : "/buyer/dashboard";
        navigate(`${targetDashboard}?${dashboardParams.toString()}`, { replace: true });
      })
      .catch((err) => {
        const message =
          err?.response?.data?.message ||
          "Invalid OTP. Please try again.";
        if (isSeller && (message === "Complete seller registration before login" || message === "Complete seller registration before Google login")) {
          alert(message);
          navigate(buildSellerRegisterRedirect(), { replace: true });
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
        acceptTerms: true
      })
      .then(async (res) => {
        const user = res.data.user || {};
        
        // Show city modal before continuing
        if (currentRole === "buyer" && await completePendingBuyerRequirementLogin({
          user,
          token: res.data.token,
          profile: null,
          loginCity: ""
        })) {
          return;
        }
        if (isSeller && isSellerWhatsAppFlow) {
          const sellerProfile = user.sellerProfile || {};
          if (!hasCompleteSellerProfile(user) && !sellerProfile.registeredBusinessName) {
            setSession({
              _id: user._id,
              role: currentRole,
              roles: user.roles,
              email: user.email,
              city: cityFromUrl || "",
              name: user.name || "Seller",
              picture: user.picture,
              preferredCurrency: user.preferredCurrency || "INR",
              sellerProfile,
              token: res.data.token
            });
            localStorage.setItem("seller_email", user.email || "");
            setPendingCitySession({
              _id: user._id,
              role: currentRole,
              roles: user.roles,
              email: user.email,
              city: cityFromUrl || "",
              name: user.name || "Seller",
              picture: user.picture,
              preferredCurrency: user.preferredCurrency || "INR",
              sellerProfile,
              token: res.data.token
            });
            navigate(buildSellerRegisterRedirect(), { replace: true });
            return;
          }
          setSession({
            _id: user._id,
            role: user.role || currentRole,
            roles: user.roles,
            email: user.email,
            city: cityFromUrl || user.city || "",
            name: user.name || "Seller",
            picture: user.picture,
            preferredCurrency: user.preferredCurrency || "INR",
            sellerProfile,
            token: res.data.token
          });
          localStorage.setItem("seller_email", user.email || "");
          forceBuyerPostsTab();
          navigate(buildSellerDashboardRedirect(cityFromUrl || user.city || ""), {
            replace: true
          });
          return;
        }
        setPendingCitySession({
          _id: user._id,
          role: currentRole,
          roles: user.roles,
          email: user.email,
          city: "",
          name: user.name || "Buyer",
          picture: user.picture,
          preferredCurrency: user.preferredCurrency || "INR",
          sellerProfile: user.sellerProfile || {},
          token: res.data.token
        });
        setShowCityModal(true);
      })
      .catch((err) => {
        const message = err?.response?.data?.message || "Login failed";
        if (isSeller && (message === "Complete seller registration before Google login" || message === "Complete seller registration before login")) {
          alert(message);
          navigate(buildSellerRegisterRedirect(), { replace: true });
          return;
        }
        alert(message);
      })
      .finally(() => setGoogleLoading(false));
  }

  const otpDigits = Array.from({ length: 6 }, (_, index) => otp[index] || "");

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
                    : "Sign in with email or mobile number and verify instantly with OTP."}
            </p>
            <div className="mt-8 hidden lg:block">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 px-4 py-2 text-slate-500 text-sm">
                Verified sellers * Live offers * OTP Login
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

              {step === "EMAIL_LOGIN" && (
                <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Email or Mobile Number
                </label>
                <input
                  type="text"
                  value={emailOrMobile}
                  onChange={(e) => setEmailOrMobile(e.target.value)}
                  placeholder="you@example.com or 9876543210"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />

                <button
                  onClick={() => {
                    setLoginMethod("email");
                    sendLoginOtp();
                  }}
                  disabled={otpLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {otpLoading ? "Sending OTP..." : "Send OTP"}
                </button>

                <div className="flex items-center gap-3 my-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold text-slate-400">OR</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <GoogleLoginButton
                  disabled={googleLoading}
                  autoSelect={true}
                  onPreClick={() => {
                    setAcceptedTerms(true);
                    return true;
                  }}
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
              </>
              )}
              {step === "OTP" && (
                <>
                  <button
                    onClick={() => {
                      setStep("EMAIL_LOGIN");
                      setOtp("");
                      setResendTimer(0);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 mb-4"
                  >
                    {"<- Back"}
                  </button>

                  <div className="text-center mb-4 p-3 bg-green-50 rounded-xl">
                    <p className="text-sm text-gray-600">OTP sent via {loginMethod === "sms" ? "SMS" : "email"} to:</p>
                    <p className="font-semibold text-gray-800">
                      {loginMethod === "sms" ? mobile : email}
                    </p>
                  </div>

                  <input
                    ref={otpAutoFillRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(normalizeOtpDigits(e.target.value))}
                    className="sr-only absolute opacity-0 pointer-events-none"
                    tabIndex={-1}
                    aria-hidden="true"
                    autoFocus={isNativeAppRuntime()}
                  />

                  <label className="block text-sm font-medium mb-3 text-gray-700 text-center">
                    Enter 6-digit OTP
                  </label>
                  <div
                    className="grid grid-cols-6 gap-2 mb-4"
                    onPaste={handleOtpPaste}
                  >
                    {otpDigits.map((digit, index) => (
                      <input
                        key={`otp-${index}`}
                        ref={setOtpBoxRef(index)}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="h-12 rounded-xl border border-gray-300 text-center text-xl font-semibold tracking-widest focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        maxLength={1}
                      />
                    ))}
                  </div>

                  <button
                    onClick={verifyOtp}
                    disabled={otpLoading || otp.length !== 6}
                    className="w-full py-3 rounded-xl btn-brand font-semibold"
                  >
                    {otpLoading ? "Verifying..." : "Verify & Login"}
                  </button>

                  <div className="mt-4 text-center">
                    {resendTimer > 0 ? (
                      <p className="text-gray-500 text-sm">Resend OTP in {resendTimer}s</p>
                    ) : (
                      <button
                        onClick={sendLoginOtp}
                        disabled={otpLoading}
                        className="text-amber-700 text-sm font-medium hover:underline disabled:opacity-50"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                </>
              )}
              <div className="mt-5 text-center text-sm text-gray-600">
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

      {showCityModal && pendingCitySession && cities.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 mx-4">
            <h2 className="text-xl font-bold mb-4">Select Your City</h2>
            <p className="text-gray-600 mb-4">Please select your city to continue</p>
            {cities.length === 0 ? (
              <p className="text-red-500">Loading cities...</p>
            ) : (
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
            )}
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
                
                // Save to localStorage first
                setSession(finalSession);
                
                const isSellerRole = pendingCitySession?.role === "seller";
                
                // Update the shared user city first so profile settings pick it up as the default.
                console.log("Updating city to:", city);
                try {
                  const endpoint = isSellerRole ? "/seller/profile/city" : "/buyer/profile/city";
                  const res = isSellerRole
                    ? await api.post(endpoint, { city })
                    : await api.post("/buyer/profile", {
                        city,
                        buyerSettings: {
                          defaultCity: city
                        }
                      });
                  console.log("Profile update response:", res.data);
                  if (res?.data?.city) {
                    setSession({
                      ...finalSession,
                      city: res.data.city
                    });
                  }
                } catch (e) {
                  if (!isSellerRole) {
                    try {
                      await api.post("/buyer/profile", {
                        city,
                        buyerSettings: {
                          defaultCity: city
                        }
                      });
                    } catch {}
                  } else {
                    try {
                      await api.post("/seller/profile", { city });
                    } catch {}
                  }
                  console.warn("Profile update error:", e.response?.data || e.message);
                }
                
                // Check if user has pending requirement - skip city modal
                const pendingRequirementData = sessionStorage.getItem("pending_requirement_data");
                
                if (pendingRequirementData && !isSellerRole) {
                  try {
                    const reqData = JSON.parse(pendingRequirementData);
                    const reqPayload = {
                      mobile: reqData.mobile,
                      city: reqData.city,
                      category: reqData.category,
                      productName: reqData.productName,
                      product: reqData.product,
                      quantity: reqData.quantity,
                      type: reqData.unit,
                      details: reqData.details,
                      offerInvitedFrom: reqData.offerInvitedFrom || "city",
                      ref: reqData.ref
                    };
                    
                    const reqRes = await api.post("/buyer/requirement", reqPayload);
                    if (reqRes.data?._id) {
                      // Update user profile with city from requirement
                      try {
                        await api.post("/buyer/profile", {
                          city: reqData.city,
                          buyerSettings: { defaultCity: reqData.city }
                        });
                      } catch {}
                      
                      sessionStorage.removeItem("pending_requirement_data");
                      setBuyerDashboardDefaultTab(reqData.city || city);
                      navigate(`/buyer/dashboard?tab=posts&highlight=${reqRes.data._id}`, { replace: true });
                      return;
                    }
                  } catch (e) {
                    console.error("[Login] Failed to post pending requirement:", e);
                    sessionStorage.removeItem("pending_requirement_data");
                  }
                }

                const sellerProfileComplete = Boolean(
                  pendingCitySession?.sellerProfile?.registeredBusinessName &&
                  pendingCitySession?.sellerProfile?.managerName
                );
                const shouldResumeSellerFlow =
                  isSellerRole && useSellerPostLoginRedirect;
                if (shouldResumeSellerFlow) {
                  if (!sellerProfileComplete) {
                    navigate(buildSellerRegisterRedirect(), { replace: true });
                    return;
                  }
                  navigate(buildSellerResumeRedirect(), { replace: true });
                  return;
                }
                
                // If no cities loaded yet, wait
                if (cities.length === 0) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                const dashboardParams = new URLSearchParams();
                if (city) dashboardParams.set("city", city);
                if (isSellerRole) dashboardParams.set("from", "seller-login");
                if (!isSellerRole) dashboardParams.set("tab", "posts");
                
                // Redirect to dashboard
                const targetDashboard = isSellerRole ? "/seller/dashboard" : "/buyer/dashboard";
                if (!isSellerRole) {
                  setBuyerDashboardDefaultTab(city);
                }
                navigate(`${targetDashboard}?${dashboardParams.toString()}`, { replace: true });
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

