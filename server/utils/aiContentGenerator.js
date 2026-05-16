const axios = require("axios");

function normalizeText(value) {
  return String(value || "").trim();
}

function stripCodeFences(value = "") {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
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
  if (typeof payload?.output_text === "string") {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }
  return chunks.join("\n").trim();
}

function buildFallbackDraft({ category, fixedCta, brandInstructions }) {
  const name = normalizeText(category?.name) || "Business";
  const audience = normalizeText(category?.targetAudience) || "buyers and sellers";
  const topic = `Find verified ${name.toLowerCase()} leads faster`;
  const hook = `Need ${name.toLowerCase()} leads without chasing everywhere? HOKO connects ${audience} in one simple app.`;
  const caption = [
    hook,
    fixedCta ? fixedCta : ""
  ].filter(Boolean).join("\n\n");

  return {
    provider: "fallback",
    model: "",
    topic,
    hook,
    caption,
    hashtags: ["#HOKO", "#Business", `#${name.replace(/[^a-zA-Z0-9]/g, "")}`].filter((item) => item.length > 1),
    imagePrompt: [
      `Create a square social media image for the HOKO app about ${name}.`,
      `Depict this hook visually: "${hook}"`,
      "Show a modern mobile app, buyer-seller connection, lead discovery, and trust.",
      `Style: ${normalizeText(category?.imageStyle) || "clean modern Indian business app ad"}.`,
      "Do not add small unreadable text. Avoid fake app UI details."
    ].join(" "),
    raw: null
  };
}

function buildPrompt({ category, fixedCta, brandInstructions }) {
  return [
    "Create one automated social media draft to market the HOKO app.",
    "HOKO is a buyer-seller business app where buyers post requirements and sellers find relevant leads.",
    "The admin selects only a category; you must choose the topic yourself based on that category.",
    "The system only generates drafts and images; it does not publish.",
    `Category: ${normalizeText(category?.name)}.`,
    `Optional category context: ${normalizeText(category?.description) || "not provided"}.`,
    `Optional target audience: ${normalizeText(category?.targetAudience) || "buyers and sellers in this category"}.`,
    `Tone: ${normalizeText(category?.tone) || "professional"}.`,
    `Image style: ${normalizeText(category?.imageStyle) || "clean business social image"}.`,
    `Fixed CTA: ${normalizeText(fixedCta) || "Learn More"}.`,
    brandInstructions ? `Brand instructions: ${normalizeText(brandInstructions)}.` : "",
    "Return only valid JSON with keys: topic, hook, caption, hashtags, imagePrompt.",
    "topic: a fresh marketing angle for HOKO in this category, not copied from the category name.",
    "hook: one or two short lines only, written to market the HOKO app. Mention HOKO naturally.",
    "caption: use the hook plus the fixed CTA. Keep it short; no long paragraph.",
    "imagePrompt: describe an AI image that visually depicts the hook and HOKO app value for this category.",
    "Image prompt must request a square social post, mobile app/business lead visual, and avoid unreadable text.",
    "Hashtags must be an array of 3 to 6 strings. Do not include markdown fences."
  ].filter(Boolean).join(" ");
}

async function generateTextDraft({ category, settings }) {
  const fixedCta = normalizeText(settings?.fixedCta) || "Learn More";
  const fallback = buildFallbackDraft({
    category,
    fixedCta,
    brandInstructions: settings?.brandInstructions
  });
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return fallback;

  const model = normalizeText(process.env.OPENAI_CONTENT_MODEL) || "gpt-5.4-mini";
  const response = await axios.post(
    "https://api.openai.com/v1/responses",
    {
      model,
      input: buildPrompt({
        category,
        fixedCta,
        brandInstructions: settings?.brandInstructions
      })
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  const raw = response?.data || null;
  const parsed = safeJsonParse(extractResponseText(raw));
  if (!parsed) {
    return {
      ...fallback,
      provider: "openai",
      model,
      raw
    };
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((item) => normalizeText(item)).filter(Boolean)
    : fallback.hashtags;

  return {
    provider: "openai",
    model,
    topic: normalizeText(parsed.topic) || fallback.topic,
    hook: normalizeText(parsed.hook) || fallback.hook,
    caption: normalizeText(parsed.caption) || fallback.caption,
    hashtags,
    imagePrompt: normalizeText(parsed.imagePrompt) || fallback.imagePrompt,
    raw
  };
}

async function generateImage({ imagePrompt }) {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey || process.env.AI_CONTENT_GENERATE_IMAGES === "false") {
    return {
      provider: "none",
      model: "",
      imageUrl: "",
      raw: null
    };
  }

  const model = normalizeText(process.env.OPENAI_IMAGE_MODEL) || "gpt-image-1";
  const response = await axios.post(
    "https://api.openai.com/v1/images/generations",
    {
      model,
      prompt: normalizeText(imagePrompt),
      size: normalizeText(process.env.OPENAI_IMAGE_SIZE) || "1024x1024"
    },
    {
      timeout: 60000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  const raw = response?.data || null;
  const first = Array.isArray(raw?.data) ? raw.data[0] : null;
  const b64 = normalizeText(first?.b64_json);
  return {
    provider: "openai",
    model,
    imageUrl: normalizeText(first?.url) || (b64 ? `data:image/png;base64,${b64}` : ""),
    raw
  };
}

async function generateAiContentDraft({ category, settings }) {
  const textDraft = await generateTextDraft({ category, settings });
  let imageResult = {
    provider: "none",
    model: "",
    imageUrl: "",
    raw: null
  };

  try {
    imageResult = await generateImage({ imagePrompt: textDraft.imagePrompt });
  } catch (err) {
    imageResult = {
      provider: "failed",
      model: normalizeText(process.env.OPENAI_IMAGE_MODEL) || "gpt-image-1",
      imageUrl: "",
      raw: err?.response?.data || err?.message || null,
      error: err?.message || "image_generation_failed"
    };
  }

  return {
    ...textDraft,
    imageUrl: imageResult.imageUrl,
    imageProvider: imageResult.provider,
    imageModel: imageResult.model,
    rawImageResponse: imageResult.raw,
    imageError: imageResult.error || ""
  };
}

module.exports = {
  generateAiContentDraft,
  generateImage,
  generateTextDraft
};
