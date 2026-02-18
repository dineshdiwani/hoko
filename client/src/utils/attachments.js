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
