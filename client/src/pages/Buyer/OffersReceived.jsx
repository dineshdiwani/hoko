import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";

export default function OffersReceived() {
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

  return (
    <div className="page">
      <div className="page-shell max-w-4xl">
        <h2 className="page-hero mb-4">Offers Received</h2>

      {posts.length === 0 && (
        <p className="text-gray-500">No posts yet.</p>
      )}

      {posts.map(post => {
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
              <h3 className="font-bold">{post.productName}</h3>
              <p className="text-sm text-gray-600">{post.details}</p>
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

