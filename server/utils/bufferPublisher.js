const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const { resolvePublicAppUrl } = require("./publicAppUrl");
const { generateImage } = require("./aiContentGenerator");

const AI_CONTENT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "social-media");
const LOGO_CANDIDATES = [
  path.join(__dirname, "..", "..", "client", "public", "logo.png"),
  path.join(__dirname, "..", "..", "client", "public", "logo.jpg"),
  path.join(__dirname, "..", "public", "logo.png"),
  path.join(__dirname, "..", "public", "logo.jpg")
];

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

function detectImageInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return { mimeType: "", extension: "", width: 0, height: 0 };
  }
  if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a && buffer.length >= 24) {
    return {
      mimeType: "image/png",
      extension: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)
        && offset + 8 < buffer.length
      ) {
        return {
          mimeType: "image/jpeg",
          extension: "jpg",
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5)
        };
      }
      offset += 2 + length;
    }
    return { mimeType: "image/jpeg", extension: "jpg", width: 0, height: 0 };
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    if (buffer.toString("ascii", 12, 16) === "VP8X" && buffer.length >= 30) {
      return {
        mimeType: "image/webp",
        extension: "webp",
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
    if (buffer.toString("ascii", 12, 16) === "VP8 " && buffer.length >= 30) {
      return {
        mimeType: "image/webp",
        extension: "webp",
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff
      };
    }
    if (buffer.toString("ascii", 12, 16) === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        mimeType: "image/webp",
        extension: "webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1
      };
    }
    return { mimeType: "image/webp", extension: "webp", width: 0, height: 0 };
  }
  if (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a") {
    return {
      mimeType: "image/gif",
      extension: "gif",
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8)
    };
  }
  return { mimeType: "", extension: "", width: 0, height: 0 };
}

function extensionFromUrl(value = "") {
  const pathname = (() => {
    try {
      return new URL(value).pathname;
    } catch {
      return "";
    }
  })();
  const extension = path.extname(pathname).replace(".", "").toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(extension) ? (extension === "jpeg" ? "jpg" : extension) : "";
}

async function saveImageBufferAsPublicUrl(buffer, mimeType = "", sourceUrl = "") {
  if (!buffer?.length) return "";
  const detected = detectImageInfo(buffer);
  const cleanMime = normalizeText(mimeType).split(";")[0].toLowerCase();
  if (!detected.mimeType && !cleanMime.startsWith("image/")) {
    throw new Error("Image file could not be recognized as a valid image");
  }
  if (detected.mimeType && (!detected.width || !detected.height)) {
    throw new Error("Image dimensions could not be read before Buffer publishing");
  }

  await fs.promises.mkdir(AI_CONTENT_UPLOAD_DIR, { recursive: true });
  let normalizedBuffer = await sharp(buffer)
    .rotate()
    .resize(1024, 1024, {
      fit: "cover",
      position: "centre"
    })
    .jpeg({
      quality: 90,
      mozjpeg: true
    })
    .toBuffer();

  const logoPath = LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (logoPath) {
    const badgeSize = 142;
    const margin = 32;
    const logoSize = 104;
    const badgeSvg = Buffer.from(`
      <svg width="${badgeSize}" height="${badgeSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="28" ry="28" fill="white" fill-opacity="0.88"/>
      </svg>
    `);
    const logoBuffer = await sharp(logoPath)
      .resize(logoSize, logoSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    const left = margin;
    const top = margin;
    normalizedBuffer = await sharp(normalizedBuffer)
      .composite([
        { input: badgeSvg, left, top },
        { input: logoBuffer, left: left + Math.round((badgeSize - logoSize) / 2), top: top + Math.round((badgeSize - logoSize) / 2) }
      ])
      .jpeg({
        quality: 90,
        mozjpeg: true
      })
      .toBuffer();
  }
  const normalizedInfo = detectImageInfo(normalizedBuffer);
  if (!normalizedInfo.width || !normalizedInfo.height) {
    throw new Error("Normalized image dimensions could not be read before Buffer publishing");
  }
  const fileName = `ai-content-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.jpg`;
  await fs.promises.writeFile(path.join(AI_CONTENT_UPLOAD_DIR, fileName), normalizedBuffer);
  return `${resolvePublicAppUrl()}/api/uploads/social-media/${encodeURIComponent(fileName)}`;
}

async function saveDataImageAsPublicUrl(value = "") {
  const text = normalizeText(value);
  const match = text.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return "";

  const mimeType = match[1];
  const data = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) return "";

  return saveImageBufferAsPublicUrl(buffer, mimeType);
}

