const fs = require("fs");
const path = require("path");

function stripQueryAndHash(value) {
  return String(value || "").split("?")[0].split("#")[0];
}

function basenameSafe(value) {
  return path.basename(stripQueryAndHash(String(value || "").trim()));
}

function displayNameFromStoredFilename(filename) {
  const base = basenameSafe(filename);
  if (!base) return "";
  return base.replace(/^[^_]+_\d+_/, "");
}

function normalizeRequirementAttachmentValues(value) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => {
      if (typeof item === "string") {
        const raw = item.trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/requirements/")) return raw;
        const clean = basenameSafe(raw);
        return clean ? `/uploads/requirements/${clean}` : "";
      }

      if (item && typeof item === "object") {
        const raw = String(item.url || item.path || item.filename || "").trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/requirements/")) return raw;
        const clean = basenameSafe(raw);
        return clean ? `/uploads/requirements/${clean}` : "";
      }

      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function normalizeAttachmentForResponse(attachment, index = 0) {
  if (typeof attachment === "string") {
    const filename = basenameSafe(attachment);
    return {
      url: filename ? `/uploads/requirements/${filename}` : "",
      filename,
      originalName: displayNameFromStoredFilename(filename) || `Attachment ${index + 1}`
    };
  }

  if (attachment && typeof attachment === "object") {
    const filename = basenameSafe(
      attachment.filename || attachment.url || attachment.path || ""
    );
    const originalName =
      String(attachment.originalName || attachment.name || "").trim() ||
      displayNameFromStoredFilename(filename) ||
      `Attachment ${index + 1}`;
    return {
      url: filename ? `/uploads/requirements/${filename}` : "",
      filename,
      originalName
    };
  }

  return {
    url: "",
    filename: "",
    originalName: `Attachment ${index + 1}`
  };
}

function normalizeRequirementAttachmentsForResponse(requirementLike) {
  const doc =
    requirementLike && typeof requirementLike.toObject === "function"
      ? requirementLike.toObject()
      : { ...(requirementLike || {}) };

  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  doc.attachments = attachments.map((item, index) =>
    normalizeAttachmentForResponse(item, index)
  );
  return doc;
}

function extractStoredRequirementFilename(attachment) {
  if (!attachment) return "";

  if (typeof attachment === "string") {
    return basenameSafe(attachment);
  }

  if (typeof attachment === "object") {
    const fromFilename = basenameSafe(attachment.filename || "");
    if (fromFilename) return fromFilename;
    const fromUrl = basenameSafe(attachment.url || "");
    if (fromUrl) return fromUrl;
    const fromPath = basenameSafe(attachment.path || "");
    if (fromPath) return fromPath;
  }

  return "";
}

function extractAttachmentAliases(attachment) {
  const aliases = new Set();

  const pushAlias = (value) => {
    const base = basenameSafe(value);
    if (!base) return;
    aliases.add(base.toLowerCase());
    const displayName = displayNameFromStoredFilename(base);
    if (displayName) {
      aliases.add(displayName.toLowerCase());
    }
  };

  if (typeof attachment === "string") {
    pushAlias(attachment);
  }

  if (attachment && typeof attachment === "object") {
    pushAlias(attachment.url);
    pushAlias(attachment.path);
    pushAlias(attachment.filename);
    pushAlias(attachment.originalName);
    pushAlias(attachment.name);
  }

  return aliases;
}

module.exports = {
  normalizeRequirementAttachmentValues,
  normalizeRequirementAttachmentsForResponse,
  extractStoredRequirementFilename,
  extractAttachmentAliases,
  displayNameFromStoredFilename,
  resolveAttachmentFilenameOnDisk
};

function resolveAttachmentFilenameOnDisk(
  uploadDir,
  { preferredFilename = "", requestedFilename = "", buyerId = "" } = {}
) {
  const preferred = basenameSafe(preferredFilename);
  const requested = basenameSafe(requestedFilename).toLowerCase();
  const buyerPrefix = String(buyerId || "").trim();

  if (!requested && !preferred) return "";

  const directCandidates = Array.from(
    new Set([preferred, requested].map((v) => basenameSafe(v)).filter(Boolean))
  );

  for (const candidate of directCandidates) {
    const fullPath = path.join(uploadDir, candidate);
    if (fs.existsSync(fullPath)) {
      return candidate;
    }
  }

  let files = [];
  try {
    files = fs.readdirSync(uploadDir);
  } catch {
    return "";
  }

  const normalized = files
    .map((name) => basenameSafe(name))
    .filter(Boolean);
  const lowerByName = new Map(normalized.map((name) => [name.toLowerCase(), name]));

  if (requested && lowerByName.has(requested)) {
    return lowerByName.get(requested);
  }

  const scoped = buyerPrefix
    ? normalized.filter((name) => name.startsWith(`${buyerPrefix}_`))
    : normalized;

  const suffixMatch = scoped.find((name) =>
    name.toLowerCase().endsWith(`_${requested}`)
  );
  if (suffixMatch) return suffixMatch;

  const displayMatch = scoped.find(
    (name) => displayNameFromStoredFilename(name).toLowerCase() === requested
  );
  if (displayMatch) return displayMatch;

  return "";
}
