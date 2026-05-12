const axios = require("axios");
const XLSX = require("xlsx");

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getRowValue(row, aliases = []) {
  const lookup = new Map();
  for (const [key, value] of Object.entries(row || {})) {
    lookup.set(normalizeHeaderKey(key), value);
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    if (lookup.has(normalizedAlias)) {
      return lookup.get(normalizedAlias);
    }
  }

  return "";
}

function extractGoogleSheetId(inputUrl = "") {
  const text = String(inputUrl || "").trim();
  if (!text) return "";

  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (match?.[1]) {
    return match[1];
  }

  const fallback = text.match(/\/d\/([a-zA-Z0-9-_]+)/i);
  return fallback?.[1] || "";
}

function extractGoogleSheetGid(inputUrl = "") {
  const text = String(inputUrl || "").trim();
  if (!text) return "";

  const gidMatch = text.match(/[?#&]gid=([0-9]+)/i);
  return gidMatch?.[1] || "";
}

function resolveGoogleSheetCsvUrl(inputUrl = "") {
  const text = String(inputUrl || "").trim();
  if (!text) return "";

  if (/format=csv/i.test(text) || /export\?/.test(text) || /googleusercontent\.com/i.test(text)) {
    return text;
  }

  const sheetId = extractGoogleSheetId(text);
  if (!sheetId) {
    return text;
  }

  const gid = extractGoogleSheetGid(text);
  const gidPart = gid ? `&gid=${encodeURIComponent(gid)}` : "";
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv${gidPart}`;
}

async function fetchGoogleSheetRows(inputUrl = "") {
  const csvUrl = resolveGoogleSheetCsvUrl(inputUrl);
  if (!csvUrl) {
    throw new Error("Google Sheet URL required");
  }

  const response = await axios.get(csvUrl, {
    timeout: 15000,
    responseType: "text",
    headers: {
      Accept: "text/csv,text/plain,*/*"
    }
  });

  const rawText = String(response.data || "").trim();
  if (!rawText) {
    return [];
  }
  if (/<html/i.test(rawText) || /google sign in/i.test(rawText)) {
    throw new Error("Google Sheet must be public or published as CSV");
  }

  const workbook = XLSX.read(rawText, { type: "string" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false
  });

  return Array.isArray(rows) ? rows : [];
}

function getCampaignRowText(row, aliases = []) {
  return String(getRowValue(row, aliases) || "").trim();
}

function parseCampaignScheduleAt(row, defaultScheduleAt = null) {
  const raw =
    getRowValue(row, ["schedule_at", "publish_at", "scheduled_at", "date_time", "post_at"]) ||
    defaultScheduleAt ||
    "";
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeCampaignRow(row, { defaultScheduleAt = null, instagramUserId = "" } = {}) {
  const message = getCampaignRowText(row, ["message", "caption", "text", "content", "post_text"]);
  const link = getCampaignRowText(row, ["link", "url", "cta_url"]);
  const mediaUrl = getCampaignRowText(row, ["media_url", "media", "image_url", "image"]);
  const mediaModeRaw = getCampaignRowText(row, ["media_mode", "mode", "attachment_type"]);
  const mediaMode = ["url", "file", "none"].includes(mediaModeRaw.toLowerCase())
    ? mediaModeRaw.toLowerCase()
    : mediaUrl
    ? "url"
    : "none";
  const scheduleAt = parseCampaignScheduleAt(row, defaultScheduleAt);
  const rowInstagramUserId = getCampaignRowText(row, [
    "instagram_user_id",
    "instagram_business_account_id",
    "instagram_account_id",
    "page_id",
    "pageid",
    "facebook_page_id"
  ]);
  const resolvedInstagramUserId = rowInstagramUserId || instagramUserId;
  const title = getCampaignRowText(row, ["title", "name", "subject"]);
  const sheetStatus = getCampaignRowText(row, ["status", "state"]).toLowerCase();

  return {
    title,
    message,
    link,
    mediaMode,
    mediaUrl: mediaMode === "url" ? mediaUrl : "",
    scheduleAt,
    instagramUserId: resolvedInstagramUserId,
    status: sheetStatus,
    raw: row
  };
}

module.exports = {
  fetchGoogleSheetRows,
  getCampaignRowText,
  normalizeCampaignRow,
  resolveGoogleSheetCsvUrl
};
