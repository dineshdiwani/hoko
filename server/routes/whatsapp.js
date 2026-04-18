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
const WhatsAppConversationState = require("../models/WhatsAppConversationState");
const WhatsAppFunnelEvent = require("../models/WhatsAppFunnelEvent");
const OptedInSeller = require("../models/OptedInSeller");
const User = require("../models/User");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { sendViaGupshupTemplate } = require("../utils/sendWhatsApp");
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

const CONSENT_CONFIRM_WORDS = new Set(["yes", "y", "confirm", "i agree", "agree"]);
const GREETING_WORDS = new Set(["hi", "hii", "hello", "hey", "start", "menu"]);
const BUYER_WORDS = new Set(["buyer", "buy", "i want to buy", "want to buy", "purchase"]);
const SELLER_WORDS = new Set(["seller", "sell", "i want to sell", "want to sell", "sell"]);
const SKIP_WORDS = new Set(["skip", "na", "none", "no", "-"]);
const UPDATE_WORDS = new Set([
  "send updates on my post", "send updates", "get updates", "enable updates", 
  "whatsapp updates", "updates on my post", "updates on post", 
  "get whatsapp updates", "enable whatsapp", "i want updates", "want updates"
]);

// Helper to check if message contains any update keyword
function containsUpdateKeyword(text) {
  const normalized = String(text || "").trim().toLowerCase();
  return Array.from(UPDATE_WORDS).some(keyword => normalized.includes(keyword));
}

const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

async function logFunnelEvent({
  mobileE164,
  direction = "system",
  eventType,
  campaign = "",
  step = "",
  provider = "",
  providerMessageId = "",
  status = "",
  metadata = {}
}) {
  if (!mobileE164 || !eventType) return;
  try {
    await WhatsAppFunnelEvent.create({
      mobileE164,
      direction,
      eventType,
      campaign,
      step,
      provider,
      providerMessageId,
      status,
      metadata
    });
  } catch (err) {
    console.warn("[WhatsApp Funnel] log failed", err?.message || err);
  }
}

function resolveTrackedLink(pathname, params = {}) {
  const base = resolvePublicAppUrl();
  const url = new URL(pathname, base);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    url.searchParams.set(key, text);
  });
  return url.toString();
}

function buildBuyerAppLink(mobileE164, campaign = "wa_inbound", step = "buyer_role") {
  return resolveTrackedLink("/buyer/requirement/new", {
    mobile: String(mobileE164 || "").replace(/[^\d]/g, ""),
    src: "wa",
    campaign,
    step
  });
}

function buildSellerAppLink(mobileE164, campaign = "wa_inbound", step = "seller_role") {
  return resolveTrackedLink("/seller/login", {
    mobile: String(mobileE164 || "").replace(/[^\d]/g, ""),
    ref: "wa",
    src: "wa",
    campaign,
    step
  });
}

async function loadConversationState(mobileE164) {
  if (!mobileE164) return null;
  const now = new Date();
  const state = await WhatsAppConversationState.findOne({ mobileE164 }).lean();
  if (!state) return null;
  if (state.expiresAt && new Date(state.expiresAt).getTime() < now.getTime()) {
    await WhatsAppConversationState.deleteOne({ mobileE164 });
    return null;
  }
  return state;
}

