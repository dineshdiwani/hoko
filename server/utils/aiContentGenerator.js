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

function buildFallbackDraft({ category, fixedCta, campaign = {} }) {
  const name = normalizeText(category?.name) || "Business";
  const mood = normalizeText(campaign?.mood);
  const topic = mood || `Get competing seller offers for ${name.toLowerCase()} requirements`;
  const hook = `Post your ${name.toLowerCase()} requirement on HOKO and let sellers compete with price offers. Pick the best deal, or start a reverse auction for sharper prices.`;
  const caption = [
    hook
  ].filter(Boolean).join("\n\n");

  return {
    provider: "fallback",
    model: "",
    topic,
    hook,
    caption,
    hashtags: ["#HOKO", "#Business", `#${name.replace(/[^a-zA-Z0-9]/g, "")}`].filter((item) => item.length > 1),
    imagePrompt: [
      `Create a square social media image for the HOKO online marketplace app about ${name}.`,
      `Depict this hook visually: "${hook}"`,
      "Show a buyer posting a requirement, multiple sellers submitting price offers, best lower-price offer selection, and reverse auction competition.",
      `Style: ${normalizeText(category?.imageStyle) || "clean modern Indian business app ad"}.`,
      "Do not add small unreadable text. Avoid fake app UI details."
    ].join(" "),
    raw: null
  };
}

function buildPrompt({ category, fixedCta, campaign = {} }) {
  const campaignMood = normalizeText(campaign?.mood);
  const audienceMode = normalizeText(campaign?.audienceMode);
  const imageStyle = normalizeText(campaign?.imageStyle);
  const useAppScreenshots = Boolean(campaign?.useAppScreenshots);
  return [
    "Create one automated social media draft to market the HOKO app.",
    "Core HOKO positioning:",
    "HOKO is an online marketplace for buyers and sellers.",
    "Buyers post their requirements in a category.",
    "Sellers post price offers on those buyer requirements.",
    "Buyers compare offers and choose the best or lower-price offer.",
    "Buyers can also invoke reverse auction so sellers compete further and improve their prices.",
    "The content must make this marketplace value instantly clear to the audience.",
    "The admin selects only a category; you must choose the topic yourself based on that category.",
    "The system only generates drafts and images; it does not publish.",
    campaignMood ? `Today's campaign mood/direction: ${campaignMood}.` : "",
    audienceMode && audienceMode !== "auto" ? `Audience focus: ${audienceMode}.` : "Audience focus: choose the strongest audience automatically.",
    imageStyle && imageStyle !== "auto" ? `Preferred image style/background: ${imageStyle}.` : "Choose image environment/background automatically.",
    useAppScreenshots ? "If helpful, ask for a clean app screenshot/mockup placement in the image prompt without inventing unreadable UI text." : "Do not require app screenshots unless the hook clearly benefits from a phone mockup.",
    `Category: ${normalizeText(category?.name)}.`,
    `Optional category context: ${normalizeText(category?.description) || "not provided"}.`,
    `Optional target audience: ${normalizeText(category?.targetAudience) || "buyers and sellers in this category"}.`,
    `Tone: ${normalizeText(category?.tone) || "professional"}.`,
    `Image style: ${normalizeText(category?.imageStyle) || "clean business social image"}.`,
    `Fixed CTA: ${normalizeText(fixedCta) || "Learn More"}.`,
    "Return only valid JSON with keys: topic, hook, caption, hashtags, imagePrompt.",
    "topic: a fresh buyer pain point or benefit for this category, not copied from the category name.",
    "hook: one or two short lines only. Make it attractive, direct, and conversion-oriented.",
    "Every hook must mention HOKO and at least one core value: post requirement, compare seller offers, choose lower price, or reverse auction.",
    "Prefer hooks that create curiosity or urgency, but do not exaggerate or make unverifiable guarantees.",
    "Use plain Indian business English. Avoid generic lines like grow your business, discover opportunities, or connect buyers and sellers unless tied to price offers.",
    "caption: repeat the hook only. Do not add extra copy. CTA is stored separately as button text.",
    "imagePrompt: describe an AI image that visually depicts the hook and the HOKO marketplace workflow for this category.",
    "Image prompt must request a square social post showing buyer requirement, seller price offers, price comparison, and reverse auction where relevant.",
    "Avoid unreadable text, fake screenshots, platform logos, or celebrity/brand references.",
    "Hashtags must be an array of 3 to 6 strings. Do not include markdown fences."
  ].filter(Boolean).join(" ");
}

async function generateTextDraft({ category, settings, campaign = {} }) {
  const fixedCta = normalizeText(settings?.fixedCta) || "Learn More";
  const fallback = buildFallbackDraft({
    category,
    fixedCta,
    campaign
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
        campaign
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

async function generateAiContentDraft({ category, settings, campaign = {} }) {
  const textDraft = await generateTextDraft({ category, settings, campaign });
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
