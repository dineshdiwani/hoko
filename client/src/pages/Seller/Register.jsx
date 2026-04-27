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

  const isSelected = (cat) => seller.categories.includes(cat);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!seller.registeredBusinessName || !seller.managerName || !seller.city) {
      alert("Please fill business name, manager name, and city");
      return;
    }
    if (seller.categories.length === 0) {
      alert("Please select at least one category");
      return;
    }

    setSubmitted(true);

    const profile = {
      registeredBusinessName: seller.registeredBusinessName,
      managerName: seller.managerName,
      registrationDetails: seller.registrationDetails,
      businessAddress: seller.businessAddress,
      ownerName: seller.ownerName,
      website: seller.website,
      taxId: seller.taxId,
      city: seller.city,
      categories: seller.categories,
      email: seller.email,
      mobile: seller.mobile,
      whatsappConsent: seller.whatsappConsent
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
      window.location.href = "/seller/dashboard";
    } catch (err) {
      alert(err?.response?.data?.message || "Registration failed. Try again.");
      setSubmitted(false);
    }
  };

  return (
    <div className="page">
      <div className="page-shell pt-24 md:pt-12">
        <div className="max-w-2xl mx-auto">
          <h1 className="page-hero">Seller Registration</h1>
          <form onSubmit={handleSubmit} className="ui-card mt-6 space-y-4">
            <div>
              <label className="ui-label">Business Name *</label>
              <input
                className="ui-input"
                value={seller.registeredBusinessName}
                onChange={(e) => setSeller({ ...seller, registeredBusinessName: e.target.value })}
                placeholder="ABC Traders Pvt Ltd"
                required
              />
            </div>

            <div>
              <label className="ui-label">Manager/Contact Name *</label>
              <input
                className="ui-input"
                value={seller.managerName}
                onChange={(e) => setSeller({ ...seller, managerName: e.target.value })}
                placeholder="Rajesh Kumar"
                required
              />
            </div>

            <div>
              <label className="ui-label">Mobile Number</label>
              <input
                className="ui-input"
                value={seller.mobile}
                onChange={(e) => setSeller({ ...seller, mobile: e.target.value })}
                placeholder="9876543210"
              />
            </div>

            <div>
              <label className="ui-label">Email</label>
              <input
                className="ui-input"
                type="email"
                value={seller.email}
                onChange={(e) => setSeller({ ...seller, email: e.target.value })}
                placeholder="business@example.com"
              />
            </div>

            <div>
              <label className="ui-label">City *</label>
              <select
                className="ui-select"
                value={seller.city}
                onChange={(e) => setSeller({ ...seller, city: e.target.value })}
                required
              >
                <option value="">Select City</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">Categories *</label>
              <div className="relative">
                <button
                  type="button"
                  className="ui-select w-full text-left"
                  onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                >
                  {seller.categories.length === 0
                    ? "Select categories..."
                    : seller.categories.join(", ")}
                </button>
                {showCategoryMenu && (
                  <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-60 overflow-auto">
                    {categories.map((cat) => (
                      <label
                        key={cat}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected(cat)}
                          onChange={() => toggleCategory(cat)}
                        />
                        {cat}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="ui-label">Business Address</label>
              <textarea
                className="ui-textarea"
                value={seller.businessAddress}
                onChange={(e) => setSeller({ ...seller, businessAddress: e.target.value })}
                placeholder="123, Industrial Area, Sector 5..."
              />
            </div>

            <div>
              <label className="ui-label">Website</label>
              <input
                className="ui-input"
                value={seller.website}
                onChange={(e) => setSeller({ ...seller, website: e.target.value })}
                placeholder="www.example.com"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="whatsappConsent"
                checked={seller.whatsappConsent}
                onChange={(e) => setSeller({ ...seller, whatsappConsent: e.target.checked })}
              />
              <label htmlFor="whatsappConsent">Receive updates via WhatsApp</label>
            </div>

            <button type="submit" disabled={submitted} className="ui-btn-primary w-full">
              {submitted ? "Submitting..." : "Register"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}