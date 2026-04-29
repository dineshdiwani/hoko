const express = require("express");
const router = express.Router();

const PendingOfferDraft = require("../models/PendingOfferDraft");
const Requirement = require("../models/Requirement");
const TempRequirement = require("../models/TempRequirement");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const WhatsAppLead = require("../models/WhatsAppLead");
const WhatsAppBuyerLead = require("../models/WhatsAppBuyerLead");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppBuyerContact = require("../models/WhatsAppBuyerContact");
const OptedInSeller = require("../models/OptedInSeller");
const User = require("../models/User");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { sendViaGupshupTemplate, sendViaWapiTemplate } = require("../utils/sendWhatsApp");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const PlatformSettings = require("../models/PlatformSettings");
const {
  classifyInboundText,
  extractDeliveryEvents,
  extractInboundEvents,
  parseRegisterPayload
} = require("../services/whatsAppInbound");
const { sendToNewSeller, sendToNewSellerWithCategories } = require("../services/dummyRequirementCron");
const { notifyWhatsAppInteraction } = require("../services/adminNotifications");

router.use(express.json({ limit: "1mb" }));
router.use(express.urlencoded({ extended: false }));

const GREETING_WORDS = new Set(["hi", "hii", "hello", "hey", "start", "menu"]);
const BUYER_WORDS = new Set(["buyer", "buy", "i want to buy", "want to buy", "purchase"]);
const SELLER_WORDS = new Set(["seller", "sell", "i want to sell", "want to sell", "sell"]);
const SKIP_WORDS = new Set(["skip", "na", "none", "no", "-"]);

const consentState = new Map();

const CONSENT_STATES = {
  PENDING: "pending_consent",
  AWAITING_ROLE: "awaiting_role",
  AWAITING_SELLER_CITY: "awaiting_seller_city",
  AWAITING_SELLER_CATEGORIES: "awaiting_seller_categories"
};

async function buildCategorySelectionMessage() {
  let adminCategories = [];
  try {
    const settings = await PlatformSettings.findOne().lean();
    adminCategories = settings?.categories || [];
  } catch (err) {
    console.log("[WhatsApp] Error fetching categories:", err.message);
  }
  
  if (!adminCategories.length) {
    adminCategories = [
      { name: "Electronics & Appliances", serial: 1 },
      { name: "Furniture & Home", serial: 2 },
      { name: "Vehicles & Parts", serial: 3 },
      { name: "Industrial Machinery", serial: 4 },
      { name: "Electrical Parts", serial: 5 },
      { name: "Construction Materials", serial: 6 },
      { name: "Services & Maintenance", serial: 7 },
      { name: "Raw Materials", serial: 8 },
      { name: "Chemicals & Plastics", serial: 9 },
      { name: "Packaging", serial: 10 },
      { name: "Textiles & Apparel", serial: 11 },
      { name: "Food & Agriculture", serial: 12 },
      { name: "Health & Safety", serial: 13 },
      { name: "Logistics & Transport", serial: 14 },
      { name: "Business Services", serial: 15 }
    ];
  } else {
    adminCategories = adminCategories.map((cat, idx) => ({
      name: cat,
      serial: idx + 1
    }));
  }
  
  const lines = ["📦 What do you sell? Select all that apply:", ""];
  adminCategories.forEach((cat) => {
    lines.push(`${cat.serial}. ${cat.name}`);
  });
  lines.push("", "Example: Send '1,3,5' or '0' for all");
  return lines.join("\n");
}

