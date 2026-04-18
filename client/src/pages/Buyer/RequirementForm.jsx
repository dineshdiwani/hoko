import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import { getSession } from "../../services/auth";
import { setSession } from "../../services/storage";
import {
  getAttachmentDisplayName,
  getAttachmentTypeMeta
} from "../../utils/attachments";

const LAST_REQUIREMENT_PREFS_KEY = "buyer_last_requirement_prefs";

function readLastRequirementPrefs() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(LAST_REQUIREMENT_PREFS_KEY) || "{}"
    );
    return {
      city: String(parsed.city || "").trim(),
      category: String(parsed.category || "").trim(),
      unit: String(parsed.unit || "").trim()
    };
  } catch {
    return { city: "", category: "", unit: "" };
  }
}

function saveLastRequirementPrefs({ city, category, unit }) {
  try {
    localStorage.setItem(
      LAST_REQUIREMENT_PREFS_KEY,
      JSON.stringify({
        city: String(city || "").trim(),
        category: String(category || "").trim(),
        unit: String(unit || "").trim()
      })
    );
  } catch {}
}

function buildBuyerUpdatesWaLink(rawLink, messageText) {
  const message = String(messageText || "").trim();
  const encodedMessage = encodeURIComponent(message);
  const fallback = `https://wa.me/918079060554?text=${encodedMessage}`;
  const input = String(rawLink || "").trim();
  if (!input) return fallback;

  if (/^\d{8,20}$/.test(input)) {
    return `https://wa.me/${input}?text=${encodedMessage}`;
  }

  try {
    const parsed = new URL(input);
    if (!parsed.searchParams.has("text")) {
      parsed.searchParams.set("text", message);
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export default function RequirementForm({ isPublic = false }) {
  const navigate = useNavigate();
  const { id: requirementId } = useParams();
  const [searchParams] = useSearchParams();
  const rawRef = searchParams.get("ref") || "";
  const mobileFromUrl = searchParams.get("mobile") || "";
  const productFromUrl = searchParams.get("product") || "";
  const cityFromUrl = searchParams.get("city") || "";
  console.log("[RequirementForm] rawRef:", rawRef);
  let tempRequirementRef = rawRef;
  
  const decodedRef = decodeURIComponent(rawRef);
  console.log("[RequirementForm] decodedRef:", decodedRef);
  const idMatch = decodedRef.match(/ref=([a-f0-9]{20,24})/i);
  if (idMatch) {
    tempRequirementRef = idMatch[1];
    console.log("[RequirementForm] Extracted ID:", tempRequirementRef);
  }
  const isEditMode = Boolean(requirementId);
  const session = getSession();
  const isLoggedIn = Boolean(session?.token);
  const sessionCity = String(session?.city || "").trim();

  const [form, setForm] = useState({
    mobile: "",
    city: cityFromUrl || "",
    category: "",
    product: productFromUrl || "",
    makeBrand: "",
    typeModel: "",
    quantity: "",
    unit: "",
    details: "",
    offerInvitedFrom: "city"
  });
  const [submitted, setSubmitted] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingRequirement, setLoadingRequirement] = useState(isEditMode);
  
  const [otpStep, setOtpStep] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpError, setOtpError] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [postData, setPostData] = useState(null);
  const maxImageBytes = 100 * 1024;
  const [whatsappVerifyOpen, setWhatsappVerifyOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([
    "electronics",
    "grocery",
    "services",
    "construction"
  ]);
  const [units, setUnits] = useState([
    "pcs",
    "kg",
    "litre",
    "service"
  ]);
  const buyerUpdatesMessage = "Send updates on my post";
  const buyerUpdatesWaLink = useMemo(
    () =>
      buildBuyerUpdatesWaLink(
        import.meta.env.VITE_WHATSAPP_UPDATES_WA_ME_LINK ||
          import.meta.env.VITE_WHATSAPP_CONSENT_WA_ME_LINK,
        buyerUpdatesMessage
      ),
    [buyerUpdatesMessage]
  );
  const categoryOptions = useMemo(() => {
    const currentCategory = String(form.category || "").trim();
    if (!currentCategory) return categories;
    const exactMatch = categories.some(
      (categoryName) => String(categoryName || "") === currentCategory
    );
    if (exactMatch) return categories;

    const caseInsensitiveMatch = categories.find(
      (categoryName) =>
        String(categoryName || "").toLowerCase() ===
        currentCategory.toLowerCase()
    );
    if (caseInsensitiveMatch) {
      return [caseInsensitiveMatch, ...categories];
    }
    return [currentCategory, ...categories];
  }, [categories, form.category]);
  const resolveCityValue = (value, cityList, fallback = "") => {
    const raw = String(value || fallback || "").trim();
    if (!raw) return "";
    const matched = (Array.isArray(cityList) ? cityList : []).find(
      (cityName) => String(cityName || "").trim().toLowerCase() === raw.toLowerCase()
    );
    return matched || raw;
  };

  useEffect(() => {
    const currentCategory = String(form.category || "").trim();
    if (!currentCategory || !categories.length) return;
    const exactMatch = categories.some(
      (categoryName) => String(categoryName || "") === currentCategory
    );
    if (exactMatch) return;
    const caseInsensitiveMatch = categories.find(
      (categoryName) =>
        String(categoryName || "").toLowerCase() ===
        currentCategory.toLowerCase()
    );
    if (!caseInsensitiveMatch) return;
    setForm((prev) => {
      if (prev.category === caseInsensitiveMatch) return prev;
      return { ...prev, category: caseInsensitiveMatch };
    });
  }, [categories, form.category]);

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        const defaults = data?.defaults || {};
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
          setForm((prev) => {
            if (prev.city) return prev;
            const nextCity = resolveCityValue(sessionCity || defaults.city, data.cities);
            return nextCity ? { ...prev, city: nextCity } : prev;
          });
        }
        if (Array.isArray(data.categories) && data.categories.length) {
          setCategories(data.categories);
        }
        if (Array.isArray(data.units) && data.units.length) {
          setUnits(data.units);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function loadRequirement() {
      if (!isEditMode) {
        setLoadingRequirement(false);
        return;
      }
      try {
        const res = await api.get(`/buyer/requirement/${requirementId}`);
        const requirement = res?.data || {};
        setForm((prev) => ({
          ...prev,
          city: requirement.city || "",
          category: requirement.category || "",
          product: requirement.product || requirement.productName || "",
          makeBrand: requirement.makeBrand || requirement.brand || "",
          typeModel: requirement.typeModel || "",
          quantity: requirement.quantity || "",
          unit: requirement.type || requirement.unit || "",
          details: requirement.details || "",
          offerInvitedFrom: requirement.offerInvitedFrom || "city"
        }));
        setExistingAttachments(
          Array.isArray(requirement.attachments) ? requirement.attachments : []
        );
      } catch {
        alert("Unable to load requirement for editing.");
        navigate("/buyer/dashboard", { replace: true });
      } finally {
        setLoadingRequirement(false);
      }
    }

    loadRequirement();
  }, [isEditMode, navigate, requirementId]);

  useEffect(() => {
    async function fetchMobileFromRef() {
      if (!isPublic || !tempRequirementRef || form.mobile) return;
      
      try {
        const res = await api.get(`/buyer/temp-requirement/${tempRequirementRef}`);
        const tempData = res?.data;
        if (tempData?.mobileE164) {
          const mobile = tempData.mobileE164.replace("+", "");
          setForm((prev) => ({ ...prev, mobile }));
        }
      } catch (err) {
        console.log("[RequirementForm] Could not fetch mobile from ref:", err);
        if (mobileFromUrl) {
          setForm((prev) => ({ ...prev, mobile: mobileFromUrl }));
        }
      }
    }
    
    if (mobileFromUrl) {
      setForm((prev) => ({ ...prev, mobile: mobileFromUrl }));
    }
    
    // If logged in via email, pre-fill mobile from session if available
    if (session?.mobile && isPublic) {
      setForm((prev) => ({ ...prev, mobile: session.mobile.replace("+", "") }));
    }
    
    fetchMobileFromRef();
  }, [tempRequirementRef, isPublic]);

  useEffect(() => {
    const draft = localStorage.getItem("draft_requirement_text");
    if (!isEditMode && draft && !form.product) {
      setForm((prev) => ({ ...prev, product: draft }));
    }
    if (!isEditMode && draft) {
      localStorage.removeItem("draft_requirement_text");
    }
  }, [form.product, isEditMode]);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("hoko_settings") || "{}"
      );
      const buyerPrefs = stored?.buyer || {};
      const lastPrefs = readLastRequirementPrefs();
      setForm((prev) => ({
        ...prev,
        city:
          prev.city ||
          resolveCityValue(
            sessionCity || lastPrefs.city || buyerPrefs.defaultCity,
            cities
          ) ||
          "",
        unit: prev.unit || lastPrefs.unit || buyerPrefs.defaultUnit || ""
      }));
    } catch {}
  }, [cities, sessionCity]);

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
      } catch (err) {
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

  function getDisplayName(attachment, index) {
    return getAttachmentDisplayName(attachment, index);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function compressImageFile(file) {
    try {
      const img = await new Promise((resolve, reject) => {
        if (window.createImageBitmap) {
          createImageBitmap(file).then(resolve).catch(reject);
          return;
        }
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
      });

      let width = img.width;
      let height = img.height;
      const maxSide = 1280;
      if (width > maxSide || height > maxSide) {
        const scale = Math.min(maxSide / width, maxSide / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const originalExt = String(file.name || "").toLowerCase().endsWith(".png")
        ? ".png"
        : ".jpg";
      const mimeType = originalExt === ".png" ? "image/png" : "image/jpeg";
      let quality = mimeType === "image/jpeg" ? 0.8 : undefined;
      let blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, mimeType, quality)
      );

      while (
        blob &&
        blob.size > maxImageBytes &&
        mimeType === "image/jpeg" &&
        quality > 0.2
      ) {
        quality -= 0.1;
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, mimeType, quality)
        );
      }

      if (blob && blob.size > maxImageBytes) {
        // As a last resort, downscale further
        const scale = Math.sqrt(maxImageBytes / blob.size);
        const newWidth = Math.max(320, Math.floor(width * scale));
        const newHeight = Math.max(320, Math.floor(height * scale));
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, mimeType, mimeType === "image/jpeg" ? 0.7 : undefined)
        );
      }

      const baseName = (file.name || "photo")
        .replace(/\.[^/.]+$/, "")
        .slice(0, 60);
      const fileName = `${baseName}${originalExt}`;
      return new File([blob], fileName, { type: mimeType });
    } catch {
      return file;
    }
  }

  async function compressImageBlob(blob) {
    const file = new File([blob], "camera.jpg", {
      type: blob.type || "image/jpeg"
    });
    return compressImageFile(file);
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const allowed = [
      ".jpg",
      ".jpeg",
      ".png",
      ".pdf",
      ".docx",
      ".xlsx"
    ];

    const valid = incoming.filter((file) => {
      const name = String(file.name || "").toLowerCase();
      return allowed.some((ext) => name.endsWith(ext));
    });

    if (valid.length !== incoming.length) {
      alert("Only jpg, jpeg, png, pdf, docx, xlsx files are allowed");
    }

    const processed = [];
    for (const file of valid) {
      if (file.type && file.type.startsWith("image/")) {
        processed.push(await compressImageFile(file));
      } else {
        processed.push(file);
      }
    }

    setAttachments((prev) => {
      const next = [...prev, ...processed].slice(0, 5);
      if (next.length < prev.length + valid.length) {
        alert("You can upload up to 5 files");
      }
      return next;
    });
  }

  function removeAttachment(index) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function removeExistingAttachment(index) {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
  }

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
    const file = await compressImageBlob(blob);
    setAttachments((prev) => {
      const next = [...prev, file].slice(0, 5);
      if (next.length < prev.length + 1) {
        alert("You can upload up to 5 files");
      }
      return next;
    });
    setCameraOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);

    if (
      !form.mobile ||
      !form.city ||
      !form.category ||
      !form.product ||
      !form.quantity ||
      !form.unit
    ) {
      alert("Please fill all required fields");
      setSubmitted(false);
      return;
    }

    try {
      let attachmentUrls = [];
      if (attachments.length) {
        setUploading(true);
        const formData = new FormData();
        attachments.forEach((file) => {
          formData.append("files", file);
        });
        const uploadRes = await api.post(
          "/buyer/requirement/attachments",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        attachmentUrls =
          uploadRes?.data?.files?.map((f) => f.url) || [];
      }

      const payload = {
        mobile: form.mobile,
        city: form.city,
        category: form.category,
        productName: form.product,
        product: form.product,
        makeBrand: form.makeBrand,
        typeModel: form.typeModel,
        quantity: form.quantity,
        type: form.unit,
        details: form.details,
        offerInvitedFrom: form.offerInvitedFrom || "city",
        attachments: [...existingAttachments, ...attachmentUrls]
      };

      if (isEditMode) {
        await api.put(`/buyer/requirement/${requirementId}`, payload);
      } else if (isPublic && tempRequirementRef) {
        const publicPayload = {
          ...payload,
          ref: tempRequirementRef
        };
        console.log("Public requirement payload:", publicPayload);
        await api.post("/buyer/requirement/public", publicPayload);
      } else {
        await api.post("/buyer/requirement", payload);
      }
      saveLastRequirementPrefs({
        city: payload.city,
        category: payload.category,
        unit: payload.type
      });

      // For logged-in users (from email login), show WhatsApp verify popup
      if (session?.token) {
        setWhatsappVerifyOpen(true);
        return;
      }

      // For non-public or not logged in
      if (isPublic) {
        const session = getSession();
        if (session?.mobile) {
          navigate("/buyer/dashboard", { replace: true });
        } else {
          navigate("/buyer/login?redirect=/buyer/dashboard", { replace: true });
        }
      } else {
        alert(
          isEditMode
            ? "Requirement updated successfully"
            : "Requirement posted successfully"
        );
        navigate("/buyer/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("Requirement submit error:", err);
      const errorMsg = err?.response?.data?.message || err?.message || "Unknown error";
      alert(
        isEditMode
          ? `Failed to update requirement: ${errorMsg}`
          : `Failed to post requirement: ${errorMsg}`
      );
    } finally {
      setUploading(false);
    }
  }

  async function handlePublicSubmit(e) {
    e.preventDefault();
    setSubmitted(true);

    if (
      !form.mobile ||
      !form.city ||
      !form.category ||
      !form.product ||
      !form.quantity ||
      !form.unit
    ) {
      alert("Please fill all required fields");
      setSubmitted(false);
      return;
    }

    try {
      let attachmentUrls = [];
      if (attachments.length) {
        setUploading(true);
        const formData = new FormData();
        attachments.forEach((file) => {
          formData.append("files", file);
        });
        const uploadRes = await api.post(
          "/buyer/requirement/attachments",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        attachmentUrls =
          uploadRes?.data?.files?.map((f) => f.url) || [];
      }

      const payload = {
        mobile: form.mobile,
        city: form.city,
        category: form.category,
        productName: form.product,
        product: form.product,
        makeBrand: form.makeBrand,
        typeModel: form.typeModel,
        quantity: form.quantity,
        type: form.unit,
        details: form.details,
        offerInvitedFrom: form.offerInvitedFrom || "city",
        attachments: [...existingAttachments, ...attachmentUrls],
        ref: tempRequirementRef
      };

      setPostData(payload);

      const otpRes = await api.post("/buyer/requirement/request-otp", {
        mobile: form.mobile,
        product: form.product,
        city: form.city
      });

      if (otpRes.data?.success) {
        setOtpStep(true);
        setSubmitted(false);
        setUploading(false);
      } else {
        throw new Error(otpRes.data?.message || "Failed to send OTP");
      }
    } catch (err) {
      console.error("Requirement submit error:", err);
      const errorMsg = err?.response?.data?.message || err?.message || "Unknown error";
      alert(`Failed to post requirement: ${errorMsg}`);
      setSubmitted(false);
      setUploading(false);
    }
  }

  async function handleOtpVerify() {
    if (otpValue.length !== 4) {
      setOtpError("Please enter 4-digit OTP");
      return;
    }

    setVerifyingOtp(true);
    setOtpError("");

    try {
      const verifyRes = await api.post("/buyer/requirement/verify-otp", {
        mobile: form.mobile,
        otp: otpValue,
        requirementData: postData
      });

      if (verifyRes.data?.success) {
        setOtpStep(false);
        setSubmitted(true);
        setOtpValue("");
        
        const { token, user, requirementId } = verifyRes.data;
        
        // If user was not logged in before (new user), redirect to login
        // Otherwise go to dashboard
        const wasLoggedInBefore = session?.token;
        
        // If token returned, save the session (for next time login)
        if (token && user) {
          setSession({
            _id: user._id,
            role: user.role,
            roles: user.roles,
            email: user.email,
            city: user.city,
            name: user.name || "Buyer",
            preferredCurrency: user.preferredCurrency || "INR",
            mobile: user.mobile,
            token
          });
        }
        
        if (!wasLoggedInBefore) {
          // New user - redirect to login page
          navigate("/buyer/login?redirect=/buyer/dashboard&newUser=true", { replace: true });
        } else {
          // Already logged in - go to dashboard on My Posts tab
          navigate(`/buyer/dashboard?tab=posts&highlight=${requirementId || ""}`, { replace: true });
        }
      } else {
        throw new Error(verifyRes.data?.message || "Invalid OTP");
      }
    } catch (err) {
      console.error("OTP verify error:", err);
      setOtpError(err?.response?.data?.message || err?.message || "Invalid OTP. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  if (loadingRequirement) {
    return (
      <div className="page">
        <div className="page-shell py-10 text-sm text-gray-600">
          Loading requirement...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page">
        <div className="page-shell">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] items-start">
            <div>
              <h1 className="page-hero mb-4 pl-12 md:pl-0">
                {isEditMode ? "Edit Requirement" : "Post Requirement"}
              </h1>
              <p className="page-subtitle leading-relaxed">
                Share your requirement once. Sellers will compete to give
                you their best offer.
              </p>
              <div className="mt-8 hidden lg:block">
                <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 px-4 py-2 text-yellow-300 text-sm">
                  Fast quotes * Transparent pricing * No spam
                </div>
              </div>
            </div>

            <form
              id="buyer-requirement-form"
              onSubmit={isLoggedIn ? handleSubmit : (e) => { e.preventDefault(); navigate("/buyer/login?redirect=/buyer/requirement/new"); }}
              className={`w-full bg-white rounded-2xl shadow p-4 pb-24 md:pb-4 ${
                submitted ? "form-submitted" : ""
              }`}
            >
            <h2 className="text-xl font-bold mb-4">
              Requirement Details
            </h2>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Mobile - auto-filled from WhatsApp or editable for email login */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {session?.mobile ? "Mobile Number (verified)" : "Mobile Number"}
            </label>
            <input
              name="mobile"
              type="tel"
              value={form.mobile}
              readOnly={Boolean(session?.mobile)}
              onChange={(e) => setForm({...form, mobile: e.target.value})}
              placeholder={session?.mobile ? "" : "Enter your mobile number"}
              className={`w-full px-3 py-2 border rounded-xl text-sm ${session?.mobile ? "bg-gray-50" : ""}`}
              required
            />
            {!session?.mobile && (
              <p className="text-xs text-gray-500 mt-1">Required for posting requirement</p>
            )}
          </div>

        {/* Product */}
        <input
          name="product"
          value={form.product}
          onChange={handleChange}
          placeholder="What are you looking for today? *"
          className="md:col-span-2 w-full px-3 py-2 border rounded-xl text-sm"
          required
        />

        {/* Make/Brand/Type/Model */}
          <input
            name="makeBrand"
            value={form.makeBrand}
            onChange={handleChange}
            placeholder="Make / Brand"
            className="w-full px-3 py-2 border rounded-xl text-sm"
          />
          <input
            name="typeModel"
            value={form.typeModel}
            onChange={handleChange}
            placeholder="Type / Model"
            className="w-full px-3 py-2 border rounded-xl text-sm"
          />

        {/* City */}
        <select
          name="city"
          value={form.city}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-xl text-sm"
          required
        >
          <option value="">Select City *</option>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        {/* Category */}
        <select
          name="category"
          value={form.category}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-xl text-sm"
          required
        >
          <option value="">Select Category *</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>

        {/* Quantity + Unit */}
        <input
          name="quantity"
          value={form.quantity}
          onChange={handleChange}
          placeholder="Quantity *"
          className="w-full px-3 py-2 border rounded-xl text-sm"
          required
        />

        <select
          name="unit"
          value={form.unit}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-xl text-sm"
          required
        >
          <option value="">Unit *</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        {/* Details */}
        <textarea
          name="details"
          value={form.details}
          onChange={handleChange}
          rows={3}
          placeholder="Additional details (optional)"
          className="md:col-span-2 w-full px-3 py-2 border rounded-xl text-sm"
        />
        <div className="md:col-span-2">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Offer invited from
          </p>
          <div className="flex flex-col gap-2 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="offerInvitedFrom"
                value="city"
                checked={String(form.offerInvitedFrom || "city") === "city"}
                onChange={handleChange}
              />
              {session?.city || form.city || "Login city name"}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="offerInvitedFrom"
                value="anywhere"
                checked={String(form.offerInvitedFrom || "city") === "anywhere"}
                onChange={handleChange}
              />
              Anywhere
            </label>
          </div>
        </div>
        </div>

        {/* Attachments */}
        <div className="mt-3 mb-3">
          <label className="block text-sm font-medium mb-2">
            Attachments (jpg/jpeg, png, pdf, docx, xlsx)
          </label>
          <input
            id="buyer-requirement-doc"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95 cursor-pointer"
              aria-label="Capture photo"
              title="Capture photo"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9 4h6l1.2 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.8L9 4Zm3 4.5A4.5 4.5 0 1 0 12 17a4.5 4.5 0 0 0 0-9Zm0 2A2.5 2.5 0 1 1 12 15a2.5 2.5 0 0 1 0-5Z" />
              </svg>
            </button>
            <label
              htmlFor="buyer-requirement-doc"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:bg-emerald-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-95 cursor-pointer"
              aria-label="Share document"
              title="Share document"
              role="button"
              tabIndex={0}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5" />
              </svg>
            </label>
          </div>

          {existingAttachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {existingAttachments.map((fileUrl, index) => (
                (() => {
                  const typeMeta = getAttachmentTypeMeta(fileUrl, index);
                  return (
                    <div
                      key={`${String(fileUrl)}-${index}`}
                      className="flex items-center justify-between text-sm bg-gray-50 border rounded-lg px-3 py-2"
                    >
                      <span className="truncate inline-flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                        >
                          {typeMeta.label}
                        </span>
                        {getDisplayName(fileUrl, index)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeExistingAttachment(index)}
                        className="text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })()
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachments.map((file, index) => (
                (() => {
                  const typeMeta = getAttachmentTypeMeta(file, index);
                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between text-sm bg-gray-50 border rounded-lg px-3 py-2"
                    >
                      <span className="truncate inline-flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                        >
                          {typeMeta.label}
                        </span>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })()
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={uploading}
          className="hidden md:block w-full py-2 btn-brand rounded-xl font-semibold disabled:opacity-60 text-sm"
        >
          {uploading
            ? isEditMode
              ? "Saving..."
              : "Uploading..."
            : isEditMode
            ? "Update Requirement"
            : "Post Requirement"}
        </button>
            </form>
          </div>
        </div>
      </div>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--ui-border)] bg-white/95 backdrop-blur p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="submit"
          form="buyer-requirement-form"
          disabled={uploading}
          className="w-full py-3 btn-brand rounded-xl font-semibold disabled:opacity-60 text-sm"
        >
          {uploading
            ? isEditMode
              ? "Saving..."
              : "Uploading..."
            : isEditMode
            ? "Update Requirement"
            : "Post Requirement"}
        </button>
      </div>
      {cameraOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold">Capture Photo</h2>
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
              >
                Close
              </button>
            </div>
            {cameraError ? (
              <div className="text-sm text-red-600">
                {cameraError}
              </div>
            ) : (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-xl bg-black"
                />
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

      {otpStep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2">Verify Your Number</h2>
              <p className="text-gray-600 text-sm">
                OTP sent to WhatsApp at<br />
                <span className="font-semibold">{form.mobile}</span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                Enter 4-digit OTP
              </label>
              <input
                type="text"
                maxLength={4}
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 text-center text-2xl tracking-widest border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
                placeholder="_ _ _ _"
              />
              {otpError && (
                <p className="text-red-500 text-sm text-center mt-2">{otpError}</p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleOtpVerify}
                disabled={verifyingOtp || otpValue.length !== 4}
                className="w-full py-3 btn-brand rounded-xl font-semibold disabled:opacity-60"
              >
                {verifyingOtp ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpStep(false);
                  setOtpValue("");
                  setOtpError("");
                }}
                className="w-full py-2 text-gray-600 text-sm"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              Didn't receive OTP? Check your WhatsApp messages.
            </p>
          </div>
        </div>
      )}

      {/* WhatsApp Verify Popup */}
      {whatsappVerifyOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
            <h3 className="text-xl font-bold mb-4">Get WhatsApp Updates on Your Post</h3>
            <p className="text-gray-600 mb-6">
              Get instant notifications when sellers send you quotes. Click below to enable WhatsApp updates.
            </p>
            <button
              onClick={() => {
                window.open(buyerUpdatesWaLink, "_blank", "noopener,noreferrer");
                setWhatsappVerifyOpen(false);
                navigate("/buyer/dashboard?tab=posts", { replace: true });
              }}
              className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold mb-3 hover:bg-green-600"
            >
              Enable WhatsApp Updates
            </button>
            <button
              onClick={() => {
                setWhatsappVerifyOpen(false);
                navigate("/buyer/dashboard?tab=posts", { replace: true });
              }}
              className="w-full border border-gray-300 py-2 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}

