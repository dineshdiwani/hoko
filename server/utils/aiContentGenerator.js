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
    "Stop Chasing Quotes",
    "Choose Smarter",
    "Local Sellers. Clear Prices.",
    "Sellers Compete. You Win.",
    "Post Once. Get Offers.",
    "Your City. Your Deal.",
    "Don't Overpay."
  ];
  if (/insurance|policy|premium/i.test(`${label} ${hook}`)) {
    options.push("Compare Policy Offers", "Don't Overpay");
  }
  if (angle === "FOMO" || /soon|urgent|limited/i.test(hook)) {
    options.push("Don't Miss Better Offers", "Needed Soon?");
  }
  if (/stop|chase|call|running/i.test(hook)) {
    options.push("Stop Running", "Stop Calling", "One Post. Done.");
  }
  return options[hashText(`${angle}|${categoryName}|${hook}|overlay`) % options.length];
}

function buildHashtags({ categoryName = "", angle = "", seed = "" }) {
  const categoryTag = `#${normalizeText(categoryName).replace(/[^a-zA-Z0-9]/g, "")}`;
  const angleTags = {
    Curiosity: ["#CompareFirst", "#SmartBuying", "#DealFinder"],
    FOMO: ["#DontMissOut", "#NeededSoon", "#ActFast"],
    Relatability: ["#ShopLocal", "#NoMoreFollowUps", "#LocalFirst"],
    "Social proof": ["#SellerOffers", "#MarketPrices", "#SmartChoice"],
    Transformation: ["#BuySmarter", "#ClearComparison", "#DigitalIndia"],
    "Humor where relevant": ["#BuyingMadeSimple", "#GameChanger"],
    "Local pride": ["#LocalBusiness", "#VocalForLocal", "#MyCity"],
    "Emotional connection": ["#LessStress", "#ClearChoices", "#EasyBuying"],
    "Problem-solving": ["#PriceComparison", "#NoMoreCalls", "#InstaQuote"],
    "Trend adaptation": ["#SmartBuyers", "#DigitalIndia", "#FutureOfShopping"],
    Urgency: ["#ActFast", "#QuickQuotes", "#NeededSoon"]
  };
  const options = angleTags[angle] || ["#SmartBuying", "#SellerOffers", "#LocalDeals"];
  const picked = options[hashText(`${seed}|hashtag`) % options.length];
  const extra = ["#HOKOApp", "#Hyperlocal"][hashText(`${seed}|extra`) % 2];
  return [extra, categoryTag, picked].filter((item) => item.length > 1);
}

function buildChannelCaptions({ hook = "", hashtags = [], ctaLink = "" }) {
  const cleanHook = normalizeText(hook);
  const tagText = Array.isArray(hashtags) ? hashtags.map(normalizeText).filter(Boolean).join(" ") : "";
  const link = normalizeText(ctaLink);
  return {
    facebook: [cleanHook, "Compare seller offers on HOKO.", tagText, link].filter(Boolean).join("\n\n"),
    instagram: [cleanHook, tagText].filter(Boolean).join("\n\n"),
    linkedin: [cleanHook, "A practical way for buyers to post requirements and compare seller responses before deciding.", link].filter(Boolean).join("\n\n"),
    whatsapp: [cleanHook, "Zaroorat hai? Hoko pe daalo. Sellers quote karengay."].filter(Boolean).join("\n\n")
  };
}