function parseCategorySelection(input, adminCategories = []) {
  const defaultCategories = [
    { name: "Electronics & Appliances", serial: 1 },
    { name: "Furniture & Home", serial: 2 },
    { name: "Vehicles & Parts", serial: 3 },
    { name: "Industrial Machinery", serial: 4 },
    { name: "Electrical Parts", serial: 5 },
    { name: "Construction Materials", serial: 6 },
    { name: "Services & Maintenance", serial: 7 },
    { name: "Raw Materials", serial: 8 },
    { name: "Chemicals & Plastics", serial: 9 },
    { name: "Packaging", serial: 10 },
    { name: "Textiles & Apparel", serial: 11 },
    { name: "Food & Agriculture", serial: 12 },
    { name: "Health & Safety", serial: 13 },
    { name: "Logistics & Transport", serial: 14 },
    { name: "Business Services", serial: 15 }
  ];
  
  const categories = adminCategories.length > 0 ? adminCategories : defaultCategories;
  const nums = input.split(/[,;\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);
  
  const selectedCategories = [];
  const platformCategories = new Set();
  
  for (const num of nums) {
    if (num === 0) {
      categories.forEach(cat => {
        selectedCategories.push(cat.name);
        platformCategories.add(cat.name);
      });
    } else {
      const cat = categories.find(c => c.serial === num);
      if (cat) {
        selectedCategories.push(cat.name);
        platformCategories.add(cat.name);
      }
    }
  }
  
  return {
    whatsappCategories: selectedCategories,
    platformCategories: Array.from(platformCategories),
    hasOfferAnywhere: false
  };
}

function getConsentStateKey(mobileE164) {
  return `consent:${mobileE164}`;
}

function buildRoleSelectionMessage() {
  return [
    "No problem!",
    "",
    "🛒 Reply BUYER → To post your requirement",
    "🏪 Reply SELLER → To receive buyer requirements"
  ].join("\n");
}

function buildWelcomeMessage() {
  return [
    "🙏 Welcome to Hoko",
    "India's smarter way to buy & sell.",
    "",
    "🛒 Want to BUY? → Type BUYER",
    "🏪 Want to SELL? → Type SELLER"
  ].join("\n");
}

function buildConsentPromptMessage() {
  return [
    "🙏 Welcome to Hoko",
    "India's smarter way to buy & sell.",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "Reply with:",
    "1️⃣ Buyer",
    "2️⃣ Seller"
  ].join("\n");
}

function buildConsentConfirmedBuyerMessage(deepLink, product, requirementId) {
  return [
    "✅ Got it! Your requirement is registered 👍",
    "",
    `📋 Requirement ID: ${requirementId || 'HOKO-REQ'}`,
    product ? `📦 Product: ${product}` : "",
    "",
    "🔥 Sellers nearby are being notified!",
    "",
    "📝 Post your complete requirement here:",
    deepLink,
    "",
    "💡 First offer gets priority visibility!"
  ].filter(Boolean).join("\n");
}

function buildBuyerConfirmationMessage(mobile, deepLink) {
  const mobileDisplay = String(mobile || "").replace(/^91/, "").trim();
  const separator = deepLink.includes("?") ? "&" : "?";
  return [
    "🛒 You're a BUYER on HOKO!",
    "",
    "📝 Post your requirement and get multiple seller offers:",
    `${deepLink}${separator}mobile=${mobileDisplay}`,
    "",
    "💡 Fill in your details - sellers near you will respond!"
  ].join("\n");
}

function buildReminderMessage(product, deepLink) {
  return [
    "⏰ Reminder: We haven't heard from you!",
    "",
    product ? `📦 ${product} - sellers are waiting!` : "📦 Sellers have offers ready for you!",
    "",
    "🔥 Complete your requirement to receive offers:",
    deepLink,
    "",
    "💡 First sellers to respond often give the best deals!"
  ].join("\n");
}

function buildConsentConfirmedSellerMessage(city, whatsappCategories, loginLink) {
  const catList = whatsappCategories.slice(0, 3).join(", ");
  const moreCats = whatsappCategories.length > 3 ? ` +${whatsappCategories.length - 3} more` : "";
  return [
    "✅ Perfect! You're SET as a HOKO Seller",
    "",
    `📍 City: ${city}`,
    `📦 Categories: ${catList}${moreCats}`,
    "",
    "Buyers post requirements DAILY in your city!",
    "",
    "📝 Submit your best offers directly:",
    `👉 ${loginLink}`
  ].join("\n");
}

function buildSellerValueMessage(loginLink) {
  return [
    "🏪 You're a SELLER on HOKO!",
    "",
    "🚀 Create your seller account to receive buyer requirements:",
    loginLink,
    "",
    "💡 Fill your details and start receiving offers today!"
  ].join("\n");
}

function buildSellerCityPrompt() {
  return [
    "🏪 You're a SELLER on HOKO!",
    "",
    "✅ Quick question: Which city do you operate in? 📍",
    "",
    "E.g., Mumbai, Delhi, Bangalore, Pune..."
  ].join("\n");
}

function buildExistingSellerMessage(city, whatsappCategories, loginLink) {
  const catList = whatsappCategories.slice(0, 3).join(", ");
  const moreCats = whatsappCategories.length > 3 ? ` +${whatsappCategories.length - 3} more` : "";
  return [
    "✅ Welcome back, HOKO Seller!",
    "",
    `📍 City: ${city}`,
    `📦 Categories: ${catList}${moreCats}`,
    "",
    "💰 Buyers post requirements DAILY - submit offers now!",
    "",
    "👉 View & submit offers:",
    `👉 ${loginLink}`,
    "",
    "💡 First offer = highest visibility!"
  ].join("\n");
}

function buildSellerConfirmationMessage(city, whatsappCategories, loginLink) {
  const catList = whatsappCategories.slice(0, 3).join(", ");
  const moreCats = whatsappCategories.length > 3 ? ` +${whatsappCategories.length - 3} more` : "";
  return [
    "✅ Perfect! You're SET as a HOKO Seller",
    "",
    `📍 City: ${city}`,
    `📦 Categories: ${catList}${moreCats}`,
    "",
    "Buyers post requirements DAILY in your city!",
    "",
    "👉 View & submit offers:",
    `👉 ${loginLink}`,
    "",
    "💡 First offer submitted = highest visibility!"
  ].join("\n");
}

async function sendBuyerInviteLink(mobileE164) {
  const tempReq = await TempRequirement.findOneAndUpdate(
    { mobileE164, status: "pending" },
    {
      $set: { status: "pending", source: "whatsapp", templateUsed: "buyer_invite_post_requirement" },
      $setOnInsert: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  const appBase = resolvePublicAppUrl();
  return `${appBase}/buyer/requirement/new?ref=${tempReq._id.toString()}&mobile=${mobileE164.replace("+", "")}`;
}

async function sendBuyerInviteDirect(mobileE164) {
  const tempReq = await TempRequirement.findOneAndUpdate(
    { mobileE164, status: "pending" },
    {
      $set: { status: "pending", source: "whatsapp_direct", templateUsed: "buyer_direct_invite" },
      $setOnInsert: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  const appBase = resolvePublicAppUrl();
  return `${appBase}/buyer/requirement/new?ref=${tempReq._id.toString()}&mobile=${mobileE164.replace("+", "")}`;
}

async function sendBuyerRequirementInvite(mobileE164) {
  const tempReq = await TempRequirement.findOneAndUpdate(
    { mobileE164, status: "pending" },
    {
      $set: { status: "pending", source: "whatsapp", templateUsed: "buyer_invite_post_requirement" },
      $setOnInsert: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  return await sendBuyerInviteTemplate(mobileE164, tempReq._id.toString());
}

async function createBuyerLeadAndSendConfirmation(mobileE164, product, city, provider = "whatsapp") {
  const requirementId = `HOKO-${Date.now().toString(36).toUpperCase()}`;
  
  const tempReq = await TempRequirement.findOneAndUpdate(
    { mobileE164, status: "pending" },
    {
      $set: { 
        status: "pending", 
        source: "whatsapp_buyer_flow",
        templateUsed: "buyer_welcome_flow",
        product: product,
        city: city
      },
      $setOnInsert: { 
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  const buyerLead = await WhatsAppBuyerLead.findOneAndUpdate(
    { mobileE164 },
    {
      $set: {
        mobileE164,
        provider,
        product: product,
        city: city,
        tempRequirementId: tempReq._id,
        status: "pending"
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  const appBase = resolvePublicAppUrl();
  const deepLink = `${appBase}/buyer/requirement/new?ref=${tempReq._id.toString()}&product=${encodeURIComponent(product || "")}&city=${encodeURIComponent(city || "")}`;
  
  const message = buildBuyerConfirmationMessage(product, city, requirementId, deepLink);
  await sendWhatsAppMessage({
    to: mobileE164,
    body: message
  });
  
  await WhatsAppDeliveryLog.create({
    requirementId: null,
    campaignRunId: null,
    triggerType: "buyer_welcome_confirm",
    channel: "whatsapp",
    mobileE164,
    email: "",
    status: "accepted",
    reason: "",
    provider: resolveWhatsAppProvider(),
    providerMessageId: "",
    city: city || "",
    category: "",
    product: product || "buyer_lead",
    createdByAdminId: null
  });
  
  return { buyerLead, tempReq, deepLink };
}

function scheduleBuyerReminder(mobileE164, product) {
  const REMINDER_DELAY = 10 * 60 * 1000;
  
  setTimeout(async () => {
    try {
      const lead = await WhatsAppBuyerLead.findOne({ 
        mobileE164, 
        status: "pending",
        reminderSent: false 
      });
      
      if (!lead || lead.deepLinkClicked || lead.reminderSent) {
        return;
      }
      
      const tempReq = await TempRequirement.findById(lead.tempRequirementId);
      if (!tempReq) return;
      
      const appBase = resolvePublicAppUrl();
      const deepLink = `${appBase}/buyer/requirement/new?ref=${tempReq._id.toString()}&product=${encodeURIComponent(lead.product || "")}&city=${encodeURIComponent(lead.city || "")}`;
      
      const message = buildReminderMessage(lead.product, deepLink);
      await sendWhatsAppMessage({
        to: mobileE164,
        body: message
      });
      
      await WhatsAppBuyerLead.updateOne(
        { _id: lead._id },
        { $set: { reminderSent: true, reminderSentAt: new Date() } }
      );
      
      await WhatsAppDeliveryLog.create({
        requirementId: null,
        campaignRunId: null,
        triggerType: "buyer_reminder_10min",
        channel: "whatsapp",
        mobileE164,
        email: "",
        status: "accepted",
        reason: "",
        provider: resolveWhatsAppProvider(),
        providerMessageId: "",
        city: lead.city || "",
        category: "",
        product: lead.product || "buyer_reminder",
        createdByAdminId: null
      });
      
      console.log(`[Buyer Reminder] Sent reminder to ${mobileE164}`);
    } catch (err) {
      console.error(`[Buyer Reminder] Error for ${mobileE164}:`, err.message);
    }
  }, REMINDER_DELAY + Math.random() * 2 * 60 * 1000);
}

async function getCitiesFromSettings() {
  try {
    const settings = await PlatformSettings.findOne().lean();
    return settings?.cities || [];
  } catch {
    return [];
  }
}

async function sendSellerInviteLink(mobileE164, city, categories = []) {
  await OptedInSeller.findOneAndUpdate(
    { mobileE164 },
    {
      $set: { 
        mobileE164, 
        city, 
        source: "whatsapp_keyword", 
        status: "active", 
        optedInAt: new Date(),
        whatsappCategories: categories
      }
    },
    { upsert: true, new: true }
  );
  
  const appBase = resolvePublicAppUrl();
  const params = new URLSearchParams();
  params.set("mobile", mobileE164.replace("+", ""));
  if (city) params.set("city", city);
  if (categories.length > 0) params.set("cats", categories.join(","));
  params.set("ref", "wa");
  
  return `${appBase}/seller/login?${params.toString()}`;
}

function normalizeCityName(city) {
  return String(city || "").trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

async function sendSellerRequirementInvite(to, requirementId, product, city, quantity) {
  const provider = resolveWhatsAppProvider();
  if (!["gupshup", "meta"].includes(provider)) {
    console.log(`[Seller Invite] Provider ${provider} not supported for template send`);
    return { ok: false, reason: "unsupported_provider" };
  }

  const deepLink = buildSellerDeepLink(requirementId);

  const templateConfig = await WhatsAppTemplateRegistry.findOne({
    key: "seller_new_requirement_invite_v2",
    isActive: true
  }).lean();

  if (!templateConfig) {
    console.warn("[Seller Invite] Template config not found for seller_new_requirement_invite_v2");
    return { ok: false, reason: "template_not_configured" };
  }

  try {
    const templateId = String(templateConfig.templateId || "").trim();
    const languageCode = String(templateConfig.language || "en").trim();
    const parameters = [product, city, quantity, String(requirementId)];

    const result = provider === "gupshup"
      ? await sendViaGupshupTemplate({
          to,
          templateId,
          templateName: templateConfig.templateName,
          languageCode,
          parameters,
          buttonUrl: String(requirementId)
        })
      : await sendViaWapiTemplate({
          to,
          templateName: templateConfig.templateName,
          languageCode,
          parameters,
          buttonUrl: String(requirementId)
        });

    console.log(`[Seller Invite] Sent to ${to}, providerMessageId: ${result?.providerMessageId}, deepLink: ${deepLink}`);
    return { ok: true, providerMessageId: result?.providerMessageId, deepLink };
  } catch (err) {
    console.error(`[Seller Invite] Failed to send to ${to}:`, err?.message || err);
    return { ok: false, reason: err?.message || "send_failed" };
  }
}

async function notifyMatchingSellers(requirement) {
  const requirementId = requirement._id;
  const product = requirement.productName || requirement.product || "New requirement";
  const city = requirement.city || "";
  const category = requirement.category || "";
  const quantity = String(requirement.quantity || "") + " " + String(requirement.type || "pcs");

  const results = { optedIn: [], registered: [], failed: [] };

  const optedInSellers = await OptedInSeller.find({
    city,
    status: "active",
    ...(category ? { categories: category } : {})
  }).lean();

  for (const seller of optedInSellers) {
    const sendResult = await sendSellerRequirementInvite(
      seller.mobileE164,
      requirementId,
      product,
      city,
      quantity
    );

    await WhatsAppDeliveryLog.create({
      requirementId,
      campaignRunId: null,
      triggerType: "seller_requirement_notify",
      channel: "whatsapp",
      mobileE164: seller.mobileE164,
      email: "",
      status: sendResult.ok ? "accepted" : "failed",
      reason: sendResult.ok ? "" : sendResult.reason,
      provider: resolveWhatsAppProvider(),
      providerMessageId: sendResult.providerMessageId || "",
      city,
      category,
      product: product,
      createdByAdminId: null
    });

    if (sendResult.ok) {
      results.optedIn.push(seller.mobileE164);
      await OptedInSeller.findByIdAndUpdate(seller._id, {
        $set: { lastNotifiedAt: new Date() },
        $inc: { totalNotificationsSent: 1 }
      });
    } else {
      results.failed.push(seller.mobileE164);
    }
  }

  console.log(`[Seller Notify] Notified ${results.optedIn.length} opted-in sellers for requirement ${requirementId}`);
  return results;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function buildSellerDeepLink(requirementId) {
  const appBase = resolvePublicAppUrl();
  return `${appBase}/seller/deeplink/${encodeURIComponent(String(requirementId || "").trim())}`;
}

function buildRequirementLabel(requirement) {
  const product = firstNonEmpty([requirement?.product, requirement?.productName, "this requirement"]);
  const city = firstNonEmpty([requirement?.city]);
  const category = firstNonEmpty([requirement?.category]);
  const parts = [product];
  if (city) parts.push(city);
  if (category) parts.push(category);
  return parts.join(" | ");
}

function buildReplyMessage(intentKind, requirement, deepLink) {
  const label = buildRequirementLabel(requirement);

  if (intentKind === "link") {
    return [
      `Here is your secure Hoko link for ${label}:`,
      deepLink,
      "",
      "Submit your offer there to make it valid."
    ].join("\n");
  }

  if (intentKind === "help") {
    return [
      `For ${label}, offers are accepted only through the secure Hoko form.`,
      `Open this link to continue: ${deepLink}`,
      "",
      "Reply LINK to get the link again.",
      "Reply REGISTER if you need guided onboarding."
    ].join("\n");
  }

  if (intentKind === "register") {
    return [
      "Guided onboarding is available.",
      "Reply in this format:",
      "REGISTER | Firm Name | Manager Name | Category | City | Email",
      "",
      `You can also continue directly here: ${deepLink}`
    ].join("\n");
  }

  if (intentKind === "offer_intent") {
    return [
      "Got your interest.",
      "To make this offer valid, submit it through the secure Hoko form:",
      deepLink,
      "",
      "Reply REGISTER if you need guided onboarding."
    ].join("\n");
  }

  return [
    `Thanks for your reply about ${label}.`,
    `Continue here: ${deepLink}`,
    "",
    "Reply HELP for options."
  ].join("\n");
}

function buildRegisterConfirmationMessage(requirement, deepLink, profile) {
  const label = buildRequirementLabel(requirement);
  const profileParts = [
    profile?.registeredBusinessName ? `Business: ${profile.registeredBusinessName}` : "",
    profile?.managerName ? `Manager: ${profile.managerName}` : "",
    profile?.category ? `Category: ${profile.category}` : "",
    profile?.city ? `City: ${profile.city}` : "",
    profile?.email ? `Email: ${profile.email}` : ""
  ].filter(Boolean);

  return [
    "Registration details received.",
    profileParts.join(" | "),
    "",
    `Continue for ${label}:`,
    deepLink
  ].filter(Boolean).join("\n");
}

function normalizeInboundText(value) {
  return String(value || "").trim().toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();
}

function buildConsentPromptMessage() {
  return [
    "🙏 Welcome to Hoko",
    "India's smarter way to buy & sell.",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "Reply with:",
    "1️⃣ Buyer",
    "2️⃣ Seller"
  ].join("\n");
}

function buildConsentConfirmedMessage() {
  return [
    "🙏 Welcome to Hoko",
    "India's smarter way to buy & sell.",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "Reply with:",
    "1️⃣ Buyer",
    "2️⃣ Seller"
  ].join("\n");
}

function buildGenericHelpMessage() {
  return [
    "🙏 Welcome to Hoko",
    "India's smarter way to buy & sell.",
    "",
    "🛒 Want to BUY? → Type BUYER",
    "🏪 Want to SELL? → Type SELLER"
  ].join("\n");
}

function buildUnknownIntentGreetingMessage(receivedText) {
  const truncated = receivedText.length > 50 
    ? receivedText.substring(0, 47) + "..." 
    : receivedText;
  return [
    "🙏 Welcome to Hoko",
    "India's smarter way to buy & sell.",
    "",
    `📩 We received: "${truncated}"`,
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "Reply with:",
    "1️⃣ Buyer",
    "2️⃣ Seller"
  ].join("\n");
}

function resolveWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
}

async function sendBuyerInviteTemplate(to, tempRequirementId) {
  const provider = resolveWhatsAppProvider();
  if (!["gupshup", "meta"].includes(provider)) {
    console.log(`[Buyer Invite] Provider ${provider} not supported for template send`);
    return { ok: false, reason: "unsupported_provider" };
  }

  const appBase = resolvePublicAppUrl();
  const deepLink = `${appBase}/buyer/requirement/new?ref=${tempRequirementId}`;

  const templateConfig = await WhatsAppTemplateRegistry.findOne({
    key: "buyer_invite_post_requirement",
    isActive: true
  }).lean();

  if (!templateConfig) {
    console.warn("[Buyer Invite] Template config not found for buyer_invite_post_requirement_v2");
    return { ok: false, reason: "template_not_configured" };
  }

  try {
    const templateId = String(templateConfig.templateId || "").trim();
    const languageCode = String(templateConfig.language || "en").trim();
    const mobileDisplay = String(to || "").replace(/^91/, "").trim();
    const deepLinkWithMobile = `${deepLink}?mobile=${mobileDisplay}`;
    const parameters = [deepLinkWithMobile];

    const result = provider === "gupshup"
      ? await sendViaGupshupTemplate({
          to,
          templateId,
          templateName: templateConfig.templateName,
          languageCode,
          parameters
        })
      : await sendViaWapiTemplate({
          to,
          templateName: templateConfig.templateName,
          languageCode,
          parameters
        });

    console.log(`[Buyer Invite] Sent to ${to}, providerMessageId: ${result?.providerMessageId}`);
    return { ok: true, providerMessageId: result?.providerMessageId, deepLink };
  } catch (err) {
    console.error(`[Buyer Invite] Failed to send to ${to}:`, err?.message || err);
    return { ok: false, reason: err?.message || "send_failed" };
  }
}

async function createTempRequirementAndSendInvite(mobileE164) {
  const existing = await TempRequirement.findOne({
    mobileE164,
    status: "pending"
  }).sort({ createdAt: -1 });

  if (existing) {
    console.log(`[Buyer Invite] Existing pending TempRequirement found for ${mobileE164}`);
  }

  const tempReq = await TempRequirement.findOneAndUpdate(
    {
      mobileE164,
      status: "pending"
    },
    {
      $set: {
        mobileE164,
        status: "pending",
        source: "whatsapp",
        templateUsed: "buyer_invite_post_requirement_v2"
      },
      $setOnInsert: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  const sendResult = await sendBuyerInviteTemplate(mobileE164, tempReq._id.toString());

  await WhatsAppDeliveryLog.create({
    requirementId: null,
    campaignRunId: null,
    triggerType: "buyer_invite",
    channel: "whatsapp",
    mobileE164,
    email: "",
    status: sendResult.ok ? "accepted" : "failed",
    reason: sendResult.ok ? "" : sendResult.reason,
    provider: resolveWhatsAppProvider(),
    providerMessageId: sendResult.providerMessageId || "",
    city: "",
    category: "",
    product: "buyer_invite",
    createdByAdminId: null
  });

  return { tempRequirement: tempReq, sendResult };
}

async function loadContactByMobile(mobileE164) {
  const [sellerContact, buyerContact] = await Promise.all([
    WhatsAppContact.findOne({ mobileE164 }).sort({ updatedAt: -1 }),
    WhatsAppBuyerContact.findOne({ mobileE164 })
  ]);
  return { sellerContact, buyerContact };
}

async function ensureBuyerProspect(mobileE164) {
  const now = new Date();
  return WhatsAppBuyerContact.findOneAndUpdate(
    { mobileE164 },
    {
      $setOnInsert: {
        mobileE164,
        active: true,
        optInStatus: "not_opted_in",
        optInSource: "whatsapp_inbound_pending",
        optInAt: null,
        pendingOptInAt: now,
        consentEvidence: "Inbound WhatsApp message captured. Awaiting YES confirmation.",
        unsubscribedAt: null,
        unsubscribeReason: "",
        dndStatus: "allow",
        dndSource: "",
        source: "wa_me_inbound"
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
}

async function applyConsentConfirmed(contact, modelName, event) {
  if (!contact?._id) return;
  const now = new Date();
  const update = {
    active: true,
    optInStatus: "opted_in",
    optInSource: "whatsapp_inbound_confirmed",
    optInAt: now,
    pendingOptInAt: null,
    consentEvidence: `Confirmed via inbound message "${String(event?.text || "").trim()}" at ${now.toISOString()}`,
    unsubscribedAt: null,
    unsubscribeReason: ""
  };
  if (modelName === "seller") {
    await WhatsAppContact.findByIdAndUpdate(contact._id, { $set: update });
  } else {
    await WhatsAppBuyerContact.findByIdAndUpdate(contact._id, { $set: update });
  }
}

async function applyConsentPending(contact, modelName, event) {
  if (!contact?._id) return;
  const now = new Date();
  const update = {
    pendingOptInAt: now,
    consentEvidence: `Pending confirmation from inbound "${String(event?.text || "").trim()}" at ${now.toISOString()}`
  };
  if (modelName === "seller") {
    await WhatsAppContact.findByIdAndUpdate(contact._id, { $set: update });
  } else {
    await WhatsAppBuyerContact.findByIdAndUpdate(contact._id, { $set: update });
  }
}

router.get("/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] || "").trim();
  const token = String(req.query["hub.verify_token"] || "").trim();
  const challenge = String(req.query["hub.challenge"] || "").trim();
  const expectedToken = String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "").trim();

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  const deliveryEvents = extractDeliveryEvents(req.body);
  if (deliveryEvents.length) {
    for (const event of deliveryEvents) {
      const updates = {
        status: event.status,
        provider: event.provider || "",
        reason: event.status === "failed" ? String(event.reason || "provider_failed") : "",
        ...(event.providerMessageId ? { providerMessageId: event.providerMessageId } : {})
      };
      if (event.mobileE164) {
        updates.mobileE164 = event.mobileE164;
      }
      const updated = await WhatsAppDeliveryLog.findOneAndUpdate(
        { providerMessageId: event.providerMessageId },
        { $set: updates },
        { sort: { createdAt: -1 } }
      );
      if (!updated && event.mobileE164) {
        await WhatsAppDeliveryLog.findOneAndUpdate(
          {
            mobileE164: event.mobileE164,
            channel: "whatsapp",
            status: { $in: ["accepted", "queued", "sent"] }
          },
          { $set: updates },
          { sort: { createdAt: -1 } }
        );
      }
    }
  }

  const events = extractInboundEvents(req.body);
  if (!events.length) {
    console.log("[WA WEBHOOK] No inbound events extracted from body:", JSON.stringify(req.body).substring(0, 500));
    return res.status(200).json({
      ok: true,
      received: 0,
      deliveryUpdates: deliveryEvents.length
    });
  }
  
console.log("[WA WEBHOOK] Extracted events:", events.length, events.map(e => ({ text: e.text, mobile: e.mobileE164 })));

  for (const event of events) {
    const normalizedInbound = normalizeInboundText(event.text);
    const { sellerContact, buyerContact } = await loadContactByMobile(event.mobileE164);
    const consentKey = getConsentStateKey(event.mobileE164);
    const currentConsentState = consentState.get(consentKey);

    if (!sellerContact && !buyerContact) {
      await ensureBuyerProspect(event.mobileE164);
      notifyWhatsAppInteraction(event.mobileE164, "", event.text || "");
      
      // New user - show greeting and handle BUYER/SELLER directly
      if (BUYER_WORDS.has(normalizedInbound)) {
        await applyConsentConfirmed(await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 }), "buyer", event);
        
        const deepLink = await sendBuyerInviteDirect(event.mobileE164);
        const message = buildBuyerConfirmationMessage(event.mobileE164, deepLink);
        
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: message
        });
        
        consentState.delete(consentKey);
        continue;
      }
      
      if (SELLER_WORDS.has(normalizedInbound)) {
        consentState.delete(consentKey);
        consentState.set(consentKey, { 
          step: CONSENT_STATES.AWAITING_SELLER_CITY, 
          mobileE164: event.mobileE164 
        });
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: buildSellerCityPrompt()
        });
        continue;
      }
      
      // Default - show greeting
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildGenericHelpMessage()
      });
      continue;
    }

    const latestSellerContact = sellerContact || null;
    const latestBuyerContact =
      buyerContact || (await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 }));

    const isAwaitingCategories = currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CATEGORIES;
    const isAwaitingCity = currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CITY;
    
    // Existing users - simplified flow
    if (GREETING_WORDS.has(normalizedInbound)) {
      consentState.delete(consentKey);
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildWelcomeMessage()
      });
      continue;
    }

    if (BUYER_WORDS.has(normalizedInbound)) {
      consentState.delete(consentKey);
      const deepLink = await sendBuyerInviteDirect(event.mobileE164);
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildBuyerConfirmationMessage(event.mobileE164, deepLink)
      });
      continue;
    }

    if (SELLER_WORDS.has(normalizedInbound)) {
      consentState.delete(consentKey);
      consentState.set(consentKey, { 
        step: CONSENT_STATES.AWAITING_SELLER_CITY, 
        mobileE164: event.mobileE164 
      });
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildSellerCityPrompt()
      });
      continue;
    }

    // Handle seller city input
    if (isAwaitingCity) {
      const inboundText = String(event.text || "").trim();
      if (!inboundText || inboundText.length < 2) {
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: "Please share your city name (e.g., Mumbai, Delhi, Bangalore)"
        });
        continue;
      }
      
      const citiesData = await PlatformSettings.findOne().lean();
      const cities = citiesData?.cities || [];
      const inputCity = normalizeCityName(inboundText);
      const matchedCity = cities.find(c => normalizeCityName(c) === inputCity);
      const cityToSave = matchedCity || inboundText;
      
      consentState.set(consentKey, { 
        step: CONSENT_STATES.AWAITING_SELLER_CATEGORIES, 
        mobileE164: event.mobileE164,
        city: cityToSave 
      });
      
      const categoryMessage = await buildCategorySelectionMessage();
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: categoryMessage
      });
      continue;
    }
    
    // Handle seller categories input
    if (currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CATEGORIES) {
      const inboundText = String(event.text || "").trim();
      const cityToSave = currentConsentState?.city || "";
      
      const settings = await PlatformSettings.findOne().lean();
      const adminCategoriesRaw = settings?.categories || [];
      const adminCategories = adminCategoriesRaw.length > 0 
        ? adminCategoriesRaw.map((cat, idx) => ({ name: cat, serial: idx + 1 }))
        : [];
      
      const parsed = parseCategorySelection(inboundText, adminCategories);
      
      if (parsed.whatsappCategories.length === 0) {
        const categoryMessage = await buildCategorySelectionMessage();
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: "Invalid selection. " + categoryMessage
        });
        continue;
      }
      
      consentState.delete(consentKey);
      
      const appBase = resolvePublicAppUrl();
      const params = new URLSearchParams();
      params.set("mobile", event.mobileE164.replace("+", ""));
      params.set("ref", "wa");
      params.set("city", cityToSave);
      params.set("cats", parsed.whatsappCategories.join(","));
      
      // Check if seller already exists
      const existingUser = await User.findOne({ mobile: event.mobileE164 }).select("_id roles").lean();
      const isExistingSeller = existingUser && existingUser.roles?.seller;
      
