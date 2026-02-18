import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchOptions } from "../../services/options";
import api from "../../services/api";
import { getAttachmentDisplayName } from "../../utils/attachments";

export default function RequirementForm() {
  const navigate = useNavigate();
  const { id: requirementId } = useParams();
  const isEditMode = Boolean(requirementId);

  const [form, setForm] = useState({
    city: "",
    category: "",
    product: "",
    makeBrand: "",
    typeModel: "",
    quantity: "",
    unit: "",
    details: ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingRequirement, setLoadingRequirement] = useState(isEditMode);
  const maxImageBytes = 100 * 1024;
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cities, setCities] = useState([
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Chennai",
    "Hyderabad",
    "Pune"
  ]);
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

  useEffect(() => {
    fetchOptions()
      .then((data) => {
        if (Array.isArray(data.cities) && data.cities.length) {
          setCities(data.cities);
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
          details: requirement.details || ""
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
      setForm((prev) => ({
        ...prev,
        city: prev.city || buyerPrefs.defaultCity || "",
        category: prev.category || buyerPrefs.defaultCategory || "",
        unit: prev.unit || buyerPrefs.defaultUnit || ""
      }));
    } catch {}
  }, []);

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
      !form.city ||
      !form.category ||
      !form.product ||
      !form.quantity ||
      !form.unit
    ) {
      alert("Please fill all required fields");
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
        city: form.city,
        category: form.category,
        productName: form.product,
        product: form.product,
        makeBrand: form.makeBrand,
        typeModel: form.typeModel,
        quantity: form.quantity,
        type: form.unit,
        details: form.details,
        attachments: [...existingAttachments, ...attachmentUrls]
      };

      if (isEditMode) {
        await api.put(`/buyer/requirement/${requirementId}`, payload);
      } else {
        await api.post("/buyer/requirement", payload);
      }

      alert(
        isEditMode
          ? "Requirement updated successfully"
          : "Requirement posted successfully"
      );
      navigate("/buyer/dashboard", { replace: true });
    } catch {
      alert(
        isEditMode
          ? "Failed to update requirement. Try again."
          : "Failed to post requirement. Try again."
      );
    } finally {
      setUploading(false);
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
              onSubmit={handleSubmit}
              className={`w-full bg-white rounded-2xl shadow p-4 pb-24 md:pb-4 ${
                submitted ? "form-submitted" : ""
              }`}
            >
            <h2 className="text-xl font-bold mb-4">
              Requirement Details
            </h2>

        <div className="grid gap-3 md:grid-cols-2">
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
          {categories.map((c) => (
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
        </div>

        {/* Attachments */}
        <div className="mt-3 mb-3">
          <label className="block text-sm font-medium mb-2">
            Attachments (jpg/jpeg, png, pdf, docx, xlsx)
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="px-4 py-2 border rounded-xl cursor-pointer text-sm">
              Upload Files
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="px-4 py-2 border rounded-xl text-sm"
            >
              Capture Photo
            </button>
          </div>

          {existingAttachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {existingAttachments.map((fileUrl, index) => (
                <div
                  key={`${String(fileUrl)}-${index}`}
                  className="flex items-center justify-between text-sm bg-gray-50 border rounded-lg px-3 py-2"
                >
                  <span className="truncate">
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
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachments.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between text-sm bg-gray-50 border rounded-lg px-3 py-2"
                >
                  <span className="truncate">
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
    </>
  );
}

