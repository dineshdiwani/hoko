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

function getProviderErrorMessage(err, fallback = "provider_request_failed") {
  return normalizeText(err?.response?.data?.error?.message)
    || normalizeText(err?.response?.data?.message)
    || normalizeText(err?.message)
    || fallback;
}

function normalizeAiProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  return ["gemini", "openai", "fallback"].includes(provider) ? provider : "gemini";
}

function normalizeImageProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  return ["gemini", "modelslab", "none"].includes(provider) ? provider : "modelslab";
}

function resolveImageProvider(settings = {}) {
  const textProvider = normalizeAiProvider(settings?.aiProvider);
  const imageProvider = normalizeImageProvider(settings?.imageProvider || process.env.AI_CONTENT_IMAGE_PROVIDER);
  if (textProvider === "openai" && imageProvider === "gemini") {
    return "modelslab";
  }
  return imageProvider;
}

function extractResponseText(payload) {
  const geminiText = Array.isArray(payload?.candidates)
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

function extractGeminiInlineImage(payload) {
  const parts = Array.isArray(payload?.candidates)
    ? payload.candidates.flatMap((candidate) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    : [];

  for (const part of parts) {
    const inlineData = part?.inlineData || part?.inline_data;
    const data = normalizeText(inlineData?.data);
    if (data) {
      return {
        mimeType: normalizeText(inlineData?.mimeType || inlineData?.mime_type) || "image/png",
        data
      };
    }
  }

  return null;
}

function hashText(value = "") {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildFallbackDraft({ category, fixedCta, campaign = {} }) {
  const name = normalizeText(category?.name) || "Business";
  const mood = normalizeText(campaign?.mood);
  const lowerName = name.toLowerCase();
  const seed = [
    name,
    normalizeText(category?.description),
    normalizeText(category?.targetAudience),
    mood,
    new Date().toISOString().slice(0, 10)
  ].join("|");
  const angles = [
    {
      topic: `Compare seller quotes for ${lowerName}`,
      hook: `Need ${lowerName} without chasing every supplier? Share it on HOKO, compare seller offers, and move ahead with the price that fits.`
    },
    {
      topic: `Bring suppliers into one price comparison`,
      hook: `One ${lowerName} requirement. Multiple seller prices. HOKO helps you see the better deal before you decide.`
    },
    {
      topic: `Use reverse auction for ${lowerName} buying`,
      hook: `Buying ${lowerName}? Put the requirement on HOKO and use reverse auction when you want sellers to sharpen their offers.`
    },
    {
      topic: `Reduce quote follow-ups for ${lowerName}`,
      hook: `Stop collecting ${lowerName} prices one by one. HOKO brings seller offers to your requirement so comparison is faster.`
    },
    {
      topic: `Find the practical offer for ${lowerName}`,
      hook: `For your next ${lowerName} purchase, let HOKO line up seller offers clearly: compare price, choose confidently, save time.`
    },
    {
      topic: `Turn a buying need into seller responses`,
      hook: `${name} needed soon? Add the requirement on HOKO and let interested sellers respond with prices you can compare.`
    },
    {
      topic: `Make ${lowerName} buying less scattered`,
      hook: `No more scattered calls for ${lowerName} quotes. HOKO keeps the requirement and seller offers in one clear place.`
    },
    {
      topic: `Give sellers a reason to compete`,
      hook: `When sellers see the same ${lowerName} requirement on HOKO, price comparison becomes easier and reverse auction can push offers further.`
    },
    {
      topic: `Move from enquiry to comparison`,
      hook: `Have a ${lowerName} enquiry? Put it on HOKO, get seller prices, and compare before you commit.`
    },
    {
      topic: `Choose with clearer price visibility`,
      hook: `HOKO makes ${lowerName} buying more transparent: one requirement, visible seller offers, and a better way to choose.`
    }
  ];
  const selected = angles[hashText(seed) % angles.length];
  const topic = mood || selected.topic;
  const hook = selected.hook;
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
      mood ? `Follow this admin visual direction exactly: "${mood}".` : `Depict this hook visually: "${hook}"`,
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
  const brandInstructions = normalizeText(campaign?.brandInstructions);
  const blockedWords = Array.isArray(campaign?.blockedWords)
    ? campaign.blockedWords.map(normalizeText).filter(Boolean)
    : [];
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
    campaignMood ? "If the mood/direction includes a concrete visual scene, objects, people, product, or setting, the imagePrompt must preserve those exact visual requirements." : "",
    audienceMode && audienceMode !== "auto" ? `Audience focus: ${audienceMode}.` : "Audience focus: choose the strongest audience automatically.",
    imageStyle && imageStyle !== "auto" ? `Preferred image style/background: ${imageStyle}.` : "Choose image environment/background automatically.",
    useAppScreenshots ? "If helpful, ask for a clean app screenshot/mockup placement in the image prompt without inventing unreadable UI text." : "Do not require app screenshots unless the hook clearly benefits from a phone mockup.",
    brandInstructions ? `Brand instructions: ${brandInstructions}.` : "",
    blockedWords.length ? `Do not use these blocked words or phrases: ${blockedWords.join(", ")}.` : "",
    `Category: ${normalizeText(category?.name)}.`,
    `Optional category context: ${normalizeText(category?.description) || "not provided"}.`,
    `Optional target audience: ${normalizeText(category?.targetAudience) || "buyers and sellers in this category"}.`,
    `Tone: ${normalizeText(category?.tone) || "professional"}.`,
    `Image style: ${normalizeText(category?.imageStyle) || "clean business social image"}.`,
    `Fixed CTA: ${normalizeText(fixedCta) || "Learn More"}.`,
    "Return only valid JSON with keys: topic, hook, caption, hashtags, imagePrompt.",
    "topic: a fresh category-specific buyer pain point, buying scenario, urgency, comparison benefit, negotiation angle, or seller-response angle. Do not copy the category name alone.",
    "hook: one or two short lines only. Make it attractive, direct, and conversion-oriented, but vary the sentence structure.",
    "Every hook must mention HOKO and at least one core value: posting a requirement, comparing seller offers, choosing a lower/better price, or using reverse auction.",
    "Do not use this repeated pattern or close variants: 'Post your [category] requirement on HOKO and let sellers compete with price offers. Pick the best deal, or start a reverse auction for sharper prices.'",
    "Avoid starting every hook with 'Post your'. Use varied openings such as a buyer problem, a question, a contrast, a time-saving angle, a price-comparison angle, or a category-specific buying situation.",
    "Write the hook as fresh advertising copy, not a feature explanation. Make it feel different from previous generic HOKO drafts.",
    "Prefer hooks that create curiosity or urgency, but do not exaggerate, promise guaranteed savings, or make unverifiable guarantees.",
    "Use plain Indian business English. Avoid generic lines like grow your business, discover opportunities, or connect buyers and sellers unless tied to price offers.",
    "caption: repeat the hook only. Do not add extra copy. CTA is stored separately as button text.",
    "imagePrompt: describe a concrete square social post image that visually depicts the exact hook, with the selected category/product as the main visual subject.",
    campaignMood ? "imagePrompt must include the concrete scene from today's campaign mood/direction. Do not replace it with a generic marketplace workflow." : "",
    "Image prompt must name specific visible objects, setting, and buyer/seller action for the category. Avoid generic business scenes.",
    "Image prompt must show buyer requirement, seller price offers, price comparison, and reverse auction where relevant, but these should support the category/product visual, not replace it.",
    "Avoid unreadable text, fake screenshots, platform logos, or celebrity/brand references.",
    "Hashtags must be an array of 3 to 6 strings. Do not include markdown fences."
  ].filter(Boolean).join(" ");
}

function buildFinalImagePrompt({ imagePrompt = "", draft = {}, category = {}, campaign = {} }) {
  const categoryName = normalizeText(category?.name || draft?.categorySnapshot?.name) || "business requirement";
  const hook = normalizeText(draft?.hook || draft?.caption || draft?.topic);
  const mood = normalizeText(campaign?.mood);
  const audienceMode = normalizeText(campaign?.audienceMode);
  const imageStyle = normalizeText(campaign?.imageStyle);
  const categoryStyle = normalizeText(category?.imageStyle);
  const concreteSubject = normalizeText(draft?.topic) || categoryName;
  const sceneFocus = [
    `Create one square 1:1 social media advertising image for this exact post topic: ${concreteSubject}.`,
    mood ? `Hard admin visual instruction: ${mood}. This instruction has priority over generic marketplace visuals.` : "",
    `Primary visual subject: ${categoryName}. The image must clearly show real items, tools, shop/warehouse context, or service context from this category.`,
    hook ? `Match this exact post message visually: "${hook}".` : "",
    "Do not make a generic office, handshake, abstract app promotion, or random business meeting.",
    "The first thing visible should be the category/product need, then the HOKO buying workflow.",
    mood ? "When admin visual instruction names a specific product or people, show those exact objects and people prominently." : "",
    "Show a buyer with the relevant product/category requirement, and 2-3 seller price offers as simple large visual cards or price tags only if they fit naturally.",
    "Show comparison of prices/offers visually, but avoid small unreadable text. Use simple symbolic numbers or price tags only if readable.",
    "If the post says 'needed soon', show urgency with practical buying context such as a shop counter, warehouse shelf, contractor site, or procurement desk.",
    "If reverse auction is relevant, show sellers competing with downward price arrows or offer cards.",
    audienceMode && audienceMode !== "auto" ? `Audience focus: ${audienceMode}.` : "",
    imageStyle && imageStyle !== "auto" ? `Requested style/background: ${imageStyle}.` : "",
    categoryStyle ? `Category style hint: ${categoryStyle}.` : "",
    normalizeText(imagePrompt) ? `Additional visual direction: ${normalizeText(imagePrompt)}.` : "",
    "Use Indian marketplace/business context. Make the scene practical and product-specific.",
    "Do not include readable small text, fake social media UI, platform logos, brand logos, celebrity faces, watermarks, or distorted hands.",
    "If showing an app/phone, keep UI symbolic and simple; do not invent detailed unreadable screens.",
    "High quality, clean composition, realistic commercial illustration or polished ad visual."
  ].filter(Boolean);
  return sceneFocus.join(" ");
}

async function generateTextDraft({ category, settings, campaign = {} }) {
  const fixedCta = normalizeText(settings?.fixedCta) || "Learn More";
  const fallback = buildFallbackDraft({
    category,
    fixedCta,
    campaign
  });
  const provider = normalizeAiProvider(settings?.aiProvider);
  if (provider === "fallback") {
    return fallback;
  }
  if (provider === "openai") {
    return generateOpenAiTextDraft({ category, settings, campaign, fallback, fixedCta });
  }

  const apiKey = normalizeText(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY);
  if (!apiKey) return fallback;

  const model = normalizeText(process.env.GEMINI_CONTENT_MODEL) || "gemini-2.5-flash";
  let response;
  try {
      response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildPrompt({
                  category,
                  fixedCta,
                  campaign: {
                    ...campaign,
                    brandInstructions: campaign?.brandInstructions ?? settings?.brandInstructions,
                    blockedWords: campaign?.blockedWords ?? settings?.blockedWords
                  }
                })
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      },
      {
        timeout: 30000,
        params: { key: apiKey },
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    return {
      ...fallback,
      provider: "fallback",
      model: "",
      raw: err?.response?.data || err?.message || null,
      error: err?.response?.status === 429
        ? "gemini_rate_limited"
        : getProviderErrorMessage(err, "gemini_text_generation_failed")
    };
  }

  const raw = response?.data || null;
  const parsed = safeJsonParse(extractResponseText(raw));
  if (!parsed) {
    return {
      ...fallback,
      provider: "gemini",
      model,
      raw
    };
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((item) => normalizeText(item)).filter(Boolean)
    : fallback.hashtags;

  return {
    provider: "gemini",
    model,
    topic: normalizeText(parsed.topic) || fallback.topic,
    hook: normalizeText(parsed.hook) || fallback.hook,
    caption: normalizeText(parsed.caption) || fallback.caption,
    hashtags,
    imagePrompt: normalizeText(parsed.imagePrompt) || fallback.imagePrompt,
    raw
  };
}

async function generateOpenAiTextDraft({ category, settings, campaign = {}, fallback, fixedCta }) {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return {
      ...fallback,
      provider: "fallback",
      model: "",
      error: "openai_api_key_missing"
    };
  }

  const model = normalizeText(process.env.OPENAI_CONTENT_MODEL) || "gpt-4o-mini";
  let response;
  try {
    response = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model,
        input: buildPrompt({
          category,
          fixedCta,
          campaign: {
            ...campaign,
            brandInstructions: campaign?.brandInstructions ?? settings?.brandInstructions,
            blockedWords: campaign?.blockedWords ?? settings?.blockedWords
          }
        }),
        text: {
          format: {
            type: "json_object"
          }
        }
      },
      {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    return {
      ...fallback,
      provider: "fallback",
      model: "",
      raw: err?.response?.data || err?.message || null,
      error: getProviderErrorMessage(err, "openai_text_generation_failed")
    };
  }

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

function extractModelsLabImageUrl(payload) {
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  const directUrl = outputs.find((item) => /^https?:\/\//i.test(normalizeText(item)));
  const proxyLinks = Array.isArray(payload?.proxy_links) ? payload.proxy_links : [];
  const proxyUrl = proxyLinks.find((item) => /^https?:\/\//i.test(normalizeText(item)));
  return directUrl || proxyUrl || normalizeText(payload?.future_links?.[0]) || "";
}

async function fetchModelsLabImage({ apiKey, requestId }) {
  const id = normalizeText(requestId);
  if (!id) return null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await axios.post(
      `https://modelslab.com/api/v6/images/fetch/${encodeURIComponent(id)}`,
      { key: apiKey },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    const raw = response?.data || null;
    const imageUrl = extractModelsLabImageUrl(raw);
    if (imageUrl) {
      return {
        raw,
        imageUrl
      };
    }
    if (!["processing", "pending", "queued"].includes(normalizeText(raw?.status).toLowerCase())) {
      return {
        raw,
        imageUrl: ""
      };
    }
  }

  return null;
}

async function generateModelsLabImage({ imagePrompt, draft = {}, category = {}, campaign = {} }) {
  const apiKey = normalizeText(process.env.MODELSLAB_API_KEY || process.env.MODELSLAB_KEY);
  if (!apiKey) {
    return {
      provider: "none",
      model: "",
      imageUrl: "",
      raw: null,
      error: "modelslab_api_key_missing"
    };
  }

  const model = normalizeText(process.env.MODELSLAB_IMAGE_MODEL) || "flux";
  const response = await axios.post(
    "https://modelslab.com/api/v6/images/text2img",
    {
      key: apiKey,
      prompt: buildFinalImagePrompt({ imagePrompt, draft, category, campaign }),
      model_id: model,
      width: "1024",
      height: "1024",
      samples: "1",
      safety_checker: false,
      enhance_prompt: true,
      webhook: null,
      track_id: null
    },
    {
      timeout: 90000,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  const raw = response?.data || null;
  let imageUrl = extractModelsLabImageUrl(raw);
  let finalRaw = raw;
  if (!imageUrl && ["processing", "pending", "queued"].includes(normalizeText(raw?.status).toLowerCase())) {
    const fetched = await fetchModelsLabImage({ apiKey, requestId: raw?.id });
    imageUrl = fetched?.imageUrl || "";
    finalRaw = fetched?.raw || raw;
  }
  return {
    provider: "modelslab",
    model,
    imageUrl,
    raw: finalRaw,
    error: imageUrl ? "" : normalizeText(finalRaw?.message || raw?.message) || "modelslab_image_not_returned"
  };
}

async function generateGeminiImage({ imagePrompt, draft = {}, category = {}, campaign = {} }) {
  const apiKey = normalizeText(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY);
  if (!apiKey) {
    return {
      provider: "none",
      model: "",
      imageUrl: "",
      raw: null
    };
  }

  const model = normalizeText(process.env.GEMINI_IMAGE_MODEL) || "gemini-2.5-flash-image";
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Generate one square social media image for this prompt.",
                "Return an image output.",
                buildFinalImagePrompt({ imagePrompt, draft, category, campaign })
              ].filter(Boolean).join(" ")
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    },
    {
      timeout: 90000,
      params: { key: apiKey },
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  const raw = response?.data || null;
  const image = extractGeminiInlineImage(raw);
  if (image?.data) {
    return {
      provider: "gemini",
      model,
      imageUrl: `data:${image.mimeType};base64,${image.data}`,
      raw
    };
  }

  return {
    provider: "gemini",
    model,
    imageUrl: "",
    raw,
    error: "gemini_image_not_returned"
  };
}

async function generateImage({ imagePrompt, settings = {}, draft = {}, category = {}, campaign = {} }) {
  const provider = resolveImageProvider(settings);
  if (provider === "none" || process.env.AI_CONTENT_GENERATE_IMAGES !== "true") {
    return {
      provider: "none",
      model: "",
      imageUrl: "",
      raw: null
    };
  }
  if (provider === "gemini") {
    return generateGeminiImage({ imagePrompt, draft, category, campaign });
  }
  return generateModelsLabImage({ imagePrompt, draft, category, campaign });
}

async function generateAiContentDraft({ category, settings, campaign = {}, generateImages = true }) {
  const textDraft = await generateTextDraft({ category, settings, campaign });
  let imageResult = {
    provider: "none",
    model: "",
    imageUrl: "",
    raw: null
  };

  if (generateImages) {
    try {
      imageResult = await generateImage({
        imagePrompt: textDraft.imagePrompt,
        settings,
        draft: textDraft,
        category,
        campaign
      });
    } catch (err) {
      imageResult = {
        provider: "failed",
        model: normalizeText(process.env.MODELSLAB_IMAGE_MODEL || process.env.GEMINI_IMAGE_MODEL),
        imageUrl: "",
        raw: err?.response?.data || err?.message || null,
        error: getProviderErrorMessage(err, "image_generation_failed")
      };
    }
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
  generateTextDraft,
  extractGeminiInlineImage
};
