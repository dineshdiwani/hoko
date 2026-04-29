import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import {
  getSession,
  setSession,
  setSellerDashboardCategories
} from "../../services/storage";

export default function SellerRegister() {
  const [searchParams] = useSearchParams();
  const mobileFromUrl = searchParams.get("mobile") || "";
  const cityFromUrl = searchParams.get("city") || "";
  const catsFromUrl = searchParams.get("cats") || "";
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
    city: "",
    categories: [],
    whatsappConsent: false
  });
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
          const whatsappMobile = localStorage.getItem("whatsapp_mobile") || mobileFromUrl;
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
            if (whatsappCats && Array.isArray(data.categories)) {
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
  }, [sessionCity, cityFromUrl, catsFromUrl, mobileFromUrl]);

  useEffect(() => {
    const savedEmail = localStorage.getItem("seller_email");
    const savedMobile = localStorage.getItem("whatsapp_mobile");
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
        next.mobile = session.mobile;
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
      const res = await api.post("/seller/onboard", profile);
      setSellerDashboardCategories(profile.categories || []);
      setSession({
        ...session,
        city: res.data.city,
        name: res.data.sellerProfile?.registeredBusinessName || "Seller",
        sellerProfile: res.data.sellerProfile
      });
      alert("Registration submitted successfully!");
      localStorage.removeItem("post_login_redirect");
      localStorage.removeItem("post_login_redirect_source");
      const dashboardParams = new URLSearchParams();
      if (seller.city) dashboardParams.set("city", seller.city);
      if (catsFromUrl) dashboardParams.set("cats", catsFromUrl);
      if (cityFromUrl && !seller.city) dashboardParams.set("city", cityFromUrl);
      window.location.href = `/seller/dashboard${
        dashboardParams.toString() ? `?${dashboardParams.toString()}` : ""
      }`;
    } catch (err) {
      alert(err?.response?.data?.message || "Registration failed. Try again.");
      setSubmitted(false);
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
                onChange={(e) => setSeller({ ...seller, city: e.target.value })}
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

              <button type="submit" disabled={submitted} className="md:col-span-2 mt-3 btn-brand px-6 py-2 rounded hover:bg-blue-700">
                {submitted ? "Submitting..." : "Register Seller"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