function isOwnPublicUploadUrl(value = "") {
  const publicBase = normalizeText(resolvePublicAppUrl()).replace(/\/+$/, "");
  const url = normalizeText(value);
  return Boolean(
    publicBase
    && (
      url.startsWith(`${publicBase}/uploads/social-media/`)
      || url.startsWith(`${publicBase}/api/uploads/social-media/`)
    )
  );
}

async function cacheRemoteImageAsPublicUrl(value = "") {
  const url = normalizeText(value);
  if (!/^https?:\/\//i.test(url)) return "";
  if (isOwnPublicUploadUrl(url)) return url;

  const response = await axios.get(url, {
    timeout: 45000,
    responseType: "arraybuffer",
    maxRedirects: 5,
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "HOKO-AI-Content/1.0"
    }
  });
  const mimeType = normalizeText(response.headers?.["content-type"]).split(";")[0];
  if (mimeType && !mimeType.startsWith("image/")) {
    throw new Error(`Image URL returned ${mimeType} instead of an image`);
  }
  return saveImageBufferAsPublicUrl(Buffer.from(response.data), mimeType, url);
}

async function resolvePublicImageUrl(draft, imageUrlOverride = "") {
  const value = normalizeText(imageUrlOverride) || normalizeText(draft?.imageUrl);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return cacheRemoteImageAsPublicUrl(value);
  if (value.startsWith("data:")) return saveDataImageAsPublicUrl(value);
  return "";
}

async function verifyPublicImageUrl(value = "") {
  const url = normalizeText(value);
  if (!url) return;
  const response = await axios.get(url, {
    timeout: 30000,
    responseType: "arraybuffer",
    maxRedirects: 5,
    headers: {
      Accept: "image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5",
      "User-Agent": "BufferImageCheck/1.0"
    }
  });
  const mimeType = normalizeText(response.headers?.["content-type"]).split(";")[0].toLowerCase();
  const buffer = Buffer.from(response.data);
  const info = detectImageInfo(buffer);
  if (response.status >= 400) {
    throw new Error(`Public image URL returned HTTP ${response.status}`);
  }
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Public image URL returned ${mimeType || "unknown content type"} instead of image`);
  }
  if (!info.width || !info.height) {
    throw new Error("Public image URL is reachable but image dimensions could not be read");
  }
}

async function resolveOrGeneratePublicImageUrl(draft, imageUrlOverride = "") {
  const existingUrl = await resolvePublicImageUrl(draft, imageUrlOverride);
  if (existingUrl) return existingUrl;

  const imagePrompt = normalizeText(draft?.imagePrompt);
  if (!imagePrompt) return "";

  const generated = await generateImage({
    imagePrompt,
    settings: {
      imageProvider: normalizeText(draft?.imageProvider)
    },
    draft,
    category: draft?.categorySnapshot || {},
    campaign: {}
  });
  return resolvePublicImageUrl({ imageUrl: generated?.imageUrl || "" });
}

function getLinkAttachment(ctaLink = "") {
  const url = normalizeUrl(ctaLink);
  return url ? { linkAttachment: { url } } : null;
}

function getPostMetadata(service = "", postType = "post", ctaLink = "", hasImage = false) {
  const cleanService = normalizeText(service).toLowerCase();
  const cleanType = ["post", "story", "reel"].includes(postType) ? postType : "post";
  const linkAttachment = hasImage ? null : getLinkAttachment(ctaLink);
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
        ...(!hasImage && ctaLink ? { link: normalizeUrl(ctaLink) } : {})
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
  if (publicImageUrl) {
    await verifyPublicImageUrl(publicImageUrl);
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
    input.assets = {
      images: [{ url: publicImageUrl }]
    };
  }
  const metadata = getPostMetadata(channelService, postType, draft?.ctaLink || getFirstUrl(postText), Boolean(publicImageUrl));
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
              assets {
                id
                mimeType
                source
              }
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
