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

function isServiceCategory(text = "") {
  return /insurance|loan|finance|bank|legal|consult|service|health|life|policy|motor insurance|vehicle insurance/i.test(text);
}

function hasInsuranceContext(text = "") {
  return /insurance|policy|life|health|motor insurance|vehicle insurance|claim|premium/i.test(text);
}

function getHumanCategoryLabel(name = "") {
  const cleanName = normalizeText(name);
  if (hasInsuranceContext(cleanName)) {
    return "life, health, or motor insurance";
  }
  return cleanName.toLowerCase();
}

const CONTENT_ANGLES = [
  "Curiosity",
  "FOMO",
  "Relatability",
  "Social proof",
  "Transformation",
  "Humor where relevant",
  "Local pride",
  "Emotional connection",
  "Problem-solving",
  "Trend adaptation"
];

function buildImageTextOverlay({ angle = "", categoryName = "", hook = "" }) {
  const label = getHumanCategoryLabel(categoryName);
  const options = [
    "Compare Before You Buy",
    "Better Offers Start Here",
    "Need It Soon?",
    "One Requirement. Many Offers.",
    "Stop Chasing Quotes",
    "Choose Smarter",
    "Offers Worth Comparing",
    "Local Sellers. Clear Prices."
  ];
  if (/insurance|policy|premium/i.test(`${label} ${hook}`)) {
    options.push("Compare Policy Offers", "Premiums Made Clear", "Cover That Fits");
  }
  if (angle === "FOMO" || /soon|urgent|limited/i.test(hook)) {
    options.push("Do Not Miss Better Offers", "Needed Soon?");
  }
  return options[hashText(`${angle}|${categoryName}|${hook}|overlay`) % options.length];
}

function buildHashtags({ categoryName = "", angle = "", seed = "" }) {
  const categoryTag = `#${normalizeText(categoryName).replace(/[^a-zA-Z0-9]/g, "")}`;
  const angleTags = {
    Curiosity: ["#CompareFirst", "#SmartBuying"],
    FOMO: ["#DontMissBetterOffers", "#NeededSoon"],
    Relatability: ["#BusinessBuying", "#NoMoreFollowUps"],
    "Social proof": ["#SellerOffers", "#MarketPrices"],
    Transformation: ["#BuySmarter", "#ClearComparison"],
    "Humor where relevant": ["#BuyingMadeSimple", "#QuoteChasing"],
    "Local pride": ["#LocalBusiness", "#LocalSellers"],
    "Emotional connection": ["#LessStress", "#ClearChoices"],
    "Problem-solving": ["#PriceComparison", "#RequirementToOffers"],
    "Trend adaptation": ["#SmartBuyers", "#DigitalProcurement"],
    Urgency: ["#ActFast", "#QuickQuotes"]
  };
  const options = angleTags[angle] || ["#SmartBuying", "#SellerOffers"];
  const picked = options[hashText(`${seed}|hashtag`) % options.length];
  return ["#HOKO", categoryTag, picked].filter((item) => item.length > 1);
}

function buildChannelCaptions({ hook = "", hashtags = [], ctaLink = "" }) {
  const cleanHook = normalizeText(hook);
  const tagText = Array.isArray(hashtags) ? hashtags.map(normalizeText).filter(Boolean).join(" ") : "";
  const link = normalizeText(ctaLink);
  return {
    facebook: [cleanHook, "Compare seller offers on HOKO.", tagText, link].filter(Boolean).join("\n\n"),
    instagram: [cleanHook, tagText].filter(Boolean).join("\n\n"),
    linkedin: [cleanHook, "A practical way for buyers to post requirements and compare seller responses before deciding.", link].filter(Boolean).join("\n\n")
  };
}

function normalizeTargetPlatforms(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const allowed = new Set(["facebook", "instagram", "linkedin"]);
  const normalized = source
    .map((item) => normalizeText(item).toLowerCase().replace(/[_\s-]+/g, ""))
    .map((item) => {
      if (item === "fb" || item === "facebookpage") return "facebook";
      if (item === "ig" || item === "insta") return "instagram";
      if (item === "linkedln") return "linkedin";
      return item;
    })
    .filter((item) => allowed.has(item));
  return Array.from(new Set(normalized));
}

