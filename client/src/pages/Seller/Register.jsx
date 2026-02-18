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
  const hasSessionCity = Boolean(sessionCity);

  const [seller, setSeller] = useState({
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
  const postLoginRedirect =
    localStorage.getItem("post_login_redirect") || "/seller/dashboard";

  const [cities, setCities] = useState([
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Chennai",
    "Hyderabad",
    "Pune"
  ]);

  const [categories, setCategories] = useState([
    "Electronics",
    "Grocery",
    "Services",
    "Construction",
    "Hardware"
  ]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
        }
        if (Array.isArray(data.categories) && data.categories.length) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, [hasSessionCity]);

  useEffect(() => {
    if (!hasSessionCity) return;
    setSeller((prev) => ({
      ...prev,
      city: prev.city || sessionCity
    }));
  }, [hasSessionCity, sessionCity]);

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
      !seller.businessName ||
      !seller.businessAddress ||
      !seller.ownerName ||
      !seller.taxId ||
      !(seller.city || sessionCity)
    ) {
      alert("Please fill all required fields");
      return;
    }
    if (!session?.token) {
      if (!/\S+@\S+\.\S+/.test(String(seller.email || ""))) {
        alert("Please enter a valid email");
        return;
      }
    }

    const profile = seller;
    if (!session?.token) {
      navigate("/buyer/login");
      return;
    }

    api
      .post("/seller/onboard", {
        ...profile,
        city: profile.city || sessionCity
      })
      .then(async (res) => {
        setSellerDashboardCategories(profile.categories || []);
        const switchRes = await api.post("/auth/switch-role", {
          role: "seller"
        });
        setSession({
          _id: switchRes.data.user._id,
          role: switchRes.data.user.role,
          roles: switchRes.data.user.roles,
          email: switchRes.data.user.email,
          city: switchRes.data.user.city,
          name:
            res.data?.sellerProfile?.businessName ||
            res.data?.sellerProfile?.firmName ||
            "Seller",
          preferredCurrency:
            switchRes.data.user.preferredCurrency || "INR",
          token: switchRes.data.token
        });
        alert("Seller registered successfully!");
        localStorage.removeItem("login_intent_role");
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
                placeholder="Registered Business Name *"
                value={seller.businessName}
                onChange={(e) =>
                  setSeller({ ...seller, businessName: e.target.value })
                }
                required
              />

              {/* Category Dropdown with checkbox list */}
              <div className="md:col-span-2">
                <label className="block font-medium mb-2">
                  Categories you deal in
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCategoryMenu((v) => !v)}
                    className="w-full border p-2 rounded text-left pr-10 relative"
                  >
                    {seller.categories.length
                      ? seller.categories.join(", ")
                      : "Select categories"}
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
                placeholder="Business Address *"
                value={seller.businessAddress}
                onChange={(e) =>
                  setSeller({ ...seller, businessAddress: e.target.value })
                }
                required
              />

              {!hasSessionCity ? (
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
              ) : (
                <input
                  className="w-full border p-2 rounded bg-gray-50 text-gray-600"
                  value={sessionCity}
                  disabled
                  readOnly
                />
              )}

              <input
                className="w-full border p-2 rounded"
                placeholder="Manager/Owner Name *"
                value={seller.ownerName}
                onChange={(e) =>
                  setSeller({ ...seller, ownerName: e.target.value })
                }
                required
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
                placeholder="Tax Identification Number *"
                value={seller.taxId}
                onChange={(e) =>
                  setSeller({ ...seller, taxId: e.target.value })
                }
                required
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

