function sanitizeString(value) {
  return String(value || "").trim();
}

function basenameSafe(value) {
  const raw = sanitizeString(value).split("?")[0].split("#")[0];
  return decodeURIComponent(raw.split("/").pop() || "").trim();
}

export function parseAttachment(attachment, index = 0) {
  if (attachment && typeof attachment === "object") {
    const filename = basenameSafe(
      attachment.filename || attachment.url || attachment.path || ""
    );
    const originalName =
      sanitizeString(attachment.originalName || attachment.name) ||
      (filename ? filename.replace(/^[^_]+_\d+_/, "") : `Attachment ${index + 1}`);
    const url = filename ? `/uploads/requirements/${filename}` : "";
    return { url, filename, originalName };
  }

  const filename = basenameSafe(attachment);
  const originalName = filename
    ? filename.replace(/^[^_]+_\d+_/, "")
    : `Attachment ${index + 1}`;
  const url = filename ? `/uploads/requirements/${filename}` : "";
  return { url, filename, originalName };
}

export function extractAttachmentFileName(attachment, index = 0) {
  const parsed = parseAttachment(attachment, index);
  if (parsed.filename) return parsed.filename;
  return basenameSafe(parsed.originalName);
}

export function getAttachmentDisplayName(attachment, index = 0) {
  const parsed = parseAttachment(attachment, index);
  return parsed.originalName || `Attachment ${index + 1}`;
}

export function isImageAttachment(attachment, index = 0) {
  const lower = extractAttachmentFileName(attachment, index).toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png")
  );
}

function getExtension(value) {
  const clean = sanitizeString(value).toLowerCase();
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === clean.length - 1) return "";
  return clean.slice(dotIndex + 1);
}

export function getAttachmentTypeMeta(attachment, index = 0) {
  const parsed = parseAttachment(attachment, index);
  const ext = getExtension(parsed.filename || parsed.originalName);

  if (ext === "jpg" || ext === "jpeg") {
    return {
      label: "JPG",
      className: "border-blue-200 bg-blue-50 text-blue-700"
    };
  }
  if (ext === "png") {
    return {
      label: "PNG",
      className: "border-cyan-200 bg-cyan-50 text-cyan-700"
    };
  }
  if (ext === "pdf") {
    return {
      label: "PDF",
      className: "border-red-200 bg-red-50 text-red-700"
    };
  }
  if (ext === "doc" || ext === "docx") {
    return {
      label: "DOC",
      className: "border-indigo-200 bg-indigo-50 text-indigo-700"
    };
  }
  if (ext === "xls" || ext === "xlsx") {
    return {
      label: "XLS",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }
  return {
    label: "FILE",
    className: "border-gray-300 bg-gray-50 text-gray-700"
  };
}
