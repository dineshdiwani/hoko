const axios = require("axios");
const path = require("path");
const querystring = require("querystring");
const { resolvePublicAppUrl } = require("./publicAppUrl");

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveInstagramApiVersion() {
  return normalizeText(
    process.env.INSTAGRAM_GRAPH_API_VERSION ||
      process.env.META_GRAPH_API_VERSION ||
      "v20.0"
  );
}

function resolveInstagramUserId(userId = "") {
  return normalizeText(
    userId ||
      process.env.INSTAGRAM_USER_ID ||
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ||
      process.env.INSTAGRAM_ACCOUNT_ID ||
      process.env.META_PAGE_ID ||
      process.env.FACEBOOK_PAGE_ID ||
      ""
  );
}

function resolveInstagramAccessToken(accessToken = "") {
  return normalizeText(
    accessToken ||
      process.env.INSTAGRAM_ACCESS_TOKEN ||
      process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN ||
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
      ""
  );
}

function resolveInstagramGraphBaseUrl() {
  return `https://graph.facebook.com/${resolveInstagramApiVersion()}`;
}

function getInstagramConfigStatus() {
  const userId = resolveInstagramUserId();
  const accessToken = resolveInstagramAccessToken();
  return {
    configured: Boolean(userId && accessToken),
    instagramUserIdConfigured: Boolean(userId),
    accessTokenConfigured: Boolean(accessToken),
    instagramUserIdMasked: userId ? `${userId.slice(0, 4)}...${userId.slice(-4)}` : "",
    apiVersion: resolveInstagramApiVersion()
  };
}

function buildCaption(message = "", link = "") {
  const cleanMessage = normalizeText(message);
  const cleanLink = normalizeText(link);
  return [cleanMessage, cleanLink].filter(Boolean).join("\n\n").trim();
}

async function createInstagramMediaContainer({
  userId = "",
  accessToken = "",
  caption = "",
  imageUrl = ""
}) {
  const resolvedUserId = resolveInstagramUserId(userId);
  const resolvedToken = resolveInstagramAccessToken(accessToken);
  const resolvedCaption = normalizeText(caption);
  const resolvedImageUrl = normalizeText(imageUrl);

  if (!resolvedUserId) {
    throw new Error("Missing Instagram Business Account ID");
  }
  if (!resolvedToken) {
    throw new Error("Missing Instagram access token");
  }
  if (!resolvedImageUrl) {
    throw new Error("Missing Instagram image URL");
  }

  const payload = {
    access_token: resolvedToken,
    image_url: resolvedImageUrl,
    caption: resolvedCaption
  };

  const url = `${resolveInstagramGraphBaseUrl()}/${encodeURIComponent(resolvedUserId)}/media`;
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

  const creationId = String(data?.id || data?.creation_id || "").trim();
  if (!creationId) {
    throw new Error("Instagram media container creation failed");
  }

  return {
    creationId,
    raw: data
  };
}

async function publishInstagramMedia({
  userId = "",
  accessToken = "",
  creationId = ""
}) {
  const resolvedUserId = resolveInstagramUserId(userId);
  const resolvedToken = resolveInstagramAccessToken(accessToken);
  const resolvedCreationId = normalizeText(creationId);

  if (!resolvedUserId) {
    throw new Error("Missing Instagram Business Account ID");
  }
  if (!resolvedToken) {
    throw new Error("Missing Instagram access token");
  }
  if (!resolvedCreationId) {
    throw new Error("Missing Instagram creation id");
  }

  const payload = {
    access_token: resolvedToken,
    creation_id: resolvedCreationId
  };

  const url = `${resolveInstagramGraphBaseUrl()}/${encodeURIComponent(resolvedUserId)}/media_publish`;
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
    postId: String(data?.id || data?.media_id || "").trim(),
    raw: data
  };
}

function resolveInstagramPublicImageUrl(mediaFile = {}) {
  const explicit = normalizeText(mediaFile?.publicUrl || mediaFile?.url || "");
  if (explicit) return explicit;

  const fileName = normalizeText(mediaFile?.fileName || mediaFile?.originalname || "");
  if (!fileName) {
    return "";
  }

  const baseUrl = String(resolvePublicAppUrl() || "https://hokoapp.in").trim().replace(/\/+$/, "");
  return `${baseUrl}/uploads/social-media/${encodeURIComponent(path.basename(fileName))}`;
}

async function postInstagramImageUrl({ userId = "", accessToken = "", caption = "", imageUrl = "" }) {
  const container = await createInstagramMediaContainer({
    userId,
    accessToken,
    caption,
    imageUrl
  });
  const published = await publishInstagramMedia({
    userId,
    accessToken,
    creationId: container.creationId
  });

  return {
    postId: published.postId,
    creationId: container.creationId,
    raw: {
      container: container.raw,
      publish: published.raw
    }
  };
}

async function postInstagramImageFile({
  userId = "",
  accessToken = "",
  caption = "",
  mediaFile = null
}) {
  const imageUrl = resolveInstagramPublicImageUrl(mediaFile || {});
  if (!imageUrl) {
    throw new Error("Missing uploaded image");
  }

  return postInstagramImageUrl({
    userId,
    accessToken,
    caption,
    imageUrl
  });
}

async function postInstagramCampaign({
  userId = "",
  accessToken = "",
  message = "",
  link = "",
  mediaUrl = "",
  mediaFile = null
}) {
  const caption = buildCaption(message, link);

  if (mediaFile?.buffer || mediaFile?.fileName || mediaFile?.publicUrl) {
    return postInstagramImageFile({
      userId,
      accessToken,
      caption,
      mediaFile
    });
  }

  if (normalizeText(mediaUrl)) {
    return postInstagramImageUrl({
      userId,
      accessToken,
      caption,
      imageUrl: mediaUrl
    });
  }

  throw new Error("Instagram posts require an image URL or uploaded image");
}

module.exports = {
  buildCaption,
  createInstagramMediaContainer,
  getInstagramConfigStatus,
  postInstagramCampaign,
  postInstagramImageFile,
  postInstagramImageUrl,
  publishInstagramMedia,
  resolveInstagramAccessToken,
  resolveInstagramApiVersion,
  resolveInstagramGraphBaseUrl,
  resolveInstagramPublicImageUrl,
  resolveInstagramUserId,
  // Backward-compatible aliases for existing route imports.
  getMetaConfigStatus: getInstagramConfigStatus,
  postMetaCampaign: postInstagramCampaign,
  postMetaPhotoFile: postInstagramImageFile,
  postMetaPhotoUrl: postInstagramImageUrl,
  postMetaTextPost: postInstagramImageUrl,
  resolveMetaAccessToken: resolveInstagramAccessToken,
  resolveMetaApiVersion: resolveInstagramApiVersion,
  resolveMetaGraphBaseUrl: resolveInstagramGraphBaseUrl,
  resolveMetaPageId: resolveInstagramUserId
};
