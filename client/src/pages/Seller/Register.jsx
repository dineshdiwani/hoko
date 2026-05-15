import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import {
  getSession,
  setSession,
  setSellerDashboardCategories,
  getUiCitySelection,
  setUiCitySelection
} from "../../services/storage";
import { refreshSession } from "../../services/sessionRefresh";
import {
  getDeferredDeepLink,
  clearDeferredDeepLink,
  buildDeferredDeepLinkUrl
} from "../../services/deepLinks";
import { isCompleteSellerProfile } from "../../utils/sellerProfile";

export default function SellerRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceFromUrl = String(searchParams.get("from") || "").trim().toLowerCase();
  const isWhatsAppSellerRegister = sourceFromUrl === "wa";
  const normalizeMobileValue = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/\+?\d{10,15}/);
    return match ? match[0].replace(/[^\d]/g, "") : raw.replace(/[^\d]/g, "");
  };
  const mobileFromUrl = normalizeMobileValue(searchParams.get("mobile") || "");
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
  const cachedSellerProfile = (() => {
    try {
      return JSON.parse(localStorage.getItem("seller_profile") || "{}");
    } catch {
      return {};
    }
  })();
  const session = getSession();
  const sessionCity = String(session?.city || "").trim();

  const [seller, setSeller] = useState({
    email: session?.email || localStorage.getItem("seller_email") || "",
    mobile: session?.mobile || localStorage.getItem("whatsapp_mobile") || mobileFromUrl || "",
    registeredBusinessName: "",
    managerName: "",
    registrationDetails: "",
    businessAddress: "",
    ownerName: "",
    website: "",
    taxId: "",
    city:
      cityFromUrl ||
      String(cachedSellerProfile.city || "").trim() ||
      (() => {
        const sharedCity = String(getUiCitySelection(sessionCity || localStorage.getItem("whatsapp_city") || "")).trim();
        if (sharedCity && sharedCity.toLowerCase() !== "all") return sharedCity;
        return sessionCity || localStorage.getItem("whatsapp_city") || "";
      })(),
    categories: [],
    whatsappConsent: false
  });
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const resolveCityValue = (value, cityList, fallback = "") => {
    const raw = String(value || fallback || "").trim();
    if (!raw) return "";
    const matched = (Array.isArray(cityList) ? cityList : []).find(
      (cityName) => String(cityName || "").trim().toLowerCase() === raw.toLowerCase()
    );
    return matched || raw;
  };

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
          const whatsappCity = localStorage.getItem("whatsapp_city") || cityFromUrl;
          const whatsappCats = localStorage.getItem("whatsapp_categories") || catsFromUrl;
          const whatsappMobile = normalizeMobileValue(localStorage.getItem("whatsapp_mobile") || mobileFromUrl);
          setSeller((prev) => {
            let next = { ...prev };
            if (whatsappCity) {
              const cityMatch = resolveCityValue(whatsappCity, data.cities);
              next.city = cityMatch || whatsappCity;
            } else if (prev.city) {
              const cityMatch = resolveCityValue(sessionCity, data.cities);
              next.city = cityMatch || prev.city;
            }
            if (whatsappMobile && !prev.mobile) {
              next.mobile = whatsappMobile;
            }
            if (isWhatsAppSellerRegister && whatsappCats && Array.isArray(data.categories)) {
              const catArray = whatsappCats.includes(",") ? whatsappCats.split(",") : [whatsappCats];
              const selectedCats = catArray.filter(c => data.categories.includes(c));
              if (selectedCats.length > 0) {
                next.categories = selectedCats;
              }
            }
            return next;
          });
        }
        if (Array.isArray(data.categories) && data.categories.length) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, [sessionCity, cityFromUrl, catsFromUrl, mobileFromUrl, isWhatsAppSellerRegister]);

  useEffect(() => {
    const currentSession = getSession();
    if (currentSession?.token && isCompleteSellerProfile(currentSession)) {
      const params = new URLSearchParams();
      const sellerCity = String(currentSession.city || seller.city || cityFromUrl || "").trim();
      const sellerCats = Array.isArray(currentSession?.sellerProfile?.categories)
        ? currentSession.sellerProfile.categories.join(",")
        : "";
      if (sellerCity) params.set("city", sellerCity);
      if (sellerCats) params.set("cats", sellerCats);
      params.set("from", "seller-login");
      navigate(`/seller/dashboard${params.toString() ? `?${params.toString()}` : ""}`, {
        replace: true
      });
    }
  }, [navigate, cityFromUrl, seller.city]);

  useEffect(() => {
    const savedEmail = localStorage.getItem("seller_email");
    const savedMobile = normalizeMobileValue(localStorage.getItem("whatsapp_mobile"));
    const savedCity = localStorage.getItem("whatsapp_city");
    const savedCats = localStorage.getItem("whatsapp_categories");
    
    setSeller((prev) => {
      const next = { ...prev };
      
      if (session?.email && !next.email) {
        next.email = session.email;
      } else if (savedEmail && !next.email) {
        next.email = savedEmail;
      }
      
      if (session?.mobile && !next.mobile) {
        next.mobile = normalizeMobileValue(session.mobile);
      } else if (savedMobile && !next.mobile) {
        next.mobile = savedMobile;
      }
      
      if (!next.city) {
        if (savedCity) {
          const cityMatch = resolveCityValue(savedCity, cities);
          next.city = cityMatch || savedCity;
        } else if (sessionCity) {
          const cityMatch = resolveCityValue(sessionCity, cities);
          next.city = cityMatch || sessionCity;
        }
      }
      
      if (!next.categories.length && savedCats) {
        const catArray = savedCats.includes(",") ? savedCats.split(",") : [savedCats];
        const validCats = catArray.filter(c => categories.includes(c.trim()));
        if (validCats.length > 0) {
          next.categories = validCats;
        }
      }
      
      return next;
    });
  }, [cities, categories, session, sessionCity]);

  const toggleCategory = (cat) => {
    setSeller((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setIsSubmitting(false);

    const email = String(seller.email || "").trim();
    const mobile = String(seller.mobile || "").trim();
    const registeredBusinessName = String(seller.registeredBusinessName || "").trim();
    const managerName = String(seller.managerName || "").trim();
    const city = String(seller.city || "").trim();
    const categories = seller.categories || [];
    const whatsappConsent = seller.whatsappConsent || false;

    if (!email || !mobile || !registeredBusinessName || !managerName || !city) {
      alert("Please fill all required fields");
      return;
    }
    if (categories.length === 0) {
      alert("Please select at least one category");
      return;
    }
    if (!whatsappConsent) {
      alert("Please accept WhatsApp notifications to receive updates");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert("Please enter a valid email");
      return;
    }

    const profile = {
      registeredBusinessName,
      managerName,
      registrationDetails: seller.registrationDetails,
      businessAddress: seller.businessAddress,
      ownerName: seller.ownerName,
      website: seller.website,
      taxId: seller.taxId,
      city,
      categories,
      email,
      mobile,
      whatsappConsent
    };

    try {
      setIsSubmitting(true);
      let activeSession = session;
      if (!activeSession?.token) {
        const refreshed = await refreshSession().catch(() => null);
        if (refreshed?.user && refreshed?.token) {
          activeSession = {
            ...activeSession,
            ...refreshed.user,
            token: refreshed.token
          };
          setSession(activeSession);
        }
      }
      if (!activeSession?.token) {
        alert("Session expired. Please log in again.");
        return;
      }
      const res = await api.post("/seller/onboard", profile);
      setSellerDashboardCategories(profile.categories || []);
      const updatedSession = {
        ...(activeSession || session || {}),
        role: "seller",
        city: res.data.city,
        name: res.data.sellerProfile?.registeredBusinessName || "Seller",
        mobile,
        email,
        sellerProfile: {
          ...(session?.sellerProfile || {}),
          ...(res.data.sellerProfile || {}),
          registeredBusinessName,
          managerName
        },
        roles: { ...(session?.roles || {}), seller: true }
      };
      setSession(updatedSession);
      try {
        localStorage.setItem(
          "seller_profile",
          JSON.stringify({
            ...(res.data.sellerProfile || {}),
            registeredBusinessName,
            managerName,
            city,
            email,
            mobile,
            categories,
            registrationDetails: seller.registrationDetails || "",
            businessAddress: seller.businessAddress || "",
            ownerName: seller.ownerName || "",
            website: seller.website || "",
            taxId: seller.taxId || ""
          })
        );
      } catch {}
      setUiCitySelection(res.data.city || city);
      alert("Registration submitted successfully!");
      const deferredDeepLink = getDeferredDeepLink();
      const redirectSource = String(localStorage.getItem("post_login_redirect_source") || "").trim();
      const resumeTarget =
        String(localStorage.getItem("post_login_redirect") || "").trim() ||
        (deferredDeepLink ? buildDeferredDeepLinkUrl(deferredDeepLink) : "");
      localStorage.removeItem("post_login_redirect_source");
      localStorage.removeItem("login_intent_role");
      if (resumeTarget) {
        localStorage.removeItem("post_login_redirect");
        clearDeferredDeepLink();
        try {
          const url = new URL(resumeTarget, window.location.origin);
          if (redirectSource === "offer") {
            url.searchParams.set("autoSubmit", "true");
          }
          url.searchParams.set("city", res.data.city || city);
          url.searchParams.set("cats", "all");
          window.location.href = `${url.pathname}${url.search}`;
        } catch {
          window.location.href = resumeTarget;
        }
        return;
      }
      localStorage.removeItem("post_login_redirect");
      clearDeferredDeepLink();
      const dashboardParams = new URLSearchParams();
      if (seller.city) dashboardParams.set("city", seller.city);
      dashboardParams.set("cats", "all");
      if (cityFromUrl && !seller.city) dashboardParams.set("city", cityFromUrl);
      dashboardParams.set("from", "seller-login");
      window.location.href = `/seller/dashboard${
        dashboardParams.toString() ? `?${dashboardParams.toString()}` : ""
      }`;
    } catch (err) {
      alert(err?.response?.data?.message || "Registration failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-shell max-w-[1320px]">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] items-start">
          <div className="mt-6">
            <h1 className="page-hero mb-4">Register as Seller</h1>
            <p className="page-subtitle leading-relaxed">
              Create your seller profile to receive verified buyer requirements and participate in reverse auctions.
            </p>
            <div className="mt-8 hidden lg:block">
              <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 px-4 py-2 text-yellow-300 text-sm">
                Verified leads * Smart matching * Fast payouts
              </div>
            </div>
          </div>

          <div className={`bg-white p-6 rounded-2xl shadow-xl ${submitted ? "form-submitted" : ""}`}>
            <h2 className="text-xl font-bold mb-6">Seller Details</h2>

            <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
              <input
                className={`w-full border p-2 rounded ${submitted && !seller.email ? "border-red-500" : ""}`}
                type="email"
                placeholder="Email *"
                value={seller.email}
                onChange={(e) => setSeller({ ...seller, email: e.target.value })}
                required
              />

              <input
                className={`w-full border p-2 rounded ${submitted && !seller.mobile ? "border-red-500" : ""}`}
                type="tel"
                placeholder="Mobile Number *"
                value={seller.mobile}
                onChange={(e) => setSeller({ ...seller, mobile: e.target.value })}
                required
              />

              <input
                className={`w-full border p-2 rounded ${submitted && !seller.registeredBusinessName ? "border-red-500" : ""}`}
                placeholder="Registered Business Name *"
                value={seller.registeredBusinessName}
                onChange={(e) => setSeller({ ...seller, registeredBusinessName: e.target.value })}
                required
              />

              <div className="md:col-span-2">
                <label
                  className={`block font-medium mb-2 ${
                    submitted && (!seller.categories || seller.categories.length === 0)
                      ? "text-red-600"
                      : ""
                  }`}
                >
                  Categories you deal in *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCategoryMenu((v) => !v)}
                    className={`w-full border p-2 rounded text-left pr-10 relative ${
                      submitted && (!seller.categories || seller.categories.length === 0)
                        ? "border-red-500"
                        : ""
                    }`}
                  >
                    {seller.categories.length
                      ? seller.categories.join(", ")
                      : "Select categories *"}
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      v
                    </span>
                  </button>
                  {showCategoryMenu && (
                    <div className="absolute z-10 mt-2 w-full bg-white border rounded-xl shadow-lg max-h-56 overflow-auto">
                      {categories.map((cat) => (
                        <label
                          key={cat}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={seller.categories.includes(cat)}
                            onChange={() => toggleCategory(cat)}
                          />
                          <span>{cat}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <input
                className="w-full border p-2 rounded"
                placeholder="Business Registration Details"
                value={seller.registrationDetails}
                onChange={(e) =>
                  setSeller({
                    ...seller,
                    registrationDetails: e.target.value
                  })
                }
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Business Address"
                value={seller.businessAddress}
                onChange={(e) =>
                  setSeller({ ...seller, businessAddress: e.target.value })
                }
              />

              <select
                className={`w-full border p-2 rounded ${submitted && !seller.city ? "border-red-500" : ""}`}
                value={seller.city}
                onChange={(e) => {
                  const nextCity = e.target.value;
                  setSeller({ ...seller, city: nextCity });
                  setUiCitySelection(nextCity);
                }}
                required
              >
                <option value="">Select City *</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              <input
                className={`w-full border p-2 rounded ${submitted && !seller.managerName ? "border-red-500" : ""}`}
                placeholder="Manager Name *"
                value={seller.managerName}
                onChange={(e) => setSeller({ ...seller, managerName: e.target.value })}
                required
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Website"
                value={seller.website}
                onChange={(e) => setSeller({ ...seller, website: e.target.value })}
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Tax Identification Number"
                value={seller.taxId}
                onChange={(e) => setSeller({ ...seller, taxId: e.target.value })}
              />

              <div className="md:col-span-2">
                <label
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                    submitted && !seller.whatsappConsent ? "border-red-500" : "border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={seller.whatsappConsent}
                    onChange={(e) =>
                      setSeller({ ...seller, whatsappConsent: e.target.checked })
                    }
                    className="mt-1 w-5 h-5"
                    required
                  />
                  <span className="text-sm text-gray-700">
                    I agree to receive updates and notifications on <strong>WhatsApp</strong> for new buyer requirements, offers, and important updates.
                  </span>
                </label>
              </div>

              <button type="submit" disabled={isSubmitting} className="md:col-span-2 mt-3 btn-brand px-6 py-2 rounded hover:bg-blue-700">
                {isSubmitting ? "Submitting..." : "Register Seller"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
