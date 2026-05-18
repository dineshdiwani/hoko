const axios = require("axios");

function normalizeText(value) {
  return String(value || "").trim();
}

function stripCodeFences(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function safeJsonParse(value) {
  const text = stripCodeFences(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const geminiText = Array.isArray(payload.candidates)
    ? payload.candidates
        .flatMap((candidate) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
        .map((part) => normalizeText(part?.text))
        .filter(Boolean)
        .join("\n")
        .trim()
    : "";
  if (geminiText) {
    return geminiText;
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const pieces = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        pieces.push(content.text.trim());
      }
    }
  }
  return pieces.join("\n").trim();
}

function buildFallbackDraft({
  brief = "",
  audience = "",
  tone = "professional",
  mediaStyle = "",
  includeHashtags = true
}) {
  const cleanBrief = normalizeText(brief);
  const cleanAudience = normalizeText(audience);
  const cleanTone = normalizeText(tone) || "professional";
  const cleanMediaStyle = normalizeText(mediaStyle);
  const captionParts = [
    cleanBrief || "Share a concise campaign update.",
    cleanAudience ? `For ${cleanAudience}.` : "",
    `Tone: ${cleanTone}.`
  ].filter(Boolean);

  const hashtags = includeHashtags
    ? ["#Hoko", "#Campaign", "#Business"]
    : [];

  return {
    provider: "fallback",
    model: "",
    caption: captionParts.join(" ").trim(),
    mediaPrompt: cleanMediaStyle
      ? `Design an image for a ${cleanMediaStyle} campaign based on: ${cleanBrief || "the provided campaign brief"}.`
      : `Design a matching image for: ${cleanBrief || "the provided campaign brief"}.`,
    hashtags,
    raw: null
  };
}

function buildGeminiPrompt({
  brief = "",
  audience = "",
  tone = "professional",
  mediaStyle = "",
  includeHashtags = true,
  platform = "instagram"
}) {
  return [
    "You are writing a social media campaign draft for a business admin panel.",
    `Platform: ${platform}.`,
    `Tone: ${tone}.`,
    audience ? `Audience: ${audience}.` : "Audience: general business audience.",
    brief ? `Brief: ${brief}.` : "Brief: create a fresh campaign caption.",
    mediaStyle ? `Media style: ${mediaStyle}.` : "Media style: not specified.",
    `Include hashtags: ${includeHashtags ? "yes" : "no"}.`,
    "Return valid JSON with keys: caption, mediaPrompt, hashtags, cta, notes.",
    "Keep the caption short enough for an Instagram post. If hashtags are included, return them as an array of strings.",
    "Do not wrap the JSON in markdown fences."
  ].join(" ");
}

async function generateSocialMediaDraft({
  brief = "",
  audience = "",
  tone = "professional",
  mediaStyle = "",
  includeHashtags = true,
  platform = "instagram"
} = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return buildFallbackDraft({ brief, audience, tone, mediaStyle, includeHashtags });
  }

  const model = String(process.env.GEMINI_CAMPAIGN_MODEL || process.env.GEMINI_CONTENT_MODEL || "gemini-2.5-flash").trim();
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildGeminiPrompt({
              brief,
              audience,
              tone,
              mediaStyle,
              includeHashtags,
              platform
            })
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, payload, {
    timeout: 30000,
    params: { key: apiKey },
    headers: {
      "Content-Type": "application/json"
    }
  });

  const data = response?.data || {};
  const extractedText = extractResponseText(data);
  const parsed = safeJsonParse(extractedText);

  if (!parsed) {
    return {
      provider: "gemini",
      model,
      caption: extractedText || buildFallbackDraft({ brief, audience, tone, mediaStyle, includeHashtags }).caption,
      mediaPrompt: buildFallbackDraft({ brief, audience, tone, mediaStyle, includeHashtags }).mediaPrompt,
      hashtags: includeHashtags ? [] : [],
      raw: data
    };
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  return {
    provider: "gemini",
    model,
    caption: normalizeText(parsed.caption) || buildFallbackDraft({ brief, audience, tone, mediaStyle, includeHashtags }).caption,
    mediaPrompt: normalizeText(parsed.mediaPrompt) || buildFallbackDraft({ brief, audience, tone, mediaStyle, includeHashtags }).mediaPrompt,
    hashtags,
    cta: normalizeText(parsed.cta),
    notes: normalizeText(parsed.notes),
    raw: data
  };
}

module.exports = {
  buildFallbackDraft,
  generateSocialMediaDraft,
  extractResponseText,
  safeJsonParse
};
