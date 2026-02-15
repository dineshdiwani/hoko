import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession } from "../../services/storage";

export default function SellerDeepLink() {
  const navigate = useNavigate();
  const { requirementId } = useParams();

  useEffect(() => {
    if (!requirementId) {
      navigate("/seller/login", { replace: true });
      return;
    }

    const target = `/seller/dashboard?openRequirement=${encodeURIComponent(
      requirementId
    )}`;
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
  }, [navigate, requirementId]);

  return (
    <div className="page">
      <div className="page-shell py-10 text-gray-600">Redirecting...</div>
    </div>
  );
}
