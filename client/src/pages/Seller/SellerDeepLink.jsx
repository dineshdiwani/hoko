import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";

const PENDING_OFFER_KEY = "pending_seller_offer_intent";

function readPendingOfferIntent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_OFFER_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearPendingOfferIntent() {
  localStorage.removeItem(PENDING_OFFER_KEY);
}

export default function SellerDeepLink() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requirementId } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({
    price: "",
    message: "",
    deliveryTime: "",
    paymentTerms: ""
  });
  const autoSubmitTriedRef = useRef(false);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeRequirementId = String(requirementId || "").trim();
  const queryPostId = String(params.get("postId") || "").trim();
  const requirementIdValue = routeRequirementId || queryPostId;
  const city = String(params.get("city") || "").trim();
  const queryPreview = useMemo(
    () => ({
      _id: requirementIdValue,
      product: String(
        params.get("product") || params.get("productName") || ""
      ).trim(),
      productName: String(
        params.get("product") || params.get("productName") || ""
      ).trim(),
      category: String(params.get("category") || "").trim(),
      city,
      quantity: String(
        params.get("qty") || params.get("quantity") || ""
      ).trim(),
      unit: String(params.get("unit") || params.get("type") || "").trim(),
      type: String(params.get("unit") || params.get("type") || "").trim(),
      makeBrand: String(
        params.get("brand") || params.get("makeBrand") || ""
      ).trim(),
      typeModel: String(params.get("model") || params.get("typeModel") || "").trim(),
      details: String(params.get("details") || params.get("description") || "").trim(),
      offerInvitedFrom: String(params.get("invite") || "").trim()
    }),
    [params, city, requirementIdValue]
  );

  const buildRedirectTarget = () => {
    const next = new URLSearchParams();
    if (city) next.set("city", city);
    next.set("resume", "1");
    return `/seller/deeplink/${encodeURIComponent(requirementIdValue)}?${next.toString()}`;
  };

  const savePendingOfferIntent = (payload) => {
    const record = {
      requirementId: requirementIdValue,
      city,
      offerPayload: payload,
      createdAt: Date.now()
    };
    localStorage.setItem(PENDING_OFFER_KEY, JSON.stringify(record));
  };

  const redirectToAuthOrRegister = (payload) => {
    savePendingOfferIntent(payload);
    localStorage.setItem("post_login_redirect", buildRedirectTarget());
    localStorage.setItem("login_intent_role", "seller");

    const session = getSession();
    const isSeller = session?.role === "seller" || Boolean(session?.roles?.seller);
    if (!session?.token) {
      navigate("/buyer/login", { replace: true });
      return;
    }
    if (session?.token && !isSeller) {
      navigate(`/seller/register?requirementId=${encodeURIComponent(requirementIdValue)}`, {
        replace: true
      });
      return;
    }
    navigate("/seller/login", { replace: true });
  };

  const submitOffer = async (payload, { isAuto = false } = {}) => {
    setSubmitting(true);
    try {
      await api.post("/seller/offer", {
        requirementId: requirementIdValue,
        price: Number(payload.price),
        message: payload.message || "",
        deliveryTime: payload.deliveryTime || "",
        paymentTerms: payload.paymentTerms || ""
      });
      clearPendingOfferIntent();
      alert(
        isAuto
          ? "Offer submitted now. Thank you."
          : "Offer submitted successfully."
      );
      const dashboardParams = new URLSearchParams();
      dashboardParams.set("openRequirement", requirementIdValue);
      if (city) dashboardParams.set("city", city);
      navigate(`/seller/dashboard?${dashboardParams.toString()}`, {
        replace: true
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || "Failed to submit offer. Try again.";
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!requirementIdValue) {
      navigate("/seller/login", { replace: true });
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      try {
        const res = await api.get(`/meta/requirement-preview/${encodeURIComponent(requirementIdValue)}`);
        if (cancelled) return;
        setPreview(res.data || null);
      } catch {
        if (cancelled) return;
        setPreview(queryPreview);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [navigate, queryPreview, requirementIdValue]);

  useEffect(() => {
    if (loading || !requirementIdValue || autoSubmitTriedRef.current) return;
    const pending = readPendingOfferIntent();
    if (!pending || String(pending.requirementId) !== String(requirementIdValue)) return;

    setForm({
      price: String(pending.offerPayload?.price || ""),
      message: String(pending.offerPayload?.message || ""),
      deliveryTime: String(pending.offerPayload?.deliveryTime || ""),
      paymentTerms: String(pending.offerPayload?.paymentTerms || "")
    });

    const session = getSession();
    const isSeller = session?.role === "seller" || Boolean(session?.roles?.seller);
    if (!session?.token || !isSeller) return;

    autoSubmitTriedRef.current = true;
    submitOffer(pending.offerPayload, { isAuto: true });
  }, [loading, requirementIdValue]);

  const handleSubmit = () => {
    const payload = {
      price: String(form.price || "").trim(),
      message: String(form.message || "").trim(),
      deliveryTime: String(form.deliveryTime || "").trim(),
      paymentTerms: String(form.paymentTerms || "").trim()
    };

    if (!payload.price || Number(payload.price) <= 0) {
      alert("Please enter a valid offer price.");
      return;
    }

    const session = getSession();
    const isSeller = session?.role === "seller" || Boolean(session?.roles?.seller);

    if (!session?.token || !isSeller) {
      redirectToAuthOrRegister(payload);
      return;
    }

    submitOffer(payload);
  };
  const postPreview = preview || queryPreview;
  const postName = postPreview?.product || postPreview?.productName || "Requirement";
  const postQuantity = String(postPreview?.quantity || "").trim();
  const postUnit = String(postPreview?.type || postPreview?.unit || "").trim();
  const postBrand = postPreview?.makeBrand || postPreview?.brand || "";
  const postModel = postPreview?.typeModel || "";
  const postDetails = String(postPreview?.details || postPreview?.description || "").trim();
  const inviteScope =
    String(postPreview?.offerInvitedFrom || "").toLowerCase() === "anywhere"
      ? "Anywhere"
      : "City";

  return (
    <div className="page">
      <div className="page-shell py-10 max-w-2xl">
        <h1 className="ui-heading mb-3">Submit Offer</h1>
        {loading ? (
          <p className="ui-body text-[var(--ui-muted)]">Loading requirement...</p>
        ) : (
          <div className="dashboard-panel p-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="ui-label text-[var(--ui-muted)] mb-1">Post Details</p>
              <p className="ui-body">
                <strong>{postName}</strong>
              </p>
              <p className="ui-body text-[var(--ui-muted)]">
                City: {postPreview?.city || "Not provided"} | Category: {postPreview?.category || "Not provided"}
              </p>
              <p className="ui-body text-[var(--ui-muted)]">
                Quantity: {postQuantity || "Not provided"} {postUnit}
              </p>
              <p className="ui-body text-[var(--ui-muted)]">
                Make/Brand: {postBrand || "Not provided"} | Type/Model: {postModel || "Not provided"}
              </p>
              <p className="ui-body text-[var(--ui-muted)]">
                Offer invited from: {inviteScope}
              </p>
              {postDetails ? (
                <p className="ui-body mt-1 whitespace-pre-line">{postDetails}</p>
              ) : null}
            </div>
            <input
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
              type="number"
              min="1"
              className="app-input"
              placeholder="Offer price *"
            />
            <input
              value={form.deliveryTime}
              onChange={(e) => setForm((prev) => ({ ...prev, deliveryTime: e.target.value }))}
              className="app-input"
              placeholder="Delivery time"
            />
            <input
              value={form.paymentTerms}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentTerms: e.target.value }))}
              className="app-input"
              placeholder="Payment terms"
            />
            <textarea
              value={form.message}
              onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              className="app-input min-h-28"
              placeholder="Offer notes"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-brand px-5 py-2 rounded-xl"
            >
              {submitting ? "Submitting..." : "Submit Offer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