if (isExistingSeller) {
        const loginParams = new URLSearchParams();
        loginParams.set("mobile", event.mobileE164.replace("+", ""));
        loginParams.set("city", cityToSave);
        loginParams.set("cats", parsed.whatsappCategories.join(","));
        loginParams.set("from", "wa");
        const loginLink = `${appBase}/seller/dashboard?${loginParams.toString()}`;
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: buildExistingSellerMessage(cityToSave, parsed.whatsappCategories, loginLink)
        });
      } else {
        const loginParams = new URLSearchParams();
        loginParams.set("mobile", event.mobileE164.replace("+", ""));
        loginParams.set("city", cityToSave);
        loginParams.set("cats", parsed.whatsappCategories.join(","));
        loginParams.set("from", "wa");
        const loginLink = `${appBase}/seller/dashboard?${loginParams.toString()}`;
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: buildSellerConfirmationMessage(cityToSave, parsed.whatsappCategories, loginLink)
        });
      }
      continue;
    }

    const intent = classifyInboundText(event.text);
    const registerPayload = intent.kind === "register"
      ? parseRegisterPayload(event.text)
      : null;

    const lead = await WhatsAppLead.findOneAndUpdate(
      { mobileE164: event.mobileE164 },
      {
        $set: {
          provider: event.provider,
          "profile.managerName": event.profileName || "",
          lastInboundText: event.text,
          lastInboundAt: new Date(),
          lastProviderMessageId: event.providerMessageId,
          lastIntent: intent,
          ...(registerPayload?.isStructured
            ? {
                profile: {
                  registeredBusinessName: registerPayload.registeredBusinessName,
                  managerName: registerPayload.managerName,
                  category: registerPayload.category,
                  city: registerPayload.city,
                  email: registerPayload.email
                },
                onboardingStatus: "profile_captured"
              }
            : {})
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    let requirement = null;
    const requirementId = lead?.requirementId || null;
    if (requirementId) {
      requirement = await Requirement.findById(requirementId)
        .select("_id city category product productName moderation.removed")
        .lean();
    }

    if (intent.kind === "offer_intent") {
      await PendingOfferDraft.findOneAndUpdate(
        {
          mobileE164: event.mobileE164,
          requirementId: lead?.requirementId || null,
          status: "pending"
        },
        {
          $set: {
            mobileE164: event.mobileE164,
            requirementId: lead?.requirementId || null,
            source: {
              provider: event.provider,
              providerMessageId: event.providerMessageId
            },
            price: intent.detectedPrice,
            deliveryDays: intent.detectedDeliveryDays,
            note: event.text,
            rawMessage: event.text
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }

    if (
      requirement?._id &&
      requirement?.moderation?.removed !== true &&
      ["link", "help", "register", "offer_intent"].includes(intent.kind)
    ) {
      const deepLink = buildSellerDeepLink(requirement._id);
      const replyBody =
        intent.kind === "register" && registerPayload?.isStructured
          ? buildRegisterConfirmationMessage(requirement, deepLink, registerPayload)
          : buildReplyMessage(intent.kind, requirement, deepLink);
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: replyBody
      });
    }

    if (!["link", "help", "register", "offer_intent"].includes(intent.kind)) {
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildUnknownIntentGreetingMessage(event.text)
      });
    }
  }

  return res.status(200).json({
    ok: true,
    received: events.length,
    deliveryUpdates: deliveryEvents.length
  });
});

module.exports = router;
module.exports.notifyMatchingSellers = notifyMatchingSellers;


