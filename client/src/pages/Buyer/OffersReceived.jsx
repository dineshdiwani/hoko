import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";

export default function OffersReceived({
  city = "",
  selectedCategory = "all",
  cities = [],
  categories = [],
  refreshToken = 0,
  onCityChange,
  onCategoryChange,
  onVisibleCountChange
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const session = getSession();
  const buyerId = session?._id;
  const navigate = useNavigate();
  const loadMoreRef = useRef(null);
  const loadedCountRef = useRef(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;

    async function loadPosts({ nextPage = 1, append = false } = {}) {
      if (!buyerId) {
        loadedCountRef.current = 0;
        setPosts([]);
        setTotalCount(0);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = {
          page: nextPage,
          limit: PAGE_SIZE
        };
        const selectedCity = String(city || "").trim();
        const selectedCat = String(selectedCategory || "all").trim();
        if (selectedCity && selectedCity.toLowerCase() !== "all") {
          params.city = selectedCity;
        }
        if (selectedCat && selectedCat.toLowerCase() !== "all") {
          params.category = selectedCat;
        }

        const res = await api.get(`/buyer/my-posts/${buyerId}`, { params });
        if (cancelled) return;

        const postsData = Array.isArray(res.data) ? res.data : [];
        const enriched = await Promise.all(
          postsData.map(async (post) => {
            const postId = post._id || post.id;
            if (!postId) return { ...post, offerCount: 0 };
            try {
              const offers = await api.get(`/dashboard/offers/${postId}`);
              return { ...post, offerCount: offers.data?.length || 0 };
            } catch {
              return { ...post, offerCount: 0 };
            }
          })
        );

        const nextTotal = Number(res?.headers?.["x-total-count"] || enriched.length || 0);
        const nextLoadedCount = append
          ? loadedCountRef.current + enriched.length
          : enriched.length;

        if (!append) {
          setPosts(enriched);
        } else {
          setPosts((prev) => [...prev, ...enriched]);
        }

        loadedCountRef.current = nextLoadedCount;
        setTotalCount(Number.isFinite(nextTotal) ? nextTotal : 0);
        setPage(nextPage);
        setHasMore(nextLoadedCount < nextTotal);
      } catch {
        if (!append) {
          setPosts([]);
          setTotalCount(0);
          loadedCountRef.current = 0;
        }
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    }

    loadedCountRef.current = 0;
    setPosts([]);
    setTotalCount(0);
    setHasMore(false);
    setPage(1);
    loadPosts({ nextPage: 1, append: false });

    return () => {
      cancelled = true;
    };
  }, [buyerId, city, selectedCategory, refreshToken]);

  const filteredPosts = posts;

  useEffect(() => {
    onVisibleCountChange?.(totalCount);
  }, [onVisibleCountChange, totalCount]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return undefined;
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && !loadingMore && !loading && hasMore) {
          setLoadingMore(true);
          const params = {
            page: page + 1,
            limit: PAGE_SIZE
          };
          const selectedCity = String(city || "").trim();
          const selectedCat = String(selectedCategory || "all").trim();
          if (selectedCity && selectedCity.toLowerCase() !== "all") {
            params.city = selectedCity;
          }
          if (selectedCat && selectedCat.toLowerCase() !== "all") {
            params.category = selectedCat;
          }
          api
            .get(`/buyer/my-posts/${buyerId}`, { params })
            .then(async (res) => {
              const postsData = Array.isArray(res.data) ? res.data : [];
              const enriched = await Promise.all(
                postsData.map(async (post) => {
                  const postId = post._id || post.id;
                  if (!postId) return { ...post, offerCount: 0 };
                  try {
                    const offers = await api.get(`/dashboard/offers/${postId}`);
                    return { ...post, offerCount: offers.data?.length || 0 };
                  } catch {
                    return { ...post, offerCount: 0 };
                  }
                })
              );
              const nextTotal = Number(res?.headers?.["x-total-count"] || enriched.length || 0);
              const nextLoadedCount = loadedCountRef.current + enriched.length;
              setPosts((prev) => [...prev, ...enriched]);
              loadedCountRef.current = nextLoadedCount;
              setTotalCount(Number.isFinite(nextTotal) ? nextTotal : 0);
              setPage((prevPage) => prevPage + 1);
              setHasMore(nextLoadedCount < nextTotal);
            })
            .catch(() => {
              setHasMore(false);
            })
            .finally(() => {
              setLoadingMore(false);
            });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [buyerId, city, hasMore, loading, loadingMore, page, selectedCategory]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-shell max-w-4xl">
          <h2 className="page-hero mb-4">Offers Received</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

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
          <option value="all">All cities</option>
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

      {totalCount === 0 && (
        <p className="text-gray-500">No posts yet.</p>
      )}

      {totalCount > 0 && filteredPosts.length === 0 && (
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
      {hasMore && (
        <div ref={loadMoreRef} className="py-4 text-center text-sm text-gray-500">
          {loadingMore ? "Loading more posts..." : "Scroll to load more posts"}
        </div>
      )}
      </div>
    </div>
  );
}

