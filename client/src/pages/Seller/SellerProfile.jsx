import { useEffect, useState } from "react";
import api from "../../services/api";

export default function SellerProfile() {
  const [profile, setProfile] = useState({
    firmName: "",
    managerName: "",
    categories: [],
    city: ""
  });

  const userId = localStorage.getItem("userId");

  const allCategories = [
    "Electronics",
    "Grocery",
    "Services",
    "Construction",
    "Automobile",
    "Furniture"
  ];


const [rating, setRating] = useState({ avg: 0, count: 0 });

useEffect(() => {
  api.get(`/reviews/${sellerId}/average`)
    .then(res => setRating(res.data));
}, []);

<p>⭐ {rating.avg.toFixed(1)} ({rating.count})</p>

  useEffect(() => {
    api.get(`/seller/profile/${userId}`).then(res => {
      if (res.data) setProfile(res.data.sellerProfile || profile);
    });
  }, []);

  const toggleCategory = cat => {
    setProfile(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const saveProfile = async () => {
    await api.post("/seller/register", {
      userId,
      firmName: profile.firmName,
      managerName: profile.managerName,
      categories: profile.categories
    });
    alert("Seller profile saved");
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Seller Profile</h2>

      <input
        placeholder="Firm Name"
        value={profile.firmName}
        onChange={e => setProfile({ ...profile, firmName: e.target.value })}
        className="input"
      />

      <input
        placeholder="Manager Name"
        value={profile.managerName}
        onChange={e => setProfile({ ...profile, managerName: e.target.value })}
        className="input"
      />

      <h3 className="font-semibold mt-4 mb-2">Categories You Deal In</h3>

      <div className="grid grid-cols-2 gap-2">
        {allCategories.map(cat => (
          <label
            key={cat}
            className={`border p-2 rounded cursor-pointer text-sm ${
              profile.categories.includes(cat)
                ? "bg-blue-600 text-white"
                : ""
            }`}
          >
            <input
              type="checkbox"
              className="hidden"
              checked={profile.categories.includes(cat)}
              onChange={() => toggleCategory(cat)}
            />
            {cat}
          </label>
        ))}
      </div>

      <button
        onClick={saveProfile}
        className="mt-6 bg-green-600 text-white w-full py-2 rounded"
      >
        Save Profile
      </button>
    </div>
  );
}

useEffect(() => {
  api.get(`/seller/rating/${userId}`).then(res => {
    setProfile(prev => ({
      ...prev,
      avgRating: res.data.avgRating,
      totalReviews: res.data.totalReviews
    }));
  });
}, []);
