const axios = require("axios");
const querystring = require("querystring");

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveMetaApiVersion() {
  return normalizeText(process.env.META_GRAPH_API_VERSION || "v20.0");
}

function resolveMetaPageId(pageId = "") {
  return normalizeText(
    pageId ||
      process.env.META_PAGE_ID ||
      process.env.FACEBOOK_PAGE_ID ||
      ""
  );
}

function resolveMetaAccessToken(accessToken = "") {
  return normalizeText(
    accessToken ||
      process.env.META_PAGE_ACCESS_TOKEN ||
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
      ""
  );
}

function resolveMetaGraphBaseUrl() {
  return `https://graph.facebook.com/${resolveMetaApiVersion()}`;
}

function getMetaConfigStatus() {
  const pageId = resolveMetaPageId();
  const accessToken = resolveMetaAccessToken();
  return {
    configured: Boolean(pageId && accessToken),
    pageIdConfigured: Boolean(pageId),
    accessTokenConfigured: Boolean(accessToken),
    pageIdMasked: pageId ? `${pageId.slice(0, 4)}...${pageId.slice(-4)}` : "",
    apiVersion: resolveMetaApiVersion()
  };
}

async function postMetaTextPost({ pageId = "", accessToken = "", message = "", link = "" }) {
  const resolvedPageId = resolveMetaPageId(pageId);
  const resolvedToken = resolveMetaAccessToken(accessToken);
  const resolvedMessage = normalizeText(message);
  const resolvedLink = normalizeText(link);

  if (!resolvedPageId) {
    throw new Error("Missing Meta Page ID");
  }
  if (!resolvedToken) {
    throw new Error("Missing Meta access token");
  }
  if (!resolvedMessage && !resolvedLink) {
    throw new Error("Message or link is required");
  }

  const payload = {
    access_token: resolvedToken,
    message: resolvedMessage
  };
  if (resolvedLink) {
    payload.link = resolvedLink;
  }

  const url = `${resolveMetaGraphBaseUrl()}/${encodeURIComponent(resolvedPageId)}/feed`;
  const response = await axios.post(url, querystring.stringify(payload), {
    timeout: 15000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const data = response?.data || {};
  if (data?.error) {
    throw new Error(
      typeof data?.error?.message === "string" && data.error.message.trim()
        ? data.error.message.trim()
        : JSON.stringify(data).slice(0, 600)
    );
  }

  return {
    postId: String(data?.id || data?.post_id || "").trim(),
    raw: data
  };
}

async function postMetaPhotoUrl({ pageId = "", accessToken = "", message = "", mediaUrl = "" }) {
  const resolvedPageId = resolveMetaPageId(pageId);
  const resolvedToken = resolveMetaAccessToken(accessToken);
  const resolvedMessage = normalizeText(message);
  const resolvedMediaUrl = normalizeText(mediaUrl);

  if (!resolvedPageId) {
    throw new Error("Missing Meta Page ID");
  }
  if (!resolvedToken) {
    throw new Error("Missing Meta access token");
  }
  if (!resolvedMediaUrl) {
    throw new Error("Missing media URL");
  }

  const payload = {
    access_token: resolvedToken,
    url: resolvedMediaUrl,
    published: "true"
  };
  if (resolvedMessage) {
    payload.caption = resolvedMessage;
  }

  const url = `${resolveMetaGraphBaseUrl()}/${encodeURIComponent(resolvedPageId)}/photos`;
  const response = await axios.post(url, querystring.stringify(payload), {
    timeout: 15000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const data = response?.data || {};
  if (data?.error) {
    throw new Error(
      typeof data?.error?.message === "string" && data.error.message.trim()
        ? data.error.message.trim()
        : JSON.stringify(data).slice(0, 600)
    );
  }

  return {
    postId: String(data?.post_id || data?.id || "").trim(),
    raw: data
  };
}

async function postMetaPhotoFile({ pageId = "", accessToken = "", message = "", mediaFile = null }) {
  const resolvedPageId = resolveMetaPageId(pageId);
  const resolvedToken = resolveMetaAccessToken(accessToken);
  const resolvedMessage = normalizeText(message);

  if (!resolvedPageId) {
    throw new Error("Missing Meta Page ID");
  }
  if (!resolvedToken) {
    throw new Error("Missing Meta access token");
  }
  if (!mediaFile?.buffer) {
    throw new Error("Missing media file");
  }
  if (typeof fetch !== "function" || typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error("This runtime does not support multipart upload helpers");
  }

  const form = new FormData();
  form.append("published", "true");
  form.append("access_token", resolvedToken);
  if (resolvedMessage) {
    form.append("caption", resolvedMessage);
  }

  const blob = new Blob([mediaFile.buffer], {
    type: mediaFile.mimetype || "application/octet-stream"
  });
  form.append("source", blob, mediaFile.originalname || "upload.jpg");

  const url = `${resolveMetaGraphBaseUrl()}/${encodeURIComponent(resolvedPageId)}/photos`;
  const response = await fetch(url, {
    method: "POST",
    body: form
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(
      typeof data?.error?.message === "string" && data.error.message.trim()
        ? data.error.message.trim()
        : typeof data?.message === "string" && data.message.trim()
        ? data.message.trim()
        : `Meta API request failed (${response.status})`
    );
  }

  return {
    postId: String(data?.post_id || data?.id || "").trim(),
    raw: data
  };
}

async function postMetaCampaign({ pageId = "", accessToken = "", message = "", link = "", mediaUrl = "", mediaFile = null }) {
  if (mediaFile?.buffer) {
    return postMetaPhotoFile({ pageId, accessToken, message, mediaFile });
  }

  if (normalizeText(mediaUrl)) {
    return postMetaPhotoUrl({ pageId, accessToken, message, mediaUrl });
  }

  return postMetaTextPost({ pageId, accessToken, message, link });
}

module.exports = {
  getMetaConfigStatus,
  postMetaCampaign,
  postMetaPhotoFile,
  postMetaPhotoUrl,
  postMetaTextPost,
  resolveMetaAccessToken,
  resolveMetaApiVersion,
  resolveMetaGraphBaseUrl,
  resolveMetaPageId
};