function inferTargetPlatforms({ category = {}, topic = "", hook = "" } = {}) {
  const text = [
    category?.name,
    category?.description,
    category?.targetAudience,
    topic,
    hook
  ].map(normalizeText).join(" ").toLowerCase();

  const linkedinSignals = [
    /\bb2b\b/,
    /\bcorporate\b/,
    /\bindustrial\b/,
    /\bmanufactur/,
    /\benterprise\b/,
    /\bprocurement\b/,
    /\bwholesale\b/,
    /\bbulk\b/,
    /\btender\b/,
    /\bdealer\b/,
    /\bdistributor\b/,
    /\bsupplier\b/,
    /\bfactory\b/,
    /\bwarehouse\b/,
    /\bconstruction\b/,
    /\bmachinery\b/,
    /\bequipment\b/,
    /\belectrical\b/,
    /\bcommercial\b/,
    /\boffice\b/,
    /\bcontractor\b/,
    /\bconsulting\b/,
    /\blegal\b/,
    /\bfinance\b/,
    /\binsurance\b/
  ];
  const consumerSignals = [
    /\bb2c\b/,
    /\bdomestic\b/,
    /\bhome\b/,
    /\bhousehold\b/,
    /\bfamily\b/,
    /\bpersonal\b/,
    /\blocal\b/,
    /\bretail\b/,
    /\bfashion\b/,
    /\bgrocery\b/,
    /\bfurniture\b/,
    /\bkitchen\b/,
    /\bappliance\b/,
    /\bmobile\b/,
    /\bphone\b/,
    /\bvehicle\b/,
    /\bbike\b/,
    /\bcar\b/,
    /\bevent\b/,
    /\btravel\b/,
    /\bbeauty\b/,
    /\bfitness\b/
  ];

  const isLinkedin = linkedinSignals.some((pattern) => pattern.test(text));
  const isConsumer = consumerSignals.some((pattern) => pattern.test(text));
  if (isLinkedin && !isConsumer) return ["linkedin"];
  if (isLinkedin && isConsumer) return ["linkedin", "facebook", "instagram"];
  return ["facebook", "instagram"];
}

