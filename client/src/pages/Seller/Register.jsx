import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import {
  getSession,
  setSession,
  setSellerDashboardCategories
} from "../../services/storage";

export default function SellerRegister() {
  const navigate = useNavigate();
  const session = getSession();
  const sessionCity = String(session?.city || "").trim();

  const [seller, setSeller] = useState({
    email: session?.email || localStorage.getItem("seller_email") || "",
    mobile: session?.mobile || localStorage.getItem("whatsapp_mobile") || "",
    firmName: "",
    managerName: "",
    businessName: "",
    registrationDetails: "",
    businessAddress: "",
    ownerName: "",
    website: "",
    taxId: "",
    city: "",
    categories: [],
  });
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const postLoginRedirectRaw = String(
    localStorage.getItem("post_login_redirect") || ""
  ).trim();
  const postLoginRedirectSource = String(
    localStorage.getItem("post_login_redirect_source") || ""
  )
    .trim()
    .toLowerCase();
  const isDeepLinkRedirect = postLoginRedirectRaw.startsWith("/seller/deeplink/");
  const postLoginRedirect =
    postLoginRedirectRaw &&
    (postLoginRedirectSource === "deeplink" || isDeepLinkRedirect)
      ? postLoginRedirectRaw
      : "/seller/dashboard";

  const [cities, setCities] = useState([]);

  const [categories, setCategories] = useState([
    "Electronics",
    "Grocery",
    "Services",
    "Construction",
    "Hardware"
  ]);
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
          const whatsappCity = localStorage.getItem("whatsapp_city");
          const whatsappCats = localStorage.getItem("whatsapp_categories");
          const whatsappMobile = localStorage.getItem("whatsapp_mobile");
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
              const selectedCats = whatsappCats.split(",").filter(c => data.categories.includes(c));
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
  }, [sessionCity]);

  useEffect(() => {
    setSeller((prev) => ({
      ...prev,
      city: prev.city || resolveCityValue(sessionCity, cities)
    }));
  }, [cities, sessionCity]);

  const toggleCategory = (value) => {
    setSeller((prev) => ({
      ...prev,
      categories: prev.categories.includes(value)
        ? prev.categories.filter((c) => c !== value)
        : [...prev.categories, value],
    }));
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (
      !seller.email ||
      !seller.mobile ||
      !seller.firmName ||
      !seller.managerName ||
      !Array.isArray(seller.categories) ||
      seller.categories.length === 0 ||
      !seller.city
    ) {
      alert("Please fill all required fields");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(String(seller.email || ""))) {
      alert("Please enter a valid email");
      return;
    }

    const profile = seller;
    if (!session?.token) {
      navigate("/buyer/login");
      return;
    }

    api
      .post("/seller/onboard", {
        ...profile,
        city: profile.city
      })
      .then(async (res) => {
        setSellerDashboardCategories(profile.categories || []);
        const switchRes = await api.post("/auth/switch-role", {
          role: "seller"
        });
        const userEmail = switchRes.data.user.email;
        setSession({
          _id: switchRes.data.user._id,
          role: switchRes.data.user.role,
          roles: switchRes.data.user.roles,
          email: userEmail,
          city: switchRes.data.user.city,
          name:
            res.data?.sellerProfile?.businessName ||
            res.data?.sellerProfile?.firmName ||
            "Seller",
          preferredCurrency:
            switchRes.data.user.preferredCurrency || "INR",
          token: switchRes.data.token
        });
        
        localStorage.setItem("seller_email", userEmail || "");
        localStorage.removeItem("login_intent_role");
        localStorage.removeItem("post_login_redirect");
        localStorage.removeItem("post_login_redirect_source");
        navigate(postLoginRedirect);
      })
      .catch((err) => {
        alert(
          err?.response?.data?.message ||
            "Failed to register seller."
        );
      });
  };

  return (
    <div className="page">
      <div className="page-shell max-w-[1320px]">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] items-start">
          <div className="mt-6">
            <h1 className="page-hero mb-4">Register as Seller</h1>
            <p className="page-subtitle leading-relaxed">
              Create your seller profile to receive verified buyer
              requirements and participate in reverse auctions.
            </p>
            <div className="mt-8 hidden lg:block">
              <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 px-4 py-2 text-yellow-300 text-sm">
                Verified leads * Smart matching * Fast payouts
              </div>
            </div>
          </div>

          <div
            className={`bg-white p-6 rounded-2xl shadow-xl ${
              submitted ? "form-submitted" : ""
            }`}
          >
            <h2 className="text-xl font-bold mb-6">Seller Details</h2>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="w-full border p-2 rounded"
                type="email"
                placeholder="Email *"
                value={seller.email}
                onChange={(e) =>
                  setSeller({ ...seller, email: e.target.value })
                }
                required
              />

              <input
                className="w-full border p-2 rounded"
                type="tel"
                placeholder="Mobile Number *"
                value={seller.mobile}
                onChange={(e) =>
                  setSeller({ ...seller, mobile: e.target.value })
                }
                required
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Firm Name *"
                value={seller.firmName}
                onChange={(e) =>
                  setSeller({ ...seller, firmName: e.target.value })
                }
                required
              />

              {/* Category Dropdown with checkbox list */}
              <div className="md:col-span-2">
                <label className="block font-medium mb-2">
                  Categories you deal in *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCategoryMenu((v) => !v)}
                    className="w-full border p-2 rounded text-left pr-10 relative"
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
                className="w-full border p-2 rounded"
                value={seller.city}
                onChange={(e) =>
                  setSeller({ ...seller, city: e.target.value })
                }
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
                className="w-full border p-2 rounded"
                placeholder="Manager Name *"
                value={seller.managerName}
                onChange={(e) =>
                  setSeller({ ...seller, managerName: e.target.value })
                }
                required
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Registered Business Name"
                value={seller.businessName}
                onChange={(e) =>
                  setSeller({ ...seller, businessName: e.target.value })
                }
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Website"
                value={seller.website}
                onChange={(e) =>
                  setSeller({ ...seller, website: e.target.value })
                }
              />

              <input
                className="w-full border p-2 rounded"
                placeholder="Tax Identification Number"
                value={seller.taxId}
                onChange={(e) =>
                  setSeller({ ...seller, taxId: e.target.value })
                }
              />
            </div>

            <button
              onClick={handleSubmit}
              className="mt-3 btn-brand px-6 py-2 rounded hover:bg-blue-700"
            >
              Register Seller
            </button>
          </div>
        </div>
      </div>

      
    </div>
  );
}