function normalizeTargetPlatforms(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const allowed = new Set(["facebook", "instagram", "linkedin", "whatsapp"]);
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
  if (isLinkedin && isConsumer) return ["linkedin", "facebook", "instagram", "whatsapp"];
  return ["facebook", "instagram", "whatsapp"];
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
      topic: `Stop chasing suppliers for ${lowerName}`,
      hook: `Stop calling 10 suppliers for ${lowerName}. Post once on HOKO. Let them come to you.`
    },
    {
      angle: "Curiosity",
      topic: `What happens when sellers compete for your ${lowerName} order`,
      hook: `What if your ${lowerName} requirement reached every seller in your city at once? That's HOKO.`
    },
    {
      angle: "FOMO",
      topic: `Others are already comparing ${lowerName} prices on HOKO`,
      hook: `Your competitor just found a cheaper ${lowerName} supplier. You're still making calls.`
    },
    {
      angle: "Relatability",
      topic: `The old way of buying ${lowerName} is broken`,
      hook: `Running shops to find ${lowerName}? That's so 2019. Do it from your phone now.`
    },
    {
      angle: "Transformation",
      topic: `From phone calls to one tap for ${lowerName}`,
      hook: `No more juggling 5 WhatsApp chats for ${lowerName}. One post. Multiple offers. You choose.`
    },
    {
      angle: "Urgency",
      topic: `${lowerName} needed urgently? This is faster`,
      hook: `${lowerName} chahiye kal tak? HOKO pe daalo. Sellers will line up with prices.`
    },
    {
      angle: "Emotional connection",
      topic: `Buying ${lowerName} should feel easy, not exhausting`,
      hook: `Buying ${lowerName} should not feel like a second job. Let HOKO do the hard part.`
    },
    {
      angle: "Social proof",
      topic: `Smart buyers already use this for ${lowerName}`,
      hook: `Smart buyers don't chase sellers. They let sellers chase them. HOKO.`
    },
    {
      angle: "Local pride",
      topic: `Your city has hidden ${lowerName} deals waiting for you`,
      hook: `Your city has sellers ready to quote ${lowerName}. They just don't know you're looking. HOKO connects.`
    },
    {
      angle: "Trend adaptation",
      topic: `This is how people buy ${lowerName} in 2026`,
      hook: `Calling random suppliers? That's old news. Post your ${lowerName} need on HOKO and compare in minutes.`
    }
  ];
  const insuranceAngles = [
    {
      angle: "Curiosity",
      topic: `Most people overpay for insurance. Here's why.`,
      hook: `Still taking the first insurance quote? You're probably overpaying. HOKO lets sellers compete on your policy.`
    },
    {
      angle: "Relatability",
      topic: `Insurance comparison without the headache`,
      hook: `Insurance paperwork is a headache. HOKO makes sellers bring their best offer to you.`
    },
    {
      angle: "Problem-solving",
      topic: `One click, multiple insurance quotes`,
      hook: `One requirement. Multiple policy offers. You compare. That's HOKO for insurance.`
    },
    {
      angle: "Social proof",
      topic: `Others saved on insurance using this trick`,
      hook: `People are switching to HOKO for insurance. Why settle for one quote when you can have five?`
    },
    {
      angle: "Urgency",
      topic: `Policy about to expire? Don't renew blindly`,
      hook: `Insurance renewal coming up? Don't auto-renew. See what other sellers offer on HOKO first.`
    },
    {
      angle: "Transformation",
      topic: `The smart way to buy insurance in 2026`,
      hook: `Stop buying insurance blind. Post your need on HOKO and make sellers compete for your business.`
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
    `Policy and offer comparison image showing ${concreteScene}.`,
    `Advisor helping buyer review service options: ${concreteScene}.`,
    `Side-by-side service comparison layout: ${concreteScene}.`
  ] : [
    `Square product-procurement visual: ${concreteScene}.`,
    `Realistic Indian marketplace scene for ${name}: ${concreteScene}.`,
    `Product showcase and supplier comparison image: ${concreteScene}.`,
    `Commercial buying scene showing ${concreteScene}.`,
    `Shop-floor product evaluation setup: ${concreteScene}.`,
    `Buyer inspecting ${name} items from multiple sellers: ${concreteScene}.`
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
      `Reserve clean top-left or bottom-left space for separate text overlay: "${imageTextOverlay}". Do not render text inside the image.`,
      mood ? `Scene mood: ${mood}.` : `Visual theme from hook: ${hook}.`,
      hashText(`${seed}|offercards`) % 3 !== 0 ? "Include 1-2 simple price labels near the product if relevant." : "",
      `Visual style: ${normalizeText(category?.imageStyle) || "realistic Indian commercial photography"}.`,
      "No readable text, no logos, no wall portraits, no framed photos, no HOKO word in image."
    ].filter(Boolean).join(" "),
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

  const hookPatterns = [
    "Nobody talks about this...",
    "This is why sellers fail online...",
    "Most people are doing this wrong",
    "Imagine earning while sleeping",
    "Your shop is losing customers because of this",
    "The future of local business is changing",
    "This small trick changes everything",
    "What if your business worked 24/7?",
    "The biggest mistake sellers make",
    "People don't realize this yet...",
    "I wish I knew this sooner",
    "This is not a drill for shop owners",
    "Stop doing this if you run a business",
    "99% of sellers ignore this",
    "This one thing can change your business",
    "Here's why your shop is empty",
    "The truth about online selling",
    "Your customers are looking for you elsewhere"
  ];

  const contentTypes = [
    "Curiosity post — make people think 'wait, what?'",
    "Problem-solution post — show a real pain and how Hoko fixes it",
    "Seller pain post — trigger every shopkeeper who struggles",
    "Buyer convenience post — show how easy buying can be",
    "Local business empowerment — make local pride the hero",
    "AI future post — show how tech helps small business",
    "Relatable meme-style — funny but smart",
    "Did you know? — reveal a hidden truth about local shopping",
    "Myth busting — bust 'online selling is expensive' myth",
    "Comparison post — old way vs new way",
    "Short storytelling — 3 lines that hit emotionally",
    "Hyperlocal business content — your city, your shop",
    "Side hustle psychology — make extra money",
    "WhatsApp business culture — meet them where they are"
  ];

  const emotionalTriggers = [
    "Curiosity gap — make them need to know more",
    "Fear of missing out — others are already doing it",
    "Local pride — your city deserves better shopping",
    "Financial growth — save money, make money",
    "Convenience — why run around when you can do it from phone",
    "Social proof — others are already using Hoko",
    "Smartness — feel smart for using Hoko",
    "Future trends — this is where shopping is going",
    "Seller pain — chasing customers, low visibility, no digital presence",
    "Buyer frustration — calling 10 shops, no response, no comparison"
  ];

  const hookInstruction = [
    "HOOK RULES (MOST IMPORTANT RULE):",
    "The first line MUST stop scrolling instantly.",
    "It must trigger curiosity, create emotional tension, or surprise the reader.",
    "Keep hooks short, punchy, conversational, emotionally charged.",
    "Never start with: 'Welcome to', 'Introducing', 'We are excited', or corporate language.",
    "Vary the hook structure every time — do NOT repeat the same pattern.",
    "Use one of these patterns as inspiration (not exact copy):",
    hookPatterns.map((p) => `  - "${p}"`).join("\n"),
    "",
    "Sometimes the hook should NOT mention Hoko directly. Let curiosity pull them in first.",
    "The word Hoko should feel natural, not forced."
  ].join("\n");

  const contentStyleInstruction = [
    "CONTENT STYLE:",
    "Write like a modern creator, smart marketer, viral Instagram page, startup founder.",
    "Use short lines. Line breaks every 2-4 words on mobile.",
    "Sound conversational, not corporate.",
    "Use emotional storytelling and internet-style rhythm.",
    "No paragraph blocks. No technical explanations.",
    "No generic motivational content. No repetitive structure.",
    "Use plain Indian English. Sound like a real person, not a brand page.",
    "Never sound like ChatGPT. Never use 'unlock potential', 'revolutionary', 'empowering businesses'."
  ].join("\n");

  const emotionalInstruction = [
    "EMOTIONAL TRIGGERS TO USE (pick 2-3 per post):",
    emotionalTriggers.map((t) => `  - ${t}`).join("\n"),
    "Combine triggers for maximum impact. Example: curiosity + FOMO + local pride."
  ].join("\n");

  const platformInstruction = [
    "PLATFORM-SPECIFIC CAPTIONS:",
    "Instagram: highly emotional, short punchy lines, trendy, visual-first, Reels-compatible.",
    "Facebook: relatable, community-driven, slightly more descriptive, local business friendly.",
    "LinkedIn: founder tone, startup growth style, business insights, digital transformation angle, professional but emotional.",
    "WhatsApp: extremely short, forward-friendly, curiosity-heavy, human casual tone. Use Hinglish naturally."
  ].join("\n");

  const ctaInstruction = [
    "CTA RULES:",
    "CTA should feel natural, not forced. Examples:",
    '  - "Would you try this?"',
    '  - "Tag a seller who needs this"',
    '  - "This is just the beginning"',
    '  - "Imagine this in your city"',
    '  - "Would your business use this?"',
    '  - "Comment YES if you agree"',
    '  - "Save this for later"',
    '  - "Send this to a shop owner"',
    "Default CTA button text is: " + (normalizeText(fixedCta) || "Learn More")
  ].join("\n");

  const antiAiInstruction = [
    "ANTI-AI RULES:",
    "Never sound repetitive or use same sentence structures.",
    "Never use same hook formula twice in a row.",
    "No excessive emojis (max 1-2 if any).",
    "Do not explain too much. Leave gaps for curiosity.",
    "Do not use: 'unlock potential', 'revolutionary', 'empowering businesses', 'game-changer', 'disrupt'.",
    "Sound like a human wrote this in 30 seconds, not an AI that optimized for 5 minutes.",
    "Imperfect is better than perfect. Real is better than polished."
  ].join("\n");

  const finalGoal = [
    "GOAL: Every post should make the reader feel: 'I should try HokoApp before others do.'",
    "The content should make sellers and buyers want to join immediately.",
    "Maximize: hook strength, curiosity, emotional impact, share potential, comment potential.",
    "If the output feels generic, robotic, or boring — rewrite it internally before outputting."
  ].join("\n");

  const contentTypeChoice = `CONTENT TYPE THIS ROUND (choose ONE and make it obvious in style): ${contentTypes.join(" | ")}`;

  return [
    "You are a viral content creator for HOKO — a hyperlocal marketplace connecting Indian buyers and sellers.",
    "",
    "ABOUT HOKO:",
    "Buyers post what they need. Sellers see it and compete with offers. Buyers compare and choose. Reverse auction available for best prices.",
    "Think of it as: buyer posts requirement → multiple sellers quote → buyer picks the best deal.",
    "No ads. No commission. Just direct business.",
    "Target audience: Indian local shopkeepers, small business owners, young entrepreneurs, side hustlers, WhatsApp sellers, Tier 2/3 city users.",
    "",
    "CATEGORY TO POST ABOUT:",
    `Category: ${normalizeText(category?.name)}.`,
    `Context: ${normalizeText(category?.description) || "not provided"}.`,
    `Target audience: ${normalizeText(category?.targetAudience) || "Indian local buyers and sellers"}.`,
    `Image style hint: ${normalizeText(category?.imageStyle) || "cinematic realistic Indian marketplace"}.`,
    campaignMood ? `Campaign mood/direction: ${campaignMood}.` : "",
    audienceMode && audienceMode !== "auto" ? `Audience focus: ${audienceMode}.` : "",
    brandInstructions ? `Brand instructions: ${brandInstructions}.` : "",
    blockedWords.length ? `Absolutely do not use these words/phrases: ${blockedWords.join(", ")}.` : "",
    "",
    hookInstruction,
    "",
    contentTypeChoice,
    "",
    contentStyleInstruction,
    "",
    emotionalInstruction,
    "",
    platformInstruction,
    "",
    ctaInstruction,
    "",
    antiAiInstruction,
    "",
    finalGoal,
    "",
    "OUTPUT FORMAT (return ONLY valid JSON, no markdown fences):",
    "{",
    '  "topic": "short category-specific pain point or buying scenario, NOT just the category name",',
    '  "hook": "one or two punchy lines that stop scrolling — vary structure every time",',
    '  "caption": "short mobile-friendly body text with line breaks, emotional, conversational",',
    '  "channelCaptions": {',
    '    "facebook": "community-oriented, relatable, local business friendly version",',
    '    "instagram": "short punchy trendy emotional visual-first version",',
    '    "linkedin": "founder tone, startup growth, business insight version",',
    '    "whatsapp": "2-3 lines max, Hinglish ok, curiosity-heavy, forward-friendly"',
    '  },',
    '  "targetPlatforms": ["facebook", "instagram", "linkedin"] or subset based on B2B vs B2C',
    '  "hashtags": ["3", "to", "6", "fresh", "relevant", "hashtags"],',
    '  "imageTextOverlay": "2-5 word strong ad overlay text",',
    '  "imagePrompt": "ultra-detailed cinematic image prompt for AI image generation"',
    "}",
    "",
    "IMAGE PROMPT RULES:",
    "Write a cinematic, realistic, emotional image prompt for AI generation.",
    "Include: subject, emotion, environment, camera angle, lighting, mood, color tone.",
    "Style: hyper realistic, viral social media style, Indian local business context.",
    "Reserve clean space for text overlay but do NOT render text inside the image.",
    "Avoid: stock photo look, generic offices, handshakes, fake screenshots, logos, HOKO word in image.",
    useAppScreenshots ? "Can include phone mockup showing app UI symbolically (no readable text)." : "Do not require app screenshots.",
    "",
    "HASHTAG RULES:",
    "3 to 6 hashtags only. Fresh every time. Mix of: category, local business, India, platform, emotional.",
    "Example variations: #LocalBusiness #DigitalIndia #ShopLocal #SmallBizIndia #NoCommission #Hyperlocal",
    "Never repeat the same hashtag set. Must feel unique per post."
  ].filter(Boolean).join("\n");
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
    const hookText = (hook || "").toLowerCase();
    const moodText = (mood || "").toLowerCase();
    const envSeed = hashText(`${mood}|${categoryName}|${hook}|env`);
    if (/warehouse|stock|inventory|bulk|supply|godown/.test(hookText)) {
      parts.push(`warehouse storage area with ${categoryName} products neatly stacked on industrial shelves, a buyer examining stock`);
    } else if (/shop|store|retail|counter|walk.?in/.test(hookText)) {
      parts.push(`local retail shop with ${categoryName} items displayed on shelves and glass counter, natural shop lighting`);
    } else if (/urgent|emergency|immediate|quick|fast|need.*now|kal.?tak|chahiye/.test(hookText)) {
      parts.push(`busy procurement desk with ${categoryName} items being quickly processed, a sense of urgency in the air`);
    } else if (/compare|comparison|best.?price|rate|cheap|low.?cost|affordable|sasta/.test(hookText)) {
      parts.push(`comparison shopping scene with ${categoryName} items from different sellers displayed side by side for evaluation`);
    } else if (/delivery|supply|supplier|vendor|distributor|supply.*chain/.test(hookText)) {
      parts.push(`supply yard or distribution point with ${categoryName} items being received and checked by a buyer`);
    } else if (/quality|premium|top|best|high.?end|superior|brand/.test(hookText)) {
      parts.push(`premium showroom or quality inspection area with ${categoryName} items on elegant display`);
    } else if (/digital|online|app|platform|website|phone|mobile/.test(hookText)) {
      parts.push(`modern digital commerce setup with ${categoryName} items visible alongside a smartphone showing offers`);
    } else if (/local|neighborhood|community|nearby|desi|indian.*market/.test(hookText)) {
      parts.push(`vibrant local Indian market area with ${categoryName} items prominently displayed at a shop front`);
    } else if (/price|offer|deal|discount|save|bargain/.test(hookText)) {
      parts.push(`competitive pricing display with ${categoryName} items tagged with discount labels and offer boards`);
    } else if (/first.?time|new|beginner|start|discover|explore|try/.test(hookText)) {
      parts.push(`welcoming shop entrance displaying ${categoryName} items, first-time buyer exploring options`);
    } else {
      const envOptions = [
        `procurement desk with ${categoryName} items neatly arranged for buyer inspection`,
        `local market shop counter displaying ${categoryName} products with clear price labels`,
        `commercial supply store with ${categoryName} items on racks and a buyer examining the quality`,
        `business workspace with ${categoryName} samples and requirement documents on a desk`,
        `product showcase area with ${categoryName} items arranged professionally for buyer evaluation`,
        `shop floor with ${categoryName} products displayed in organized sections for easy comparison`
      ];
      parts.push(envOptions[envSeed % envOptions.length]);
    }
    if (/urgent|emergency|immediate|need.*now|chahiye|kal.?tak/.test(hookText)) {
      parts.push("a buyer urgently checking requirements on a clipboard, seller representative ready with offer details, concerned expressions");
    } else if (/compare|comparison|best.?price|rate|cheap|sasta/.test(hookText)) {
      parts.push("a buyer thoughtfully comparing options from two sellers, holding a document and evaluating products");
    } else if (/negotiate|deal|bargain|discount|offer|price/.test(hookText)) {
      parts.push("a buyer negotiating with a seller, both gesturing toward the products with engaged expressions");
    } else if (/quality|premium|top|best|high.?end|superior|brand/.test(hookText)) {
      parts.push("a quality inspector or discerning buyer examining the product carefully with a satisfied expression");
    } else if (/delivery|supply|supplier|vendor|distributor/.test(hookText)) {
      parts.push("a warehouse staff handing over products to a buyer who is checking the delivery against a list");
    } else if (/first.?time|new|beginner|start|discover|explore|try/.test(hookText)) {
      parts.push("a first-time buyer exploring category options with curiosity, a helpful seller guiding them");
    } else if (/stop.*call|calling.*supplier|chase|run.*shop|juggl|wast.*time/.test(hookText)) {
      parts.push("a relieved buyer at a shop counter who just discovered an easier way to compare suppliers, holding a phone");
    } else {
      const charOptions = [
        "a buyer inspecting the product requirement with a focused, professional expression",
        "a small business owner examining category items carefully and comparing price tags",
        "a procurement professional reviewing product specifications with a supplier nearby",
        "a buyer and seller discussing requirements over a product display, both engaged",
        "a local shopkeeper showing category items to an interested buyer at the counter",
        "an entrepreneur evaluating different supplier options for their business needs"
      ];
      parts.push(charOptions[hashText(`${mood}|${categoryName}|${hook}|char`) % charOptions.length]);
    }
    if (/urgent|emergency|immediate|fast|quick/.test(moodText)) {
      parts.push("bright energetic lighting with a sense of speed, warm urgent tones, dynamic composition");
    } else if (/premium|luxury|high.?end|exclusive|elite/.test(moodText)) {
      parts.push("soft premium lighting with warm amber tones, elegant sophisticated atmosphere, subtle shadows");
    } else if (/budget|economy|affordable|cheap|low.?cost|value/.test(moodText)) {
      parts.push("bright practical lighting, straightforward honest visual tone, value-focused composition");
    } else if (/festive|celebrate|festival|special.?offer|diwali|pongal|holi|dasher/.test(moodText)) {
      parts.push("warm festive golden lighting, celebratory atmosphere with subtle traditional decorative accents");
    } else if (/trust|secure|reliable|safe|dependable|honest/.test(moodText)) {
      parts.push("stable well-balanced lighting, trustworthy calm atmosphere, clear visibility and open composition");
    } else if (/modern|digital|tech|innovative|smart|future/.test(moodText)) {
      parts.push("clean modern lighting with cool tones, contemporary forward-looking atmosphere, sleek environment");
    } else if (/local|traditional|desi|indian|neighborhood|community/.test(moodText)) {
      parts.push("warm natural lighting with traditional Indian market atmosphere, vibrant local color palette");
    } else if (/seasonal|rainy|summer|winter|monsoon|spring/.test(moodText)) {
      parts.push("atmospheric lighting matching the seasonal mood, weather-appropriate environmental tone");
    }
  }
  const hasComparisonContext = /compare|price|rate|offer|deal|discount|bargain|compet|bid|auction/.test(text);
  if (hasComparisonContext) {
    parts.push("2-3 floating seller offer cards with simple price tags near the product");
  }
  parts.push("no portraits on walls, no unrelated people, no decorative framed photos");
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
  const moodText = (mood || "").toLowerCase();
  const hookText = (hook || "").toLowerCase();
  let lightingDesc = "bright commercial lighting with natural shadows";
  let colorDesc = "clean high-contrast trustworthy business palette";
  if (/urgent|emergency|immediate|fast|quick/.test(moodText)) {
    lightingDesc = "energetic bright lighting with dynamic shadows, urgent tempo";
    colorDesc = "high-energy warm tones with contrast for urgency";
  } else if (/premium|luxury|high.?end|exclusive/.test(moodText)) {
    lightingDesc = "soft premium diffused lighting with warm amber glow";
    colorDesc = "rich deep tones with gold and cream accents, sophisticated palette";
  } else if (/festive|celebrate|festival|special.?offer/.test(moodText)) {
    lightingDesc = "warm golden festive lighting with soft glow";
    colorDesc = "vibrant celebratory colors with warm Indian festival palette";
  } else if (/budget|economy|affordable|value/.test(moodText)) {
    lightingDesc = "bright flat practical lighting, clear visibility";
    colorDesc = "clean straightforward colors, no-nonsense business palette";
  } else if (/local|traditional|desi|indian|neighborhood/.test(moodText)) {
    lightingDesc = "warm natural daylight with traditional market ambience";
    colorDesc = "vibrant local Indian bazaar colors, warm earthy tones";
  } else if (/modern|digital|tech|innovative/.test(moodText)) {
    lightingDesc = "clean cool modern lighting with crisp shadows";
    colorDesc = "contemporary cool-toned palette with accent highlights";
  } else if (/trust|secure|reliable|safe/.test(moodText)) {
    lightingDesc = "stable even lighting, calm and trustworthy atmosphere";
    colorDesc = "balanced professional blues and neutrals, reliable palette";
  } else if (/seasonal|rainy|summer|winter|monsoon/.test(moodText)) {
    lightingDesc = "atmospheric seasonal lighting matching the weather mood";
    colorDesc = "mood-appropriate seasonal color palette";
  }
  const cameraAngle = hashText(`${mood}|${categoryName}|hook_cam`) % 4;
  const cameraOpts = [
    "eye-level shot optimized for mobile feed",
    "slight three-quarter angle showing depth",
    "slightly low angle making products look substantial",
    "straight-on product-focused composition"
  ];
  const sceneFocus = [
    `Square 1:1 social media ad image for: ${concreteSubject}.`,
    `Scene: ${concreteScene}.`,
    `Primary subject: ${categoryName} items visible prominently.`,
    hook ? `Post message context: "${hook}".` : "",
    `Lighting: ${lightingDesc}. Colors: ${colorDesc}.`,
    `Camera: ${cameraOpts[cameraAngle % cameraOpts.length]}.`,
    imageTextOverlay ? `Leave clean negative space for text overlay: "${imageTextOverlay}". No text rendered inside image.` : "Leave clean negative space for short overlay text. No rendered text in image.",
    "Quality: hyper realistic, Indian local business context, mobile-first composition.",
    audienceMode && audienceMode !== "auto" ? `Audience: ${audienceMode}.` : "",
    imageStyle && imageStyle !== "auto" ? `Style: ${imageStyle}.` : "",
    categoryStyle ? `Category style: ${categoryStyle}.` : "",
    normalizeText(imagePrompt) ? `Additional direction: ${normalizeText(imagePrompt)}.` : "",
    "Restrictions: no readable text, no HOKO word, no logos, no brand names, no celebrity faces, no wall portraits, no framed photos, no watermarks, no distorted hands, no fake social media UI."
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
  return weakTemplateHits >= 3 ? "" : prompt;
}

