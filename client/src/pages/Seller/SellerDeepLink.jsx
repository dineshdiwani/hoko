import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import { getSession, setSession } from "../../services/storage";

const PENDING_OFFER_KEY = "pending_seller_offer_intent";
const POST_LOGIN_REDIRECT_SOURCE_KEY = "post_login_redirect_source";
const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;
const MAX_IMAGE_BYTES = 100 * 1024;
function extractObjectId(value) {
  const raw = String(value || "").trim();
  if (OBJECT_ID_REGEX.test(raw)) return raw;
  const match = raw.match(/[a-f0-9]{24}/i);
  return match ? match[0] : "";
}

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
  console.log("[SellerDeepLink] Component mounted");
  const navigate = useNavigate();
  const location = useLocation();
  const { requirementId } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftHint, setDraftHint] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [form, setForm] = useState({
    price: "",
    message: "",
    deliveryTime: "",
    paymentTerms: "",
    mobile: "",
    sellerName: "",
    sellerCity: ""
  });
  const autoSubmitTriedRef = useRef(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const packedData = useMemo(() => {
    const raw = String(params.get("pd") || params.get("data") || "").trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [params]);
  const routeRequirementId = extractObjectId(requirementId);
  const queryPostId = extractObjectId(
    packedData.postId || packedData.requirementId || params.get("postId") || params.get("ref")
  );
  const routeIdValid = OBJECT_ID_REGEX.test(routeRequirementId);
  const queryIdValid = OBJECT_ID_REGEX.test(queryPostId);
  const requirementIdValue = routeIdValid
    ? routeRequirementId
    : queryIdValid
    ? queryPostId
    : routeRequirementId || queryPostId;
  const city = String(packedData.city || params.get("city") || "").trim();
  const queryPreview = useMemo(
    () => ({
      _id: requirementIdValue,
      product: String(
        packedData.product || packedData.productName || params.get("product") || params.get("productName") || ""
      ).trim(),
      productName: String(
        packedData.product || packedData.productName || params.get("product") || params.get("productName") || ""
      ).trim(),
      category: String(packedData.category || params.get("category") || "").trim(),
      city,
      quantity: String(
        packedData.qty || packedData.quantity || params.get("qty") || params.get("quantity") || ""
      ).trim(),
      unit: String(packedData.unit || packedData.type || params.get("unit") || params.get("type") || "").trim(),
      type: String(packedData.unit || packedData.type || params.get("unit") || params.get("type") || "").trim(),
      makeBrand: String(
        packedData.brand || packedData.makeBrand || params.get("brand") || params.get("makeBrand") || ""
      ).trim(),
      typeModel: String(packedData.model || packedData.typeModel || params.get("model") || params.get("typeModel") || "").trim(),
      details: String(packedData.details || packedData.description || params.get("details") || params.get("description") || "").trim(),
      offerInvitedFrom: String(packedData.invite || packedData.offerInvitedFrom || params.get("invite") || "").trim()
    }),
    [packedData, params, city, requirementIdValue]
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
    localStorage.setItem(POST_LOGIN_REDIRECT_SOURCE_KEY, "deeplink");
    localStorage.setItem("login_intent_role", "seller");

    const session = getSession();
    const isSeller = session?.role === "seller" || Boolean(session?.roles?.seller);
    if (!session?.token) {
      navigate("/seller/login", { replace: true });
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

  const ensureSellerSession = async () => {
    const session = getSession();
    if (!session?.token) {
      return { ok: false, reason: "login" };
    }
    if (!session?.roles?.seller) {
      return { ok: false, reason: "register" };
    }
    if (session.role === "seller") {
      return { ok: true, session };
    }

    const res = await api.post("/auth/switch-role", { role: "seller" });
    const nextUser = res?.data?.user || {};
    const nextSession = {
      _id: nextUser._id,
      role: nextUser.role || "seller",
      roles: nextUser.roles || session.roles,
      email: nextUser.email || session.email,
      city: nextUser.city || session.city,
      name: session.name || "Seller",
      picture: session.picture,
      preferredCurrency: nextUser.preferredCurrency || session.preferredCurrency || "INR",
      token: res?.data?.token || session.token
    };
    setSession(nextSession);
    return { ok: true, session: nextSession };
  };

  const submitOffer = async (payload, { isAuto = false } = {}) => {
    setSubmitting(true);
    try {
      const sellerSession = await ensureSellerSession();
      if (sellerSession.ok) {
        let nextAttachments = [];
        if (attachments.length) {
          for (const item of attachments) {
            const formData = new FormData();
            formData.append("file", item);
            const uploadRes = await api.post("/seller/offer/attachments", formData, {
              headers: { "Content-Type": "multipart/form-data" }
            });
            const uploadedUrls =
              uploadRes?.data?.files?.map((entry) => entry.url).filter(Boolean) || [];
            if (uploadedUrls.length) {
              nextAttachments.push(...uploadedUrls);
            }
          }
        }
        await api.post("/seller/offer", {
          requirementId: requirementIdValue,
          price: Number(payload.price),
          message: payload.message || "",
          deliveryTime: payload.deliveryTime || "",
          paymentTerms: payload.paymentTerms || "",
          attachments: nextAttachments
        });
        clearPendingOfferIntent();
        setAttachments([]);
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
        return;
      }
      
      let nextAttachments = [];
      if (attachments.length) {
        for (const item of attachments) {
          const formData = new FormData();
          formData.append("file", item);
          const uploadRes = await api.post("/seller/offer/attachments", formData, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          const uploadedUrls =
            uploadRes?.data?.files?.map((entry) => entry.url).filter(Boolean) || [];
          if (uploadedUrls.length) {
            nextAttachments.push(...uploadedUrls);
          }
        }
      }
      
      await api.post("/seller/offer/public", {
        requirementId: requirementIdValue,
        price: Number(payload.price),
        message: payload.message || "",
        deliveryTime: payload.deliveryTime || "",
        paymentTerms: payload.paymentTerms || "",
        mobile: payload.mobile || "",
        sellerName: payload.sellerName || ""
      });
      clearPendingOfferIntent();
      setAttachments([]);
      console.log("[SellerDeepLink] Offer submitted successfully");
      alert(
        isAuto
          ? "Offer submitted now. Thank you."
          : "Offer submitted successfully."
      );
      navigate("/seller/login", { replace: true });
    } catch (err) {
      console.log("[SellerDeepLink] Submit error:", err);
      console.log("[SellerDeepLink] Error response:", err?.response?.data);
      const status = err?.response?.status;
      const serverMessage = err?.response?.data?.message;
      if (serverMessage) {
        alert(serverMessage);
      } else if (status === 403) {
        alert("You are not authorized to submit this offer.");
      } else {
        alert("Failed to submit offer. Please try again.");
      }
      setSubmitting(false);
      return;
    }
  };

  useEffect(() => {
    const fullUrl = window.location.href;
    const searchParams = new URLSearchParams(window.location.search);
    const refValue = searchParams.get("ref");
    console.log("[SellerDeepLink] Full URL:", fullUrl);
    console.log("[SellerDeepLink] ref param:", refValue);
    console.log("[SellerDeepLink] requirementIdValue:", requirementIdValue);
    console.log("[SellerDeepLink] queryPostId:", queryPostId);
    if (!requirementIdValue) {
      console.log("[SellerDeepLink] Redirecting to login - no requirementIdValue");
      navigate("/seller/login", { replace: true });
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      try {
        const candidateIds = Array.from(
          new Set(
            [requirementIdValue, routeRequirementId, queryPostId]
              .map((value) => String(value || "").trim())
              .filter((value) => OBJECT_ID_REGEX.test(value))
          )
        );
        let loaded = null;
        for (const id of candidateIds) {
          try {
            const res = await api.get(`/meta/requirement-preview/${encodeURIComponent(id)}`);
            loaded = res.data || null;
            if (loaded) break;
          } catch {
            // Try next candidate id.
          }
        }
        if (cancelled) return;
        setPreview(loaded || null);
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
    const canBecomeSeller = Boolean(session?.token && session?.roles?.seller);
    if (!canBecomeSeller) return;

    autoSubmitTriedRef.current = true;
    submitOffer(pending.offerPayload, { isAuto: true });
  }, [loading, requirementIdValue]);

  useEffect(() => {
    if (loading || !requirementIdValue || draftLoaded) return;
    const pending = readPendingOfferIntent();
    if (pending && String(pending.requirementId) === String(requirementIdValue)) {
      setDraftLoaded(true);
      return;
    }

    const session = getSession();
    const canBecomeSeller = Boolean(session?.token && session?.roles?.seller);
    if (!canBecomeSeller) return;

    let cancelled = false;

    async function loadServerDraft() {
      try {
        const res = await api.get(`/seller/offer-draft/${encodeURIComponent(requirementIdValue)}`);
        const draft = res?.data?.draft || null;
        if (cancelled) return;
        if (!draft) {
          setDraftLoaded(true);
          return;
        }
        setForm((prev) => ({
          price: prev.price || (draft.price ? String(draft.price) : ""),
          message: prev.message || String(draft.note || ""),
          deliveryTime:
            prev.deliveryTime ||
            (draft.deliveryDays ? `${draft.deliveryDays} days` : ""),
          paymentTerms: prev.paymentTerms || ""
        }));
        setDraftHint("Pre-filled from your WhatsApp reply. Review and submit your offer.");
        setDraftLoaded(true);
      } catch {
        if (!cancelled) {
          setDraftLoaded(true);
        }
      }
    }

    loadServerDraft();

    return () => {
      cancelled = true;
    };
  }, [loading, requirementIdValue, draftLoaded]);

  const handleSubmit = () => {
    if (submitting) return;
    const payload = {
      price: String(form.price || "").trim(),
      message: String(form.message || "").trim(),
      deliveryTime: String(form.deliveryTime || "").trim(),
      paymentTerms: String(form.paymentTerms || "").trim(),
      mobile: String(form.mobile || "").trim(),
      sellerName: String(form.sellerName || "").trim(),
      sellerCity: String(form.sellerCity || "").trim()
    };

    if (!payload.price || Number(payload.price) <= 0) {
      alert("Please enter a valid offer price.");
      return;
    }

    const session = getSession();
    const canBecomeSeller = Boolean(session?.token && session?.roles?.seller);

    if (!session?.token || !canBecomeSeller) {
      const mobile = String(form.mobile || "").trim();
      const sellerName = String(form.sellerName || "").trim();
      const sellerCity = String(form.sellerCity || "").trim();
      if (!mobile) {
        alert("Please enter your WhatsApp number.");
        return;
      }
      if (!sellerName) {
        alert("Please enter your name.");
        return;
      }
      if (!sellerCity) {
        alert("Please enter your city.");
        return;
      }
      submitOffer(payload);
      return;
    }

    submitOffer(payload);
  };

  async function compressImageFile(file) {
    try {
      const objectUrl = URL.createObjectURL(file);
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);

      let width = image.width;
      let height = image.height;
      const maxSide = 1280;
      if (width > maxSide || height > maxSide) {
        const scale = Math.min(maxSide / width, maxSide / height);
        width = Math.max(320, Math.round(width * scale));
        height = Math.max(320, Math.round(height * scale));
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(image, 0, 0, width, height);

      let quality = 0.85;
      let blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (!blob) return file;

      while (blob.size > MAX_IMAGE_BYTES && quality > 0.25) {
        quality -= 0.1;
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality)
        );
        if (!blob) return file;
      }

      while (blob.size > MAX_IMAGE_BYTES && canvas.width > 320 && canvas.height > 320) {
        const nextWidth = Math.max(320, Math.round(canvas.width * 0.85));
        const nextHeight = Math.max(320, Math.round(canvas.height * 0.85));
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        ctx.drawImage(image, 0, 0, nextWidth, nextHeight);
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", Math.max(0.45, quality))
        );
        if (!blob) return file;
      }

      const baseName = String(file.name || "attachment")
        .replace(/\.[^/.]+$/, "")
        .slice(0, 80);
      const finalName = `${baseName}.jpg`;
      return new File([blob], finalName, { type: "image/jpeg" });
    } catch {
      return file;
    }
  }

  async function processAttachmentFile(file) {
    if (!file) return null;
    if (file.type && file.type.startsWith("image/")) {
      return compressImageFile(file);
    }
    return file;
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const processed = [];
    for (const inputFile of incoming) {
      const nextFile = await processAttachmentFile(inputFile);
      if (nextFile) processed.push(nextFile);
    }
    if (!processed.length) return;
    setAttachments((prev) => [...prev, ...processed]);
  }

  async function handleAttachmentPick(e) {
    await addFiles(e.target.files);
    e.target.value = "";
  }

  function removeAttachment(index) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    async function startCamera() {
      if (!cameraOpen) return;
      setCameraError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError("Unable to access camera.");
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraOpen]);

  async function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) {
      alert("Failed to capture photo.");
      return;
    }
    const capturedFile = new File([blob], `offer-camera-${Date.now()}.jpg`, {
      type: "image/jpeg"
    });
    const processedCapturedFile = await processAttachmentFile(capturedFile);
    if (processedCapturedFile) {
      setAttachments((prev) => [...prev, processedCapturedFile]);
    }
    setCameraOpen(false);
  }

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
  const docInputId = `deep-offer-doc-${requirementIdValue || "unknown"}`;

  return (
    <div className="page">
      <div className="page-shell py-10 max-w-2xl">
        <h1 className="ui-heading mb-3">Submit Offer</h1>
        {loading ? (
          <p className="ui-body text-[var(--ui-muted)]">Loading requirement...</p>
        ) : (
          <div className="dashboard-panel p-4 space-y-3">
            {draftHint ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {draftHint}
              </div>
            ) : null}
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
              value={form.sellerName}
              onChange={(e) => setForm((prev) => ({ ...prev, sellerName: e.target.value }))}
              className="app-input"
              placeholder="Your name *"
            />
            <input
              value={form.mobile}
              onChange={(e) => setForm((prev) => ({ ...prev, mobile: e.target.value }))}
              type="tel"
              className="app-input"
              placeholder="WhatsApp number *"
            />
            <input
              value={form.sellerCity}
              onChange={(e) => setForm((prev) => ({ ...prev, sellerCity: e.target.value }))}
              className="app-input"
              placeholder="Your city *"
            />
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
            <input
              id={docInputId}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
              onChange={handleAttachmentPick}
              className="sr-only"
            />
            <div className="mb-1 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95"
                aria-label="Capture photo"
                title="Capture photo"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                  <path d="M9 4h6l1.2 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.8L9 4Zm3 4.5A4.5 4.5 0 1 0 12 17a4.5 4.5 0 0 0 0-9Zm0 2A2.5 2.5 0 1 1 12 15a2.5 2.5 0 0 1 0-5Z" />
                </svg>
              </button>
              <label
                htmlFor={docInputId}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:bg-emerald-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-95"
                aria-label="Attach file"
                title="Attach file"
                role="button"
                tabIndex={0}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                  <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5" />
                </svg>
              </label>
            </div>
            {attachments.length > 0 ? (
              <div className="mb-2 space-y-2">
                {attachments.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex items-center justify-between text-sm bg-gray-50 border rounded-lg px-3 py-2"
                  >
                    <span className="truncate">
                      {item.name} ({Math.max(1, Math.round(item.size / 1024))} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-brand px-5 py-2 rounded-xl"
            >
              {submitting ? "Submitting..." : "Submit Offer"}
            </button>
            {cameraOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="font-semibold">Capture Photo</h2>
                    <button type="button" onClick={() => setCameraOpen(false)}>
                      Close
                    </button>
                  </div>
                  {cameraError ? (
                    <div className="text-sm text-red-600">{cameraError}</div>
                  ) : (
                    <div className="space-y-3">
                      <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl bg-black" />
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="w-full py-2 btn-brand rounded-xl font-semibold"
                      >
                        Capture
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
