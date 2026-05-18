const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { resolvePublicAppUrl } = require("./publicAppUrl");
const { generateImage } = require("./aiContentGenerator");

const AI_CONTENT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "social-media");

const BUFFER_API_URL = "https://api.buffer.com";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUrl(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function getFirstUrl(value = "") {
  const match = String(value || "").match(/https?:\/\/[^\s)]+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s)]*)?/i);
  return match ? normalizeUrl(match[0]) : "";
}

function getBufferApiKey() {
  return normalizeText(process.env.BUFFER_API_KEY);
}

function getGraphqlErrorMessage(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length) {
    return errors.map((item) => normalizeText(item?.message)).filter(Boolean).join("; ");
  }
  return "";
}

async function bufferGraphql({ query, variables = {} }) {
  const apiKey = getBufferApiKey();
  if (!apiKey) {
    throw new Error("BUFFER_API_KEY is not configured");
  }

  const response = await axios.post(
    BUFFER_API_URL,
    { query, variables },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = response?.data || {};
  const errorMessage = getGraphqlErrorMessage(data);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  return data.data || {};
}

async function getBufferOrganizations() {
  const data = await bufferGraphql({
    query: `
      query GetOrganizations {
        account {
          organizations {
            id
            name
          }
        }
      }
    `
  });
  return Array.isArray(data?.account?.organizations) ? data.account.organizations : [];
}

async function getBufferChannels(organizationId = "") {
  const orgId = normalizeText(organizationId) || normalizeText(process.env.BUFFER_ORGANIZATION_ID);
  const organizations = orgId ? [] : await getBufferOrganizations();
  const resolvedOrgId = orgId || normalizeText(organizations[0]?.id);
  if (!resolvedOrgId) {
    return { organizations, channels: [] };
  }

  const data = await bufferGraphql({
    query: `
      query GetChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id
          name
          service
        }
      }
    `,
    variables: { organizationId: resolvedOrgId }
  });

  return {
    organizations: organizations.length ? organizations : [{ id: resolvedOrgId, name: "" }],
    organizationId: resolvedOrgId,
    channels: Array.isArray(data?.channels) ? data.channels : []
  };
}

function composeDraftText(draft) {
  const pieces = [
    normalizeText(draft?.caption || draft?.hook),
    Array.isArray(draft?.hashtags) ? draft.hashtags.map(normalizeText).filter(Boolean).join(" ") : "",
    normalizeText(draft?.ctaLink)
  ].filter(Boolean);
  return pieces.join("\n\n").trim();
}

function getPublicImageUrl(draft, imageUrlOverride = "") {
  const value = normalizeText(imageUrlOverride) || normalizeText(draft?.imageUrl);
  if (!value || value.startsWith("data:")) return "";
  return /^https?:\/\//i.test(value) ? value : "";
}

function extensionFromMimeType(mimeType = "") {
  const cleanMime = normalizeText(mimeType).toLowerCase();
  if (cleanMime === "image/jpeg" || cleanMime === "image/jpg") return "jpg";
  if (cleanMime === "image/webp") return "webp";
  if (cleanMime === "image/gif") return "gif";
  return "png";
}

async function saveDataImageAsPublicUrl(value = "") {
  const text = normalizeText(value);
  const match = text.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return "";

  const mimeType = match[1];
  const data = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) return "";

  await fs.promises.mkdir(AI_CONTENT_UPLOAD_DIR, { recursive: true });
  const fileName = `ai-content-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extensionFromMimeType(mimeType)}`;
  await fs.promises.writeFile(path.join(AI_CONTENT_UPLOAD_DIR, fileName), buffer);
  return `${resolvePublicAppUrl()}/uploads/social-media/${encodeURIComponent(fileName)}`;
}

async function resolvePublicImageUrl(draft, imageUrlOverride = "") {
  const value = normalizeText(imageUrlOverride) || normalizeText(draft?.imageUrl);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("data:")) return saveDataImageAsPublicUrl(value);
  return "";
}