function buildProviderImagePrompt({ imagePrompt = "", draft = {}, category = {}, campaign = {} }) {
  const cleanAiPrompt = cleanSupportingImagePrompt(imagePrompt);
  const finalPrompt = buildFinalImagePrompt({ imagePrompt: cleanAiPrompt, draft, category, campaign })
    .replace(/\bHOKO\b/gi, "the marketplace app");
  return [
    finalPrompt,
    cleanAiPrompt ? `Additional guidance: ${cleanAiPrompt}.` : "",
    "Format: square 1:1 social media image. No logos, no text, no watermarks, no wall portraits, no framed photos."
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
      linkedin: normalizeText(parsedChannelCaptions.linkedin) || fallback.channelCaptions?.linkedin || "",
      whatsapp: normalizeText(parsedChannelCaptions.whatsapp) || fallback.channelCaptions?.whatsapp || ""
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
      linkedin: normalizeText(parsedChannelCaptions.linkedin) || fallback.channelCaptions?.linkedin || "",
      whatsapp: normalizeText(parsedChannelCaptions.whatsapp) || fallback.channelCaptions?.whatsapp || ""
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
  const basePrompt = normalizeText(prompt) || normalizeText(draft?.imagePrompt) || normalizeText(draft?.hook || draft?.caption);
  const cleanedPrompt = basePrompt
    .replace(/\bShort\s+(?:9:16\s+)?vertical\s+(?:mobile\s+)?social media reel[^.]*\./gi, "")
    .replace(/\bBuying should feel clear, not chaotic\.?\s+HOKO keeps your food & agriculture requirement and seller offers in one place\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return [
    cleanedPrompt,
    "Create one 5-second 9:16 vertical mobile reel.",
    "Set the scene clearly in India: Indian shop, mandi, warehouse, factory, construction site, office desk, or procurement counter as relevant to the category.",
    "Show realistic Indian buyers or business professionals reviewing products, INR price/offer cards, and a local B2B marketplace procurement environment.",
    "Use smooth realistic motion and clean commercial ad style for an India-only HOKO marketplace context.",
    "No readable text, no logos, no watermark."
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
        width: 288,
        num_frames: 81,
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
        width: 288,
        num_frames: 81,
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
