import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";

export default function OffersReceived({
  city = "",
  selectedCategory = "all",
  cities = [],
  categories = [],
  onCityChange,
  onCategoryChange
}) {
  const [posts, setPosts] = useState([]);
  const session = getSession();
  const buyerId = session?._id;
  const navigate = useNavigate();

  useEffect(() => {
    if (!buyerId) return;
    api.get(`/buyer/my-posts/${buyerId}`).then(async res => {
      const enriched = await Promise.all(
        res.data.map(async post => {
          const postId = post._id || post.id;
          if (!postId) return { ...post, offerCount: 0 };
          const offers = await api.get(`/dashboard/offers/${postId}`);
          return { ...post, offerCount: offers.data.length };
        })
      );
      setPosts(enriched);
    });
  }, [buyerId]);

  const filteredPosts = posts.filter((post) => {
    const cityMatch =
      !city ||
      String(post.city || "").trim().toLowerCase() ===
        String(city).trim().toLowerCase();
    const categoryMatch =
      !selectedCategory ||
      selectedCategory === "all" ||
      String(post.category || "").trim().toLowerCase() ===
        String(selectedCategory).trim().toLowerCase();
    return cityMatch && categoryMatch;
  });

  return (
    <div className="page">
      <div className="page-shell max-w-4xl">
        <h2 className="page-hero mb-4">Offers Received</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="ui-label text-gray-700">City</span>
        <select
          value={city}
          onChange={(e) => onCityChange?.(e.target.value)}
          className="w-full sm:w-auto max-w-full px-4 py-2.5 rounded-xl border text-sm bg-white"
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="ui-label text-gray-700 sm:ml-2">Category</span>
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange?.(e.target.value)}
          className="w-full sm:w-auto max-w-full px-4 py-2.5 rounded-xl border text-sm bg-white"
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {posts.length === 0 && (
        <p className="text-gray-500">No posts yet.</p>
      )}

      {posts.length > 0 && filteredPosts.length === 0 && (
        <p className="text-gray-500">No posts match the selected city/category filters.</p>
      )}

      {filteredPosts.map(post => {
        const postId = post._id || post.id;
        if (!postId) return null;
        return (
        <div
          key={postId}
          onClick={() => navigate(`/buyer/requirement/${postId}/offers`)}
          className="bg-white border rounded-2xl p-4 mb-3 cursor-pointer hover:bg-gray-50"
        >
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold">{post.productName || post.product || "-"}</h3>
              <p className="text-sm text-gray-600">{post.city || "-"} | {post.category || "-"}</p>
              <p className="text-sm text-gray-600">
                Make/Brand: {post.makeBrand || post.brand || "-"} | Type/Model: {post.typeModel || post.type || "-"}
              </p>
              <p className="text-sm text-gray-600">
                Quantity: {post.quantity || "-"} {post.unit || post.type || ""}
              </p>
              {String(post.details || post.description || "").trim() && (
                <p className="text-sm text-gray-600">{post.details || post.description}</p>
              )}
            </div>

            <span className="btn-brand px-3 py-1 rounded-full text-sm">
              {post.offerCount} offers
            </span>
          </div>
        </div>
        );
      })}
      </div>
    </div>
  );
}