async function saveConversationState(mobileE164, payload = {}) {
  if (!mobileE164) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONVERSATION_TTL_MS);
  await WhatsAppConversationState.findOneAndUpdate(
    { mobileE164 },
    {
      $set: {
        mobileE164,
        stage: String(payload.stage || "awaiting_role"),
        provider: String(payload.provider || "unknown"),
        lastInboundText: String(payload.lastInboundText || ""),
        lastIntent: String(payload.lastIntent || ""),
        context: payload.context && typeof payload.context === "object" ? payload.context : {},
        expiresAt
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function clearConversationState(mobileE164) {
  if (!mobileE164) return;
  await WhatsAppConversationState.deleteOne({ mobileE164 });
}

async function sendFlowMessage({
  to,
  body,
  campaign = "",
  step = "",
  metadata = {},
  templateKey = "",
  templateParams = [],
  buttonUrl = ""
}) {
  let result;
  let usedTemplate = false;

  if (templateKey) {
    try {
      const templateConfig = await WhatsAppTemplateRegistry.findOne({
        key: templateKey,
        isActive: true
      }).lean();

      if (templateConfig) {
        const resolvedButtonUrl = buttonUrl || (templateConfig.buttonUrlPattern
          ? resolveTrackedLink(templateConfig.buttonUrlPattern, { src: "wa", campaign, step })
          : "");

        result = await sendViaGupshupTemplate({
          to,
          templateId: templateConfig.templateId,
          templateName: templateConfig.templateName,
          languageCode: templateConfig.language || "en",
          parameters: templateParams,
          buttonUrl: resolvedButtonUrl
        });
        result = { ok: true, providerMessageId: result?.providerMessageId || "", template: true };
        usedTemplate = true;
      }
    } catch (err) {
      console.warn(`[sendFlowMessage] Template ${templateKey} failed, falling back to free-text:`, err?.message || err);
    }
  }

  if (!usedTemplate) {
    result = await sendWhatsAppMessage({ to, body });
  }

  await logFunnelEvent({
    mobileE164: to,
    direction: "outbound",
    eventType: "message_sent",
    campaign,
    step,
    provider: resolveWhatsAppProvider(),
    providerMessageId: String(result?.providerMessageId || ""),
    status: result?.ok ? "sent" : "failed",
    metadata: {
      bodyPreview: String(body || "").slice(0, 140),
      usedTemplate,
      templateKey: templateKey || "",
      ...metadata
    }
  });
  return result;
}

const CONSENT_STATES = {
  PENDING: "pending_consent",
  AWAITING_ROLE: "awaiting_role",
  AWAITING_BUYER_PRODUCT: "awaiting_buyer_product",
  AWAITING_BUYER_CITY: "awaiting_buyer_city",
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
      "Electronics & Appliances", "Furniture & Home", "Vehicles & Parts",
      "Industrial Machinery", "Electrical Parts", "Construction Materials",
      "Services & Maintenance", "Raw Materials", "Chemicals & Plastics",
      "Packaging", "Textiles & Apparel", "Food & Agriculture",
      "Health & Safety", "Logistics & Transport", "Business Services"
    ];
  }
  
  const lines = ["Great! Select categories you deal in (send numbers):", ""];
  adminCategories.forEach((cat, idx) => {
    lines.push(`[${idx + 1}] ${cat}`);
  });
  lines.push("", "Example: Send '1,3,5' or '1' or '0' for all");
  return lines.join("\n");
}

function parseCategorySelection(input, adminCategories = []) {
  const defaultCategories = [
    "Electronics & Appliances", "Furniture & Home", "Vehicles & Parts",
    "Industrial Machinery", "Electrical Parts", "Construction Materials",
    "Services & Maintenance", "Raw Materials", "Chemicals & Plastics",
    "Packaging", "Textiles & Apparel", "Food & Agriculture",
    "Health & Safety", "Logistics & Transport", "Business Services"
  ];
  
  const categories = adminCategories.length > 0 ? adminCategories : defaultCategories;
  const nums = input.split(/[,;\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);
  
  const selectedCategories = [];
  const platformCategories = new Set();
  
  for (const num of nums) {
    if (num === 0) {
      categories.forEach(cat => {
        selectedCategories.push(cat);
        platformCategories.add(cat);
      });
    } else {
      const idx = num - 1;
      if (idx >= 0 && idx < categories.length) {
        const cat = categories[idx];
        selectedCategories.push(cat);
        platformCategories.add(cat);
      }
    }
  }
  
  return {
    whatsappCategories: selectedCategories,
    platformCategories: Array.from(platformCategories),
    hasOfferAnywhere: false
  };
}

function buildRoleSelectionMessage() {
  return [
    "Choose your role to continue.",
    "Reply BUYER to post requirements.",
    "Reply SELLER to receive buyer leads."
  ].join("\n");
}

function buildWelcomeMessage() {
  return [
    "Welcome to Hoko.",
    "Get verified business demand and supply in one platform.",
    "Reply BUYER or SELLER."
  ].join("\n");
}

function buildConsentPromptMessage() {
  return [
    "WhatsApp updates are enabled for this number.",
    "To continue, choose your role in Hoko.",
    "Reply BUYER or SELLER."
  ].join("\n");
}

function buildConsentConfirmedMessage() {
  return [
    "Role confirmed.",
    "Use the app to complete your workflow quickly.",
    "Reply BUYER or SELLER if you want to switch role."
  ].join("\n");
}

function buildUpdatesConfirmationMessage() {
  return [
    "Updates are enabled for this WhatsApp number.",
    "You will get WhatsApp alerts when sellers respond to your requirements."
  ].join("\n");
}

function buildGenericHelpMessage() {
  return [
    "Hoko assistant is ready.",
    "Use WhatsApp for alerts and open the app for actions.",
    "Reply BUYER or SELLER."
  ].join("\n");
}

function buildUnknownIntentGreetingMessage(receivedText) {
  const truncated = String(receivedText || "").length > 60
    ? String(receivedText).slice(0, 57) + "..."
    : String(receivedText || "");
  return [
    `Message received: ${truncated}`,
    "To continue in Hoko, choose your role.",
    "Reply BUYER or SELLER."
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

function buildBuyerConfirmationMessage(product, city, requirementId, deepLink) {
  return [
    "✅ Got it! Your requirement is saved 👍",
    "",
    `📋 ID: ${requirementId || 'HOKO-REQ'}`,
    `📦 ${product}`,
    city ? `📍 City: ${city}` : "",
    "",
    "🔥 Sellers will start sending offers soon!",
    "",
    "📝 Complete your requirement & get offers:",
    deepLink,
    "",
    "💡 Top tip: Respond to first 3 offers quickly for best deals!",
    "",
    "Need help? Reply HELP anytime."
  ].filter(Boolean).join("\n");
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
    "✅ Perfect! You're registered as a HOKO Seller 🏪",
    "",
    `📍 City: ${city}`,
    `📦 Categories: ${catList}${moreCats}`,
    "",
    "🔥 Buyers post requirements DAILY in your city!",
    "",
    "📝 Submit your best offers directly:",
    `👉 ${loginLink}`,
    "",
    "💡 Tip: First to respond gets more orders!",
    "",
    "Our team will verify your profile shortly."
  ].join("\n");
}

function buildSellerValueMessage(loginLink, city) {
  return [
    "🔥 You made a smart choice!",
    "",
    "Buyers in " + (city || "your city") + " are posting requirements RIGHT NOW!",
    "",
    "📦 Get daily buyer requirements",
    "💰 Submit your best prices",
    "🏆 Win more orders",
    "",
    "🚀 Start now:",
    loginLink,
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
  
  const mobileParam = mobileE164.replace("+", "");
  return resolveTrackedLink("/buyer/requirement/new", {
    ref: tempReq._id.toString(),
    mobile: mobileParam,
    src: "wa",
    campaign: "buyer_invite",
    step: "post_requirement"
  });
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
  
  const mobileParam = mobileE164.replace("+", "");
  return await sendBuyerInviteTemplate(mobileE164, tempReq._id.toString(), mobileParam);
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
  
  const mobileParam = mobileE164.replace("+", "");
  const deepLink = resolveTrackedLink("/buyer/requirement/new", {
    ref: tempReq._id.toString(),
    mobile: mobileParam,
    product: encodeURIComponent(product || ""),
    city: encodeURIComponent(city || ""),
    src: "wa",
    campaign: "buyer_welcome",
    step: "post_requirement"
  });
  
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
      
      const deepLink = resolveTrackedLink("/buyer/requirement/new", {
        ref: tempReq._id.toString(),
        product: encodeURIComponent(lead.product || ""),
        city: encodeURIComponent(lead.city || ""),
        src: "wa",
        campaign: "buyer_reminder",
        step: "10min_reminder"
      });
      
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
  
  return resolveTrackedLink("/seller/login", {
    mobile: mobileE164.replace("+", ""),
    city,
    cats: categories.length > 0 ? categories.join(",") : "",
    ref: "wa",
    src: "wa",
    campaign: "seller_optin",
    step: "login"
  });
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

    const result = await sendViaGupshupTemplate({
      to,
      templateId,
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

  // Notify opted-in sellers (existing behavior)
  const optedInSellers = await OptedInSeller.find({
    city,
    status: "active",
    ...(category ? { categories: category } : {})
  }).lean();

  // Also notify registered sellers who gave WhatsApp consent
  const registeredSellers = await User.find({
    "roles.seller": true,
    "sellerProfile.isActive": { $ne: false },
    "sellerSettings.whatsappConsent": true,
    ...(category ? { "sellerProfile.categories": { $in: [category] } } : {}),
    mobile: { $exists: true, $ne: "" }
  }).select("mobile").lean();

  // Get unique mobile numbers to notify
  const allSellerMobiles = new Set();
  const sellersToNotify = [];

  // Add opted-in sellers
  for (const seller of optedInSellers) {
    if (seller.mobileE164 && !allSellerMobiles.has(seller.mobileE164)) {
      allSellerMobiles.add(seller.mobileE164);
      sellersToNotify.push({ mobileE164: seller.mobileE164, source: "optedIn" });
    }
  }

  // Add registered sellers with consent
  for (const seller of registeredSellers) {
    const mobileE164 = seller.mobile?.startsWith("+") ? seller.mobile : seller.mobile ? `+91${seller.mobile}` : null;
    if (mobileE164 && !allSellerMobiles.has(mobileE164)) {
      allSellerMobiles.add(mobileE164);
      sellersToNotify.push({ mobileE164, source: "registered" });
    }
  }

  console.log(`[Seller Notify] Notifying ${optedInSellers.length} opted-in + ${registeredSellers.length} registered = ${sellersToNotify.length} total sellers for requirement ${requirementId}`);

  // Send notifications to all sellers
  for (const seller of sellersToNotify) {
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
      if (seller.source === "optedIn") {
        results.optedIn.push(seller.mobileE164);
      } else {
        results.registered.push(seller.mobileE164);
      }
    } else {
      results.failed.push(seller.mobileE164);
    }
  }

  console.log(`[Seller Notify] Results - OptedIn: ${results.optedIn.length}, Registered: ${results.registered.length}, Failed: ${results.failed.length}`);
  return results;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function buildSellerDeepLink(requirementId) {
  const requirementToken = encodeURIComponent(String(requirementId || "").trim());
  return resolveTrackedLink(`/seller/deeplink/${requirementToken}`, {
    src: "wa",
    campaign: "seller_requirement_alert",
    step: "open_requirement"
  });
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
    profile?.firmName ? `Firm: ${profile.firmName}` : "",
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
  return String(value || "").trim().toLowerCase();
}



function resolveWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
}

async function sendBuyerInviteTemplate(to, tempRequirementId, mobile) {
  const provider = resolveWhatsAppProvider();
  if (!["gupshup", "meta"].includes(provider)) {
    console.log(`[Buyer Invite] Provider ${provider} not supported for template send`);
    return { ok: false, reason: "unsupported_provider" };
  }

  const mobileParam = mobile || to.replace("+", "");
  const deepLink = resolveTrackedLink("/buyer/requirement/new", {
    ref: tempRequirementId,
    mobile: mobileParam,
    src: "wa",
    campaign: "buyer_invite_template",
    step: "post_requirement"
  });

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
    const parameters = [deepLink];

    const result = await sendViaGupshupTemplate({
      to,
      templateId,
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

  const sendResult = await sendBuyerInviteTemplate(mobileE164, tempReq._id.toString(), mobileE164.replace("+", ""));

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
    return res.status(200).json({
      ok: true,
      received: 0,
      deliveryUpdates: deliveryEvents.length
    });
  }

  for (const event of events) {
    await logFunnelEvent({
      mobileE164: event.mobileE164,
      direction: "inbound",
      eventType: "message_received",
      campaign: "wa_inbound",
      step: "incoming",
      provider: event.provider || "",
      providerMessageId: String(event.providerMessageId || ""),
      status: "received",
      metadata: { text: String(event.text || "").slice(0, 200) }
    });

    const normalizedInbound = normalizeInboundText(event.text);
    const consentConfirmed = CONSENT_CONFIRM_WORDS.has(normalizedInbound);
    const { sellerContact, buyerContact } = await loadContactByMobile(event.mobileE164);
    const currentConsentState = await loadConversationState(event.mobileE164);
    let consentHandled = false;
    const updateIntent = containsUpdateKeyword(event.text);
    const isBuyerIntent =
      BUYER_WORDS.has(normalizedInbound) ||
      normalizedInbound === "buy" ||
      normalizedInbound === "buyer" ||
      normalizedInbound === "1";
    const isSellerIntent =
      SELLER_WORDS.has(normalizedInbound) ||
      normalizedInbound === "sell" ||
      normalizedInbound === "seller" ||
      normalizedInbound === "2";

    if (updateIntent) {
      let buyerConsentContact = buyerContact;
      let sellerConsentContact = sellerContact;

      if (!buyerConsentContact && !sellerConsentContact) {
        buyerConsentContact = await ensureBuyerProspect(event.mobileE164);
      }

      if (buyerConsentContact) {
        await applyConsentConfirmed(buyerConsentContact, "buyer", event);
      } else if (sellerConsentContact) {
        await applyConsentConfirmed(sellerConsentContact, "seller", event);
      }

      await clearConversationState(event.mobileE164);
      await sendFlowMessage({
        to: event.mobileE164,
        body: buildUpdatesConfirmationMessage(),
        campaign: "wa_consent",
        step: "updates_enabled"
      });
      continue;
    }

    if (isBuyerIntent) {
      const buyerProspect = buyerContact || (await ensureBuyerProspect(event.mobileE164));
      await applyConsentConfirmed(buyerProspect, "buyer", event);
      await clearConversationState(event.mobileE164);
      const buyerLink = buildBuyerAppLink(event.mobileE164, "wa_inbound", "buyer_role");
      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          "Buyer mode selected.",
          "Post your requirement in Hoko and receive verified offers.",
          `Open app: ${buyerLink}`
        ].join("\n"),
        campaign: "wa_inbound",
        step: "buyer_role_cta",
        metadata: { deepLink: buyerLink },
        templateKey: "buyer_role_cta",
        templateParams: [buyerLink],
        buttonUrl: buyerLink
      });
      continue;
    }

    if (isSellerIntent) {
      const buyerProspect = buyerContact || (await ensureBuyerProspect(event.mobileE164));
      await applyConsentConfirmed(buyerProspect, "buyer", event);
      await clearConversationState(event.mobileE164);
      const sellerLink = buildSellerAppLink(event.mobileE164, "wa_inbound", "seller_role");
      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          "Seller mode selected.",
          "Open Hoko to receive qualified buyer leads and submit offers.",
          `Open app: ${sellerLink}`
        ].join("\n"),
        campaign: "wa_inbound",
        step: "seller_role_cta",
        metadata: { deepLink: sellerLink },
        templateKey: "seller_role_cta",
        templateParams: [sellerLink],
        buttonUrl: sellerLink
      });
      continue;
    }

    if (GREETING_WORDS.has(normalizedInbound) || !normalizedInbound) {
      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "role_prompt",
        context: {}
      });
      await sendFlowMessage({
        to: event.mobileE164,
        body: buildConsentPromptMessage(),
        campaign: "wa_inbound",
        step: "role_prompt"
      });
      continue;
    }

    if (!sellerContact && !buyerContact) {
      await ensureBuyerProspect(event.mobileE164);
      notifyWhatsAppInteraction(event.mobileE164, "", event.text || "");

      if (isBuyerIntent) {
        const buyerProspect = await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 });
        await applyConsentConfirmed(buyerProspect, "buyer", event);
        await saveConversationState(event.mobileE164, {
          stage: "awaiting_role",
          provider: event.provider,
          lastInboundText: event.text,
          lastIntent: "buyer_product",
          context: { product: "" }
        });
        const buyerLink = buildBuyerAppLink(event.mobileE164, "wa_inbound", "new_buyer");
        await sendFlowMessage({
          to: event.mobileE164,
          body: [
            "Buyer mode selected.",
            "Post your requirement in Hoko and receive verified offers.",
            `Open app: ${buyerLink}`
          ].join("\n"),
          campaign: "wa_inbound",
          step: "new_buyer_cta",
          metadata: { deepLink: buyerLink },
          templateKey: "buyer_role_cta",
          templateParams: [buyerLink],
          buttonUrl: buyerLink
        });
        continue;
      }

      if (isSellerIntent) {
        await applyConsentConfirmed(await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 }), "buyer", event);
        const sellerContactLocal = await WhatsAppContact.findOne({ mobileE164: event.mobileE164 });
        if (sellerContactLocal) {
          await applyConsentConfirmed(sellerContactLocal, "seller", event);
        }
        const sellerLink = buildSellerAppLink(event.mobileE164, "wa_inbound", "new_seller");
        await sendFlowMessage({
          to: event.mobileE164,
          body: [
            "Seller mode selected.",
            "Open Hoko to receive qualified buyer leads and submit offers.",
            `Open app: ${sellerLink}`
          ].join("\n"),
          campaign: "wa_inbound",
          step: "new_seller_cta",
          metadata: { deepLink: sellerLink },
          templateKey: "seller_role_cta",
          templateParams: [sellerLink],
          buttonUrl: sellerLink
        });
        continue;
      }

      await sendFlowMessage({
        to: event.mobileE164,
        body: buildGenericHelpMessage(),
        campaign: "wa_inbound",
        step: "generic_help"
      });
      continue;
    }

    const latestSellerContact = sellerContact || null;
    const latestBuyerContact =
      buyerContact || (await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 }));

    if (latestSellerContact?.optInStatus !== "opted_in") {
      await applyConsentConfirmed(latestSellerContact, "seller", event);
    }
    if (latestBuyerContact?.optInStatus !== "opted_in") {
      await applyConsentConfirmed(latestBuyerContact, "buyer", event);
    }

    if (consentHandled && !consentConfirmed) {
      continue;
    }

    if (currentConsentState?.step === CONSENT_STATES.AWAITING_ROLE) {
      if (isBuyerIntent) {
        await clearConversationState(event.mobileE164);
        const buyerLink = buildBuyerAppLink(event.mobileE164, "wa_inbound", "buyer_role");
        await sendFlowMessage({
          to: event.mobileE164,
          body: [
            "Buyer mode selected.",
            "Post your requirement in Hoko and receive verified offers.",
            `Open app: ${buyerLink}`
          ].join("\n"),
          campaign: "wa_inbound",
          step: "buyer_role_cta",
          metadata: { deepLink: buyerLink },
          templateKey: "buyer_role_cta",
          templateParams: [buyerLink],
          buttonUrl: buyerLink
        });
        continue;
      }

      if (isSellerIntent) {
        await clearConversationState(event.mobileE164);
        const sellerLink = buildSellerAppLink(event.mobileE164, "wa_inbound", "seller_role");
        await sendFlowMessage({
          to: event.mobileE164,
          body: [
            "Seller mode selected.",
            "Open Hoko to receive qualified buyer leads and submit offers.",
            `Open app: ${sellerLink}`
          ].join("\n"),
          campaign: "wa_inbound",
          step: "seller_role_cta",
          metadata: { deepLink: sellerLink },
          templateKey: "seller_role_cta",
          templateParams: [sellerLink],
          buttonUrl: sellerLink
        });
        continue;
      }

      await sendFlowMessage({
        to: event.mobileE164,
        body: "Reply BUYER or SELLER to continue.",
        campaign: "wa_inbound",
        step: "role_prompt"
      });
      continue;
    }

    if (currentConsentState?.step === CONSENT_STATES.AWAITING_BUYER_PRODUCT) {
      const product = String(event.text || "").trim();

      if (!product || product.length < 2) {
        await sendFlowMessage({
          to: event.mobileE164,
          body: "Describe what you need (e.g., Split AC, Cement bags).",
          campaign: "wa_buyer_flow",
          step: "product_prompt"
        });
        continue;
      }

      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "buyer_city",
        context: { product }
      });

      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          `Product: ${product}`,
          "Which city are you in?",
          "Reply BUYER or SELLER to switch role."
        ].join("\n"),
        campaign: "wa_buyer_flow",
        step: "city_prompt"
      });
      continue;
    }

    if (currentConsentState?.step === CONSENT_STATES.AWAITING_BUYER_CITY) {
      const product = currentConsentState?.context?.product || currentConsentState?.product || "";
      const inboundText = String(event.text || "").trim();
      const cities = await getCitiesFromSettings();
      const inputCity = normalizeCityName(inboundText);
      const matchedCity = cities.find(c => normalizeCityName(c) === inputCity);
      const cityToSave = matchedCity || inboundText;

      if (!inboundText || inboundText.length < 2) {
        await sendFlowMessage({
          to: event.mobileE164,
          body: "Share your city name (e.g., Mumbai, Delhi, Bangalore).",
          campaign: "wa_buyer_flow",
          step: "city_prompt"
        });
        continue;
      }

      try {
        const result = await createBuyerLeadAndSendConfirmation(event.mobileE164, product, cityToSave, event.provider);
        console.log(`[Buyer Lead] Created for ${event.mobileE164}: ${product} in ${cityToSave}`);
        scheduleBuyerReminder(event.mobileE164, product);
        console.log(`[Buyer Flow] Completed for ${event.mobileE164}, reminder scheduled`);
      } catch (err) {
        console.error(`[Buyer Flow] Error for ${event.mobileE164}:`, err.message);
        await sendFlowMessage({
          to: event.mobileE164,
          body: "Thanks. We'll get back to you soon. Check the app for updates.",
          campaign: "wa_buyer_flow",
          step: "error_fallback"
        });
      }

      await clearConversationState(event.mobileE164);
      continue;
    }

    if (currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CITY) {
      const inboundText = String(event.text || "").trim();
      const selectedCategories = currentConsentState?.context?.categories || currentConsentState?.categories || [];
      const categoriesDisplay = currentConsentState?.context?.categoriesDisplay || currentConsentState?.categoriesDisplay || selectedCategories.join(", ");

      if (!inboundText) {
        await sendFlowMessage({
          to: event.mobileE164,
          body: "Share your city name.",
          campaign: "wa_seller_flow",
          step: "city_prompt"
        });
        continue;
      }

      const citiesData = await PlatformSettings.findOne({ key: "cities" }).lean();
      const cities = citiesData?.value || [];
      const inputCity = normalizeCityName(inboundText);
      const matchedCity = cities.find(c => normalizeCityName(c) === inputCity);
      const cityToSave = matchedCity || inboundText;

      const loginLink = await sendSellerInviteLink(event.mobileE164, cityToSave, selectedCategories);

      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          "Seller confirmed.",
          `City: ${cityToSave}. Categories: ${categoriesDisplay}`,
          `Open app: ${loginLink}`
        ].join("\n"),
        campaign: "wa_seller_flow",
        step: "seller_confirmed",
        metadata: { deepLink: loginLink },
        templateKey: "seller_role_cta",
        templateParams: [loginLink],
        buttonUrl: loginLink
      });

      setTimeout(async () => {
        try {
          await sendToNewSellerWithCategories(event.mobileE164, cityToSave, { whatsappCategories: selectedCategories, platformCategories: selectedCategories });
          console.log(`[Seller OptIn] Sent requirements to ${event.mobileE164} after delay`);
        } catch (err) {
          console.log("[DummyReq] Delayed error:", err.message);
        }
      }, 2 * 60 * 1000 + Math.random() * 60 * 1000);

      await clearConversationState(event.mobileE164);
      console.log(`[Seller OptIn] ${event.mobileE164} - City: ${cityToSave}, Categories: ${selectedCategories.join(", ")}`);
      continue;
    }

    if (currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CATEGORIES) {
      const inboundText = String(event.text || "").trim();

      if (!inboundText) {
        await sendFlowMessage({
          to: event.mobileE164,
          body: "Select categories using numbers (e.g., 1,3,5).",
          campaign: "wa_seller_flow",
          step: "category_prompt"
        });
        continue;
      }

      let adminCategories = [];
      try {
        const settings = await PlatformSettings.findOne().lean();
        adminCategories = settings?.categories || [];
      } catch (err) {
        console.log("[WhatsApp] Error fetching categories:", err.message);
      }

      const parsed = parseCategorySelection(inboundText, adminCategories);

      if (parsed.whatsappCategories.length === 0) {
        await sendFlowMessage({
          to: event.mobileE164,
          body: "Invalid selection. Pick from the list (e.g., 1,3,5 or 0 for all).",
          campaign: "wa_seller_flow",
          step: "category_invalid"
        });
        continue;
      }

      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "seller_city",
        context: { categories: parsed.platformCategories, categoriesDisplay: parsed.whatsappCategories.join(", ") }
      });

      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          `Selected: ${parsed.whatsappCategories.join(", ")}`,
          "Which city do you operate in?"
        ].join("\n"),
        campaign: "wa_seller_flow",
        step: "city_prompt"
      });
      continue;
    }

    if (isBuyerIntent) {
      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "buyer_product",
        context: {}
      });
      const buyerLink = buildBuyerAppLink(event.mobileE164, "wa_inbound", "buyer_role");
      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          "Buyer mode selected.",
          "Post your requirement in Hoko and receive verified offers.",
          `Open app: ${buyerLink}`
        ].join("\n"),
        campaign: "wa_inbound",
        step: "buyer_role_cta",
        metadata: { deepLink: buyerLink },
        templateKey: "buyer_role_cta",
        templateParams: [buyerLink],
        buttonUrl: buyerLink
      });
      continue;
    }

    if (isSellerIntent) {
      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "seller_categories",
        context: {}
      });
      const categoryMessage = await buildCategorySelectionMessage();
      await sendFlowMessage({
        to: event.mobileE164,
        body: [
          "Seller mode selected.",
          categoryMessage
        ].join("\n"),
        campaign: "wa_inbound",
        step: "seller_category_prompt"
      });
      continue;
    }

    if (GREETING_WORDS.has(normalizedInbound)) {
      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "greeting",
        context: {}
      });
      await sendFlowMessage({
        to: event.mobileE164,
        body: buildWelcomeMessage(),
        campaign: "wa_inbound",
        step: "welcome"
      });
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
                  firmName: registerPayload.firmName,
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
      await sendFlowMessage({
        to: event.mobileE164,
        body: replyBody,
        campaign: "wa_seller_lead",
        step: intent.kind
      });
    }

    if (!["link", "help", "register", "offer_intent"].includes(intent.kind)) {
      await saveConversationState(event.mobileE164, {
        stage: "awaiting_role",
        provider: event.provider,
        lastInboundText: event.text,
        lastIntent: "role_prompt",
        context: {}
      });
      await sendFlowMessage({
        to: event.mobileE164,
        body: buildRoleSelectionMessage(),
        campaign: "wa_inbound",
        step: "role_prompt_fallback",
        metadata: { receivedText: String(event.text || "").slice(0, 120) }
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