async function resolveOrGeneratePublicImageUrl(draft, imageUrlOverride = "") {
  const existingUrl = await resolvePublicImageUrl(draft, imageUrlOverride);
  if (existingUrl) return existingUrl;

  const imagePrompt = normalizeText(draft?.imagePrompt);
  if (!imagePrompt) return "";

  const generated = await generateImage({ imagePrompt });
  return resolvePublicImageUrl({ imageUrl: generated?.imageUrl || "" });
}

function getLinkAttachment(ctaLink = "") {
  const url = normalizeUrl(ctaLink);
  return url ? { linkAttachment: { url } } : null;
}

function getPostMetadata(service = "", postType = "post", ctaLink = "") {
  const cleanService = normalizeText(service).toLowerCase();
  const cleanType = ["post", "story", "reel"].includes(postType) ? postType : "post";
  const linkAttachment = getLinkAttachment(ctaLink);
  if (cleanService === "facebook") {
    return { facebook: { type: cleanType, ...(linkAttachment || {}) } };
  }
  if (cleanService === "linkedin") {
    return linkAttachment ? { linkedin: linkAttachment } : null;
  }
  if (cleanService === "instagram") {
    return {
      instagram: {
        type: cleanType,
        shouldShareToFeed: cleanType === "post",
        ...(ctaLink ? { link: normalizeUrl(ctaLink) } : {})
      }
    };
  }
  return null;
}

async function createBufferPost({
  draft,
  channelId,
  channelService = "",
  postType = "post",
  mode = "addToQueue",
  dueAt = "",
  text = "",
  imageUrl = ""
}) {
  const cleanChannelId = normalizeText(channelId);
  if (!cleanChannelId) {
    throw new Error("Buffer channel is required");
  }

  const allowedModes = new Set(["shareNow", "shareNext", "customScheduled", "addToQueue"]);
  const cleanMode = allowedModes.has(mode) ? mode : "shareNow";
  const cleanDueAt = normalizeText(dueAt);
  if (cleanMode === "customScheduled" && !cleanDueAt) {
    throw new Error("Schedule time is required for custom scheduling");
  }

  const postText = normalizeText(text) || composeDraftText(draft);
  if (!postText) {
    throw new Error("Post text is required");
  }

  const publicImageUrl = await resolveOrGeneratePublicImageUrl(draft, imageUrl);
  const cleanChannelService = normalizeText(channelService).toLowerCase();
  if (cleanChannelService === "instagram" && !publicImageUrl) {
    throw new Error("Instagram publishing requires a public image. Generate an image first, or use a draft with an image.");
  }
  const input = {
    text: postText,
    channelId: cleanChannelId,
    schedulingType: "automatic",
    mode: cleanMode
  };
  if (cleanMode === "customScheduled") {
    const parsedDueAt = new Date(cleanDueAt);
    if (Number.isNaN(parsedDueAt.getTime())) {
      throw new Error("Schedule time must be a valid date");
    }
    input.dueAt = parsedDueAt.toISOString();
  }
  if (publicImageUrl) {
    input.assets = [{ image: { url: publicImageUrl } }];
  }
  const metadata = getPostMetadata(channelService, postType, draft?.ctaLink || getFirstUrl(postText));
  if (metadata) {
    input.metadata = metadata;
  }

  const data = await bufferGraphql({
    query: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              text
              dueAt
              channelId
            }
          }
          ... on MutationError {
            message
          }
        }
      }
    `,
    variables: { input }
  });

  const result = data?.createPost;
  if (result?.message) {
    throw new Error(result.message);
  }
  if (!result?.post?.id) {
    throw new Error("Buffer did not return a post id");
  }

  return {
    post: result.post,
    request: {
      channelId: cleanChannelId,
      mode: cleanMode,
      dueAt: cleanDueAt,
      hasImage: Boolean(publicImageUrl),
      imageUrl: publicImageUrl
    }
  };
}

module.exports = {
  composeDraftText,
  createBufferPost,
  getBufferChannels,
  getBufferOrganizations,
  getPublicImageUrl,
  resolvePublicImageUrl,
  resolveOrGeneratePublicImageUrl
};
