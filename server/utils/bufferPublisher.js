const axios = require("axios");

const BUFFER_API_URL = "https://api.buffer.com";

function normalizeText(value) {
  return String(value || "").trim();
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

async function createBufferPost({
  draft,
  channelId,
  mode = "addToQueue",
  dueAt = "",
  text = "",
  imageUrl = ""
}) {
  const cleanChannelId = normalizeText(channelId);
  if (!cleanChannelId) {
    throw new Error("Buffer channel is required");
  }

  const cleanMode = mode === "customScheduled" ? "customScheduled" : "addToQueue";
  const cleanDueAt = normalizeText(dueAt);
  if (cleanMode === "customScheduled" && !cleanDueAt) {
    throw new Error("Schedule time is required for custom scheduling");
  }

  const postText = normalizeText(text) || composeDraftText(draft);
  if (!postText) {
    throw new Error("Post text is required");
  }

  const publicImageUrl = getPublicImageUrl(draft, imageUrl);
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

  const data = await bufferGraphql({
    query: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              text
              dueAt
              status
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
      hasImage: Boolean(publicImageUrl)
    }
  };
}

module.exports = {
  composeDraftText,
  createBufferPost,
  getBufferChannels,
  getBufferOrganizations
};
