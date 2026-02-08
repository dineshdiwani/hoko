import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SellerRegister() {
  const navigate = useNavigate();

  const [seller, setSeller] = useState({
    firmName: "",
    managerName: "",
    mobile: "",
    city: "",
    categories: [],
  });

  const cities = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad"];

  const categories = [
    "Electronics",
    "Grocery",
    "Services",
    "Construction",
    "Hardware",
  ];

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    setSeller((prev) => ({
      ...prev,
      categories: prev.categories.includes(value)
        ? prev.categories.filter((c) => c !== value)
        : [...prev.categories, value],
    }));
  };

  const handleSubmit = () => {
    if (!seller.firmName || !seller.mobile || !seller.city) {
      alert("Please fill all required fields");
      return;
    }

    localStorage.setItem("seller_profile", JSON.stringify(seller));
    alert("Seller registered successfully!");
    navigate("/seller/dashboard");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6">
          Register as Seller
        </h1>

        <input
          className="w-full border p-2 rounded mb-3"
          placeholder="Firm Name *"
          value={seller.firmName}
          onChange={(e) =>
            setSeller({ ...seller, firmName: e.target.value })
          }
        />

        <input
          className="w-full border p-2 rounded mb-3"
          placeholder="Manager Name"
          value={seller.managerName}
          onChange={(e) =>
            setSeller({ ...seller, managerName: e.target.value })
          }
        />

        <input
          className="w-full border p-2 rounded mb-3"
          placeholder="Mobile Number *"
          value={seller.mobile}
          onChange={(e) =>
            setSeller({ ...seller, mobile: e.target.value })
          }
        />

        {/* City Dropdown */}
        <select
          className="w-full border p-2 rounded mb-4"
          value={seller.city}
          onChange={(e) =>
            setSeller({ ...seller, city: e.target.value })
          }
        >
          <option value="">Select City *</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        {/* Category Dropdown (multi-select style) */}
        <label className="block font-medium mb-2">
          Categories you deal in
        </label>

        <select
          className="w-full border p-2 rounded mb-4"
          onChange={handleCategoryChange}
        >
          <option value="">Select category</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {/* Selected Categories */}
        <div className="flex flex-wrap gap-2 mb-6">
          {seller.categories.map((cat) => (
            <span
              key={cat}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm"
            >
              {cat}
            </span>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Register Seller
        </button>
      </div>
    </div>
  );
}