function buildFallbackDraft({ category, fixedCta, campaign = {} }) {
  const name = normalizeText(category?.name) || "Business";
  const mood = normalizeText(campaign?.mood);
  const lowerName = getHumanCategoryLabel(name);
  const seed = [
    name,
    normalizeText(category?.description),
    normalizeText(category?.targetAudience),
    mood,
    new Date().toISOString(),
    Math.random().toString(36).slice(2)
  ].join("|");
  const creativeAngle = CONTENT_ANGLES[hashText(`${seed}|angle`) % CONTENT_ANGLES.length];
  const genericAngles = [
    {
      angle: "Problem-solving",
      topic: `Compare seller quotes for ${lowerName}`,
      hook: `Need ${lowerName} without chasing every supplier? Share it on HOKO, compare seller offers, and move ahead with the price that fits.`
    },
    {
      angle: "Curiosity",
      topic: `What changes when sellers quote in one place`,
      hook: `What happens when your ${lowerName} requirement reaches multiple sellers on HOKO? You get prices you can compare before deciding.`
    },
    {
      angle: "FOMO",
      topic: `Use reverse auction for ${lowerName} buying`,
      hook: `Buying ${lowerName} soon? Do not decide on the first quote. Put it on HOKO and let more sellers respond.`
    },
    {
      angle: "Relatability",
      topic: `Reduce quote follow-ups for ${lowerName}`,
      hook: `Stop collecting ${lowerName} prices one by one. HOKO brings seller offers to your requirement so comparison is faster.`
    },
    {
      angle: "Transformation",
      topic: `Find the practical offer for ${lowerName}`,
      hook: `Turn your next ${lowerName} purchase from scattered calls into one clear HOKO comparison.`
    },
    {
      angle: "Urgency",
      topic: `Turn a buying need into seller responses`,
      hook: `${name} needed soon? Add the requirement on HOKO and let interested sellers respond with prices you can compare.`
    },
    {
      angle: "Emotional connection",
      topic: `Make ${lowerName} buying less scattered`,
      hook: `Buying should feel clear, not chaotic. HOKO keeps your ${lowerName} requirement and seller offers in one place.`
    },
    {
      angle: "Social proof",
      topic: `Give sellers a reason to compete`,
      hook: `More sellers seeing the same ${lowerName} requirement means better comparison for the buyer on HOKO.`
    },
    {
      angle: "Local pride",
      topic: `Move from enquiry to comparison`,
      hook: `Local buyers deserve clear seller offers. Put your ${lowerName} requirement on HOKO and compare before you commit.`
    },
    {
      angle: "Trend adaptation",
      topic: `Choose with clearer price visibility`,
      hook: `Smart buyers compare before they commit. HOKO brings ${lowerName} seller offers into one clearer view.`
    }
  ];
  const insuranceAngles = [
    {
      angle: "Curiosity",
      topic: `Compare insurance quotes before deciding`,
      hook: `Looking for ${lowerName}? Put one requirement on HOKO and compare policy offers before you choose.`
    },
    {
      angle: "Relatability",
      topic: `Bring insurance sellers to one enquiry`,
      hook: `Life, health, or motor cover should not need scattered calls. HOKO helps sellers respond to one clear requirement.`
    },
    {
      angle: "Problem-solving",
      topic: `See policy offers side by side`,
      hook: `Use HOKO to collect ${lowerName} offers in one place, then compare premium, cover fit, and seller response clearly.`
    },
    {
      angle: "Social proof",
      topic: `Make insurance buying easier to compare`,
      hook: `One insurance requirement on HOKO can bring multiple seller responses, so the buyer can compare before moving ahead.`
    },
    {
      angle: "Urgency",
      topic: `Get practical insurance offers faster`,
      hook: `Need ${lowerName} for business or family needs? Add the requirement on HOKO and review seller offers without repeat follow-ups.`
    },
    {
      angle: "Transformation",
      topic: `Turn policy enquiry into seller responses`,
      hook: `HOKO turns one ${lowerName} enquiry into comparable seller offers, helping buyers choose with better visibility.`
    }
  ];
  const angles = hasInsuranceContext(`${name} ${category?.description || ""}`) ? insuranceAngles : genericAngles;
  const angleMatches = angles.filter((item) => item.angle === creativeAngle);
  const sourceAngles = angleMatches.length ? angleMatches : angles;
  const selected = sourceAngles[hashText(`${seed}|selected`) % sourceAngles.length];
  const topic = mood || selected.topic;
  const hook = selected.hook;
  const imageTextOverlay = buildImageTextOverlay({ angle: selected.angle, categoryName: name, hook });
  const concreteScene = inferConcreteVisualScene({ mood, categoryName: name, hook });
  const serviceCategory = isServiceCategory(`${name} ${category?.description || ""}`);
  const visualOpeners = serviceCategory ? [
    `Square service-offer comparison scene: ${concreteScene}.`,
    `Realistic Indian advisory scene for ${name}: ${concreteScene}.`,
    `Service marketplace visual for ${name}: ${concreteScene}.`,
    `Policy and offer comparison image showing ${concreteScene}.`
  ] : [
    `Square social media ad scene: ${concreteScene}.`,
    `Product-first visual for ${name}: ${concreteScene}.`,
    `Realistic Indian procurement scene for ${name}: ${concreteScene}.`,
    `Commercial marketplace image showing ${concreteScene}.`
  ];
  const visualOpener = visualOpeners[hashText(`${seed}|visual`) % visualOpeners.length];
  const caption = [
    hook
  ].filter(Boolean).join("\n\n");
  const hashtags = buildHashtags({ categoryName: name, angle: selected.angle, seed });
  const ctaLink = normalizeText(campaign?.ctaLink);
  const targetPlatforms = inferTargetPlatforms({ category, topic, hook });

  return {
    provider: "fallback",
    model: "",
    topic,
    hook,
    caption,
    channelCaptions: buildChannelCaptions({ hook, hashtags, ctaLink }),
    targetPlatforms,
    hashtags,
    imageTextOverlay,
    imagePrompt: [
      visualOpener,
      `Creative angle: ${selected.angle}.`,
      `Reserve clean top-left or bottom-left space for this separate text overlay: "${imageTextOverlay}". Do not render the text inside the image.`,
      mood ? `Admin direction to reflect: ${mood}.` : `Post hook to reflect: ${hook}.`,
      "Include 2-3 seller offer cards or price tags only as supporting visual elements.",
      `Visual style: ${normalizeText(category?.imageStyle) || "clean realistic commercial ad"}.`,
      "No readable text, no HOKO word, no logos, no wall portraits, no framed photos."
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
    "Quality bar: every output must feel like it was created by a top-tier social media agency specializing in viral local business marketing.",
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
    `Choose one primary creative angle from this list and make it obvious in the copy: ${CONTENT_ANGLES.join(", ")}.`,
    "Content rules: never generate generic content; avoid robotic wording; content must feel fresh every time; use urgency where relevant; use curiosity hooks; use emotional triggers; mention local area naturally if available; adapt tone according to audience; mention trends/festivals if relevant; keep content mobile-friendly; use natural human language; do not overuse emojis; make captions readable with spacing.",
    "Avoid repeated hashtags. Hashtags must be fresh, relevant, and not the same set every time.",
    "Return only valid JSON with keys: topic, hook, caption, channelCaptions, targetPlatforms, hashtags, imagePrompt, imageTextOverlay.",
    "topic: a fresh category-specific buyer pain point, buying scenario, urgency, comparison benefit, negotiation angle, or seller-response angle. Do not copy the category name alone.",
    "hook: one or two short lines only. Make it attractive, direct, and conversion-oriented, but vary the sentence structure.",
    "Every hook must mention HOKO and at least one core value: posting a requirement, comparing seller offers, choosing a lower/better price, or getting seller responses.",
    "Mention reverse auction only when it naturally fits the category and hook. Do not force reverse auction into every post.",
    "For service categories such as insurance, finance, legal, consulting, or health services, focus on enquiry, seller responses, offer comparison, policy/plan fit, coverage, premium, or service terms instead of industrial procurement visuals.",
    "Do not use this repeated pattern or close variants: 'Post your [category] requirement on HOKO and let sellers compete with price offers. Pick the best deal, or start a reverse auction for sharper prices.'",
    "Avoid starting every hook with 'Post your'. Use varied openings such as a buyer problem, a question, a contrast, a time-saving angle, a price-comparison angle, or a category-specific buying situation.",
    "Write the hook as fresh advertising copy, not a feature explanation. Make it feel different from previous generic HOKO drafts.",
    "Prefer hooks that create curiosity or urgency, but do not exaggerate, promise guaranteed savings, or make unverifiable guarantees.",
    "Use plain Indian business English. Avoid generic lines like grow your business, discover opportunities, or connect buyers and sellers unless tied to price offers.",
    "caption: short mobile-friendly caption. It may repeat the hook, but add spacing only if it improves readability. Do not write long paragraphs. CTA is stored separately as button text.",
    "channelCaptions: object with facebook, instagram, linkedin strings. Facebook should feel local/community-oriented, Instagram should be short and visual, LinkedIn should sound professional and B2B. Keep each mobile-friendly.",
    "targetPlatforms: array choosing where this post should be auto-published. Use only facebook, instagram, linkedin. Choose linkedin for B2B, corporate, industrial, procurement, wholesale, machinery, commercial services, high-value or bulk demand. Choose facebook and instagram for domestic, household, retail, personal, local consumer, lifestyle, and B2C demand. If the category fits both business and consumer buyers, include all suitable platforms. Do not include a platform only because a caption exists.",
    "imageTextOverlay: 2 to 5 words only, strong ad-style overlay text for the image, such as 'Compare Before You Buy' or 'Limited Time Deal'. Do not include hashtags.",
    "imagePrompt: write an ultra-detailed final image-generation prompt for ModelsLab. It must be aligned with the hook, imageTextOverlay, and campaign mood.",
    campaignMood ? "imagePrompt must use today's campaign mood/direction as visual guidance and connect it directly to the generated hook." : "",
    "imagePrompt must include: subject, environment, lighting, camera angle, mood, colors, realistic details, platform style, audience appeal, and festival/trend relevance if applicable.",
    "Image style must be hyper realistic, viral social media style, high CTR, bright and premium, and mobile-first composition.",
    "The image prompt must reserve clean space for the separate imageTextOverlay, but must explicitly say not to render any text inside the generated image.",
    "imagePrompt must include: exact main subject, concrete setting, people/roles, visible product/category objects, and how seller offers/price comparison are shown.",
    "imagePrompt must not be generic. Do not say only 'HOKO marketplace workflow'. Make it a literal scene a designer can draw.",
    "imagePrompt must show buyer requirement, seller offers, and comparison only where relevant, as part of the scene. Use reverse auction visuals only when the hook explicitly needs them.",
    "Avoid unreadable text, fake screenshots, platform logos, or celebrity/brand references.",
    "Hashtags must be an array of 3 to 6 strings. Do not include markdown fences."
  ].filter(Boolean).join(" ");
}

function inferConcreteVisualScene({ mood = "", categoryName = "", hook = "" }) {
  const text = `${mood} ${categoryName} ${hook}`.toLowerCase();
  const parts = [];
  if (hasInsuranceContext(text)) {
    parts.push("insurance advisory desk scene with a buyer reviewing life, health, and vehicle policy documents");
    parts.push("insurance advisor or seller representative explaining options on a tablet");
    parts.push("visible policy folders, vehicle insurance icon card, medical shield icon card, and premium comparison cards");
  } else if (/motor|industrial motor|electrical/i.test(text) && !isServiceCategory(text)) {
    parts.push("large industrial electric motor on a workshop or factory floor");
    parts.push("2-3 electrical engineers or technicians inspecting the motor with tools and safety helmets");
    parts.push("electrical parts such as cables, switchgear, control panel parts, bearings, connectors, and terminal blocks nearby");
  } else if (/construction|cement|steel|building/i.test(text)) {
    parts.push("construction site material procurement scene with visible building materials");
    parts.push("site engineer or contractor comparing supplier offers");
  } else if (/machinery|machine|equipment/i.test(text)) {
    parts.push("industrial machinery procurement scene with engineers around the equipment");
    parts.push("supplier offer cards beside the machine");
  } else {
    parts.push(`${categoryName} procurement scene with real category-specific items visible`);
    parts.push("buyer or professional inspecting the requirement");
  }
  parts.push("2-3 floating seller offer cards with simple price tags near the product");
  parts.push("clear price comparison visual, no portraits on walls, no unrelated people, no decorative framed photos");
  return parts.join(", ");
}

function buildFinalImagePrompt({ imagePrompt = "", draft = {}, category = {}, campaign = {} }) {
  const categoryName = normalizeText(category?.name || draft?.categorySnapshot?.name) || "business requirement";
  const hook = normalizeText(draft?.hook || draft?.caption || draft?.topic);
  const imageTextOverlay = normalizeText(draft?.imageTextOverlay);
  const mood = normalizeText(campaign?.mood);
  const audienceMode = normalizeText(campaign?.audienceMode);
  const imageStyle = normalizeText(campaign?.imageStyle);
  const categoryStyle = normalizeText(category?.imageStyle);
  const concreteSubject = normalizeText(draft?.topic) || categoryName;
  const concreteScene = inferConcreteVisualScene({ mood, categoryName, hook });
  const sceneFocus = [
    `Create one square 1:1 social media advertising image for this exact post topic: ${concreteSubject}.`,
    "Agency quality bar: hyper realistic, viral local business marketing style, high CTR, bright and premium, mobile-first composition.",
    mood ? `Admin intent to convert into a visual scene: ${mood}. Do not render abstract words like "wish"; render the concrete product, people, and offer-comparison scene.` : "",
    `Required concrete scene: ${concreteScene}.`,
    "Include subject, environment, lighting, camera angle, mood, colors, realistic details, platform style, audience appeal, and festival/trend relevance if applicable.",
    "Lighting: bright premium commercial lighting with natural shadows. Camera: eye-level or slight three-quarter angle optimized for mobile feed.",
    "Colors: clean, high-contrast, trustworthy business palette with warm Indian local-market energy.",
    imageTextOverlay ? `Leave clean negative space for separate overlay text "${imageTextOverlay}", but do not render any readable text in the image.` : "Leave clean negative space for a short ad text overlay, but do not render any readable text in the image.",
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
    "Do not include readable text, the word HOKO, fake social media UI, platform logos, brand logos, celebrity faces, wall portraits, framed photos, watermarks, pavement text, signboards, or distorted hands.",
    "If showing an app/phone, keep UI symbolic and simple; do not invent detailed unreadable screens.",
    "High quality, clean composition, realistic commercial illustration or polished ad visual."
  ].filter(Boolean);
  return sceneFocus.join(" ");
}

function cleanSupportingImagePrompt(imagePrompt = "") {
  const prompt = normalizeText(imagePrompt)
    .replace(/\bHOKO\b/gi, "the marketplace app")
    .replace(/logo/gi, "app")
    .replace(/brand/gi, "business")
    .trim();
  if (!prompt) return "";
  const weakTemplatePatterns = [
    /create (one )?(a )?square/i,
    /social media image/i,
    /online marketplace app/i,
    /convert this admin direction/i,
    /do not render abstract/i,
    /depict this hook visually/i
  ];
  const weakTemplateHits = weakTemplatePatterns.filter((pattern) => pattern.test(prompt)).length;
  return weakTemplateHits >= 2 ? "" : prompt;
}

function buildProviderImagePrompt({ imagePrompt = "", draft = {}, category = {}, campaign = {} }) {
  const categoryName = normalizeText(category?.name || draft?.categorySnapshot?.name);
  const hook = normalizeText(draft?.hook || draft?.caption || draft?.topic);
  const cleanAiPrompt = cleanSupportingImagePrompt(imagePrompt);
  const finalPrompt = buildFinalImagePrompt({ imagePrompt: cleanAiPrompt, draft, category, campaign })
    .replace(/\bHOKO\b/gi, "the marketplace app");
  return [
    finalPrompt,
    hook ? `Must align with this post hook: "${hook}".` : "",
    categoryName ? `Category context: ${categoryName}.` : "",
    cleanAiPrompt ? `Supporting visual note: ${cleanAiPrompt}.` : "",
    "Format: square 1:1 professional social media image.",
    "Do not render the word HOKO. Do not render any logo, pavement text, wall text, signboard, typography, unrelated portraits, wall photos, random people, decorative text, fake logos, unreadable text, or watermark."
  ].filter(Boolean).join(" ");
}

function buildImagePromptRefinementPrompt({ imagePrompt = "", draft = {}, category = {}, campaign = {} }) {
  const categoryName = normalizeText(category?.name || draft?.categorySnapshot?.name);
  const hook = normalizeText(draft?.hook || draft?.caption || draft?.topic);
  const imageTextOverlay = normalizeText(draft?.imageTextOverlay);
  const mood = normalizeText(campaign?.mood);
  const cleanAiPrompt = cleanSupportingImagePrompt(imagePrompt);
  const finalPrompt = buildFinalImagePrompt({ imagePrompt: cleanAiPrompt, draft, category, campaign });
  return [
    "Write one final text-to-image prompt for ModelsLab.",
    "Goal: create a relevant square social media image aligned with the post hook and admin mood.",
    mood ? `Admin mood / visual direction: ${mood}.` : "",
    hook ? `Post hook: ${hook}.` : "",
    imageTextOverlay ? `Separate text overlay planned by app: ${imageTextOverlay}. The image model must leave clean space for it but must not render the text.` : "",
    categoryName ? `Category: ${categoryName}.` : "",
    `Base scene prompt to improve without changing the requirement: ${finalPrompt}.`,
    cleanAiPrompt ? `Supporting visual note: ${cleanAiPrompt}.` : "",
    "Return only the final image prompt, no JSON, no markdown.",
    "Prompt requirements:",
    "- Describe a concrete scene with visible objects, people/roles, setting, and action.",
    "- Include subject, environment, lighting, camera angle, mood, colors, realistic details, platform style, audience appeal, and festival/trend relevance if applicable.",
    "- Style: hyper realistic, viral social media, high CTR, bright and premium, mobile-first composition.",
    "- Make the product/category visually central.",
    "- Include buyer requirement and 2-3 seller offer/price comparison cards only if it fits naturally.",
    "- Avoid generic marketplace/app UI visuals.",
    "- Do not ask for readable text, logos, HOKO word, signboards, wall photos, or random portraits.",
    "- Keep it concise but specific enough for an image model."
  ].filter(Boolean).join("\n");
}

async function refineImagePrompt({ imagePrompt = "", draft = {}, category = {}, campaign = {}, settings = {} }) {
  const fallbackPrompt = buildProviderImagePrompt({ imagePrompt, draft, category, campaign });
  const provider = normalizeAiProvider(settings?.aiProvider);
  const prompt = buildImagePromptRefinementPrompt({ imagePrompt, draft, category, campaign });

  if (provider === "openai") {
    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) return fallbackPrompt;
    try {
      const model = normalizeText(process.env.OPENAI_CONTENT_MODEL) || "gpt-4o-mini";
      const response = await axios.post(
        "https://api.openai.com/v1/responses",
        {
          model,
          input: prompt
        },
        {
          timeout: 20000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
      return normalizeText(extractResponseText(response?.data)) || fallbackPrompt;
    } catch {
      return fallbackPrompt;
    }
  }

  const apiKey = normalizeText(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY);
  if (!apiKey) return fallbackPrompt;
  try {
    const model = normalizeText(process.env.GEMINI_CONTENT_MODEL) || "gemini-2.5-flash";
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        timeout: 20000,
        params: { key: apiKey },
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    return normalizeText(extractResponseText(response?.data)) || fallbackPrompt;
  } catch {
    return fallbackPrompt;
  }
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
    return {
      ...fallback,
      error: "fallback_provider_selected"
    };
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
  const parsedChannelCaptions = parsed.channelCaptions && typeof parsed.channelCaptions === "object"
    ? parsed.channelCaptions
    : {};
  const targetPlatforms = normalizeTargetPlatforms(parsed.targetPlatforms);

  return {
    provider: "gemini",
    model,
    topic: normalizeText(parsed.topic) || fallback.topic,
    hook: normalizeText(parsed.hook) || fallback.hook,
    caption: normalizeText(parsed.caption) || fallback.caption,
    channelCaptions: {
      facebook: normalizeText(parsedChannelCaptions.facebook) || fallback.channelCaptions?.facebook || "",
      instagram: normalizeText(parsedChannelCaptions.instagram) || fallback.channelCaptions?.instagram || "",
      linkedin: normalizeText(parsedChannelCaptions.linkedin) || fallback.channelCaptions?.linkedin || ""
    },
    targetPlatforms: targetPlatforms.length ? targetPlatforms : inferTargetPlatforms({ category, topic: parsed.topic || fallback.topic, hook: parsed.hook || fallback.hook }),
    hashtags,
    imageTextOverlay: normalizeText(parsed.imageTextOverlay) || fallback.imageTextOverlay,
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
  const parsedChannelCaptions = parsed.channelCaptions && typeof parsed.channelCaptions === "object"
    ? parsed.channelCaptions
    : {};
  const targetPlatforms = normalizeTargetPlatforms(parsed.targetPlatforms);

  return {
    provider: "openai",
    model,
    topic: normalizeText(parsed.topic) || fallback.topic,
    hook: normalizeText(parsed.hook) || fallback.hook,
    caption: normalizeText(parsed.caption) || fallback.caption,
    channelCaptions: {
      facebook: normalizeText(parsedChannelCaptions.facebook) || fallback.channelCaptions?.facebook || "",
      instagram: normalizeText(parsedChannelCaptions.instagram) || fallback.channelCaptions?.instagram || "",
      linkedin: normalizeText(parsedChannelCaptions.linkedin) || fallback.channelCaptions?.linkedin || ""
    },
    targetPlatforms: targetPlatforms.length ? targetPlatforms : inferTargetPlatforms({ category, topic: parsed.topic || fallback.topic, hook: parsed.hook || fallback.hook }),
    hashtags,
    imageTextOverlay: normalizeText(parsed.imageTextOverlay) || fallback.imageTextOverlay,
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

function extractModelsLabVideoUrl(payload) {
  return extractModelsLabImageUrl(payload);
}

async function verifyModelsLabVideoUrl(value = "") {
  const url = normalizeText(value);
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      responseType: "arraybuffer",
      maxRedirects: 5,
      headers: {
        Range: "bytes=0-1048575",
        Accept: "video/mp4,video/*,*/*;q=0.5",
        "User-Agent": "HOKO-AI-VideoCheck/1.0"
      },
      validateStatus: (status) => status >= 200 && status < 400
    });
    const buffer = Buffer.from(response.data || []);
    const contentType = normalizeText(response.headers?.["content-type"]).toLowerCase();
    const contentLength = Number(response.headers?.["content-length"] || 0);
    const contentRange = normalizeText(response.headers?.["content-range"]);
    const totalFromRange = Number(contentRange.match(/\/(\d+)$/)?.[1] || 0);
    const expectedSize = Math.max(contentLength, totalFromRange, buffer.length);
    const hasMp4Marker = buffer.includes(Buffer.from("ftyp"));
    const looksLikeVideo = contentType.includes("video") || contentType.includes("mp4") || hasMp4Marker;
    return Boolean(looksLikeVideo && expectedSize > 1024 * 100);
  } catch {
    return false;
  }
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

async function fetchModelsLabVideo({ apiKey, requestId }) {
  const id = normalizeText(requestId);
  if (!id) return null;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await axios.post(
      `https://modelslab.com/api/v6/video/fetch/${encodeURIComponent(id)}`,
      { key: apiKey },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    const raw = response?.data || null;
    const videoUrl = extractModelsLabVideoUrl(raw);
    if (videoUrl && await verifyModelsLabVideoUrl(videoUrl)) {
      return {
        raw,
        videoUrl
      };
    }
    if (!["processing", "pending", "queued"].includes(normalizeText(raw?.status).toLowerCase())) {
      return {
        raw,
        videoUrl: ""
      };
    }
  }

  return null;
}

function buildVideoPrompt({ prompt = "", draft = {} }) {
  return [
    normalizeText(prompt),
    normalizeText(draft?.hook || draft?.caption),
    "Short vertical social media reel, smooth motion, clean commercial style, Indian marketplace app promotion, no readable text, no watermark."
  ].filter(Boolean).join(" ");
}

async function generateModelsLabVideo({ prompt = "", initImage = "", draft = {}, mode = "image" } = {}) {
  const apiKey = normalizeText(process.env.MODELSLAB_API_KEY || process.env.MODELSLAB_KEY);
  if (!apiKey) {
    return {
      provider: "none",
      model: "",
      videoUrl: "",
      raw: null,
      error: "modelslab_api_key_missing"
    };
  }

  const useImage = normalizeText(mode) !== "text" && normalizeText(initImage || draft?.imageUrl);
  const model = normalizeText(process.env.MODELSLAB_VIDEO_MODEL) || (useImage ? "wan2.2" : "wan2.2");
  const finalPrompt = buildVideoPrompt({ prompt, draft });
  const endpoint = useImage
    ? "https://modelslab.com/api/v6/video/img2video"
    : "https://modelslab.com/api/v6/video/text2video";
  const payload = useImage
    ? {
        key: apiKey,
        model_id: model,
        init_image: normalizeText(initImage || draft?.imageUrl),
        prompt: finalPrompt,
        negative_prompt: "low quality, blurry, distorted, flicker, watermark, readable text",
        height: 512,
        width: 512,
        num_frames: 25,
        num_inference_steps: 20,
        min_guidance_scale: 1,
        max_guidance_scale: 3,
        motion_bucket_id: 127,
        noise_aug_strength: 0.05,
        fps: 16,
        output_type: "mp4",
        temp: false,
        webhook: null,
        track_id: null
      }
    : {
        key: apiKey,
        model_id: model,
        prompt: finalPrompt,
        negative_prompt: "low quality, blurry, distorted, static, watermark, readable text",
        height: 512,
        width: 512,
        num_frames: 25,
        num_inference_steps: 20,
        guidance_scale: 7,
        fps: 16,
        output_type: "mp4",
        webhook: null,
        track_id: null
      };

  const response = await axios.post(endpoint, payload, {
    timeout: 90000,
    headers: {
      "Content-Type": "application/json"
    }
  });
  const raw = response?.data || null;
  let videoUrl = extractModelsLabVideoUrl(raw);
  let finalRaw = raw;
  if (videoUrl && !(await verifyModelsLabVideoUrl(videoUrl))) {
    videoUrl = "";
  }
  if (!videoUrl && ["processing", "pending", "queued", "success"].includes(normalizeText(raw?.status).toLowerCase())) {
    const fetched = await fetchModelsLabVideo({ apiKey, requestId: raw?.id });
    videoUrl = fetched?.videoUrl || "";
    finalRaw = fetched?.raw || raw;
  }

  return {
    provider: "modelslab",
    model,
    videoUrl,
    prompt: finalPrompt,
    mode: useImage ? "image" : "text",
    raw: {
      ...(finalRaw && typeof finalRaw === "object" ? finalRaw : { response: finalRaw }),
      prompt: finalPrompt,
      mode: useImage ? "image" : "text"
    },
    error: videoUrl ? "" : normalizeText(finalRaw?.message || raw?.message) || "modelslab_video_not_returned"
  };
}

async function generateModelsLabImage({ imagePrompt, draft = {}, category = {}, campaign = {}, settings = {} }) {
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
  const finalPrompt = await refineImagePrompt({ imagePrompt, draft, category, campaign, settings });
  const response = await axios.post(
    "https://modelslab.com/api/v6/images/text2img",
    {
      key: apiKey,
      prompt: finalPrompt,
      negative_prompt: [
        "wall portrait",
        "framed photo",
        "boy portrait",
        "child portrait",
        "single person headshot",
        "random face on wall",
        "decorative painting",
        "unrelated person",
        "unrelated room decor",
        "readable text",
        "logo",
        "signboard",
        "watermark",
        "fake app screenshot"
      ].join(", "),
      model_id: model,
      width: "1024",
      height: "1024",
      samples: "1",
      safety_checker: false,
      enhance_prompt: false,
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
    raw: {
      ...(finalRaw && typeof finalRaw === "object" ? finalRaw : { response: finalRaw }),
      prompt: finalPrompt
    },
    error: imageUrl ? "" : normalizeText(finalRaw?.message || raw?.message) || "modelslab_image_not_returned"
  };
}

async function generateGeminiImage({ imagePrompt, draft = {}, category = {}, campaign = {}, settings = {} }) {
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
                await refineImagePrompt({ imagePrompt, draft, category, campaign, settings })
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
    return generateGeminiImage({ imagePrompt, draft, category, campaign, settings });
  }
  return generateModelsLabImage({ imagePrompt, draft, category, campaign, settings });
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
  generateModelsLabVideo,
  generateTextDraft,
  extractGeminiInlineImage
};
