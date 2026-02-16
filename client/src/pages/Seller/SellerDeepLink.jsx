import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getSession } from "../../services/storage";

export default function SellerDeepLink() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requirementId } = useParams();

  useEffect(() => {
    if (!requirementId) {
      navigate("/seller/login", { replace: true });
      return;
    }

    const params = new URLSearchParams(location.search);
    const city = String(params.get("city") || "").trim();
    const next = new URLSearchParams();
    next.set("openRequirement", requirementId);
    if (city) {
      next.set("city", city);
    }
    const target = `/seller/dashboard?${next.toString()}`;
    localStorage.setItem("post_login_redirect", target);
    localStorage.setItem("login_intent_role", "seller");

    const session = getSession();
    const isSeller =
      session?.role === "seller" || Boolean(session?.roles?.seller);

    if (session?.token && isSeller) {
      navigate(target, { replace: true });
      return;
    }

    if (session?.token && !isSeller) {
      navigate(
        `/seller/register?requirementId=${encodeURIComponent(requirementId)}`,
        { replace: true }
      );
      return;
    }

    navigate("/seller/login", { replace: true });
  }, [location.search, navigate, requirementId]);

  return (
    <div className="page">
      <div className="page-shell py-10 text-gray-600">Redirecting...</div>
    </div>
  );
}
