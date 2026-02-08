import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

export default function OffersReceived() {
  const [posts, setPosts] = useState([]);
  const buyerId = localStorage.getItem("userId");
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/buyer/my-posts/${buyerId}`).then(async res => {
      const enriched = await Promise.all(
        res.data.map(async post => {
          const offers = await api.get(`/dashboard/offers/${post._id}`);
          return { ...post, offerCount: offers.data.length };
        })
      );
      setPosts(enriched);
    });
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Offers Received</h2>

      {posts.length === 0 && (
        <p className="text-gray-500">No posts yet.</p>
      )}

      {posts.map(post => (
        <div
          key={post._id}
          onClick={() => navigate(`/offers/${post._id}`)}
          className="border rounded p-4 mb-3 cursor-pointer hover:bg-gray-50"
        >
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold">{post.productName}</h3>
              <p className="text-sm text-gray-600">{post.details}</p>
            </div>

            <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
              {post.offerCount} offers
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
