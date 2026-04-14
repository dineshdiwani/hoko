const express = require("express");
const router = express.Router();

const PendingOfferDraft = require("../models/PendingOfferDraft");
const Requirement = require("../models/Requirement");
const TempRequirement = require("../models/TempRequirement");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const WhatsAppLead = require("../models/WhatsAppLead");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppBuyerContact = require("../models/WhatsAppBuyerContact");
const OptedInSeller = require("../models/OptedInSeller");
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
const { sendToNewSeller } = require("../services/dummyRequirementCron");

router.use(express.json({ limit: "1mb" }));
router.use(express.urlencoded({ extended: false }));

const CONSENT_CONFIRM_WORDS = new Set(["yes", "y", "confirm", "i agree", "agree"]);
const GREETING_WORDS = new Set(["hi", "hii", "hello", "hey", "start", "menu"]);
const BUYER_WORDS = new Set(["buyer", "buy", "i want to buy", "want to buy", "purchase"]);
const SELLER_WORDS = new Set(["seller", "sell", "i want to sell", "want to sell", "sell"]);

const consentState = new Map();

const CONSENT_STATES = {
  PENDING: "pending_consent",
  AWAITING_ROLE: "awaiting_role",
  AWAITING_SELLER_CITY: "awaiting_seller_city",
  AWAITING_SELLER_CATEGORIES: "awaiting_seller_categories"
};

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

function buildConsentPromptMessage() {
  return [
    "🔥 Welcome to Hoko",
    "India's smart way to buy & sell 😎",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "👉 Reply with, If you are a",
    "1️⃣ BUYER",
    "2️⃣ SELLER"
  ].join("\n");
}

function buildConsentConfirmedBuyerMessage(deepLink) {
  return [
    "Great! You're set as a BUYER 👍",
    "",
    "📝 Click below to post your requirement:",
    deepLink,
    "",
    "You'll receive offers from sellers on WhatsApp!"
  ].join("\n");
}

function buildConsentConfirmedSellerMessage(city, deepLink) {
  return [
    "Perfect! You're set as a SELLER 👍",
    "",
    `📍 You'll receive requirements for ${city}`,
    "",
    "🏪 Click to join:",
    deepLink
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
  return `${appBase}/buyer/requirement/new?ref=${tempReq._id.toString()}`;
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

async function sendSellerInviteLink(mobileE164, city) {
  await OptedInSeller.findOneAndUpdate(
    { mobileE164 },
    {
      $set: { mobileE164, city, source: "whatsapp_keyword", status: "active", optedInAt: new Date() }
    },
    { upsert: true, new: true }
  );
  
  const appBase = resolvePublicAppUrl();
  return `${appBase}/seller`;
}

function normalizeCityName(city) {
  return String(city || "").trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

async function sendSellerRequirementInvite(to, requirementId, product, city, quantity) {
  const provider = resolveWhatsAppProvider();
  if (!["gupshup", "wapi"].includes(provider)) {
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

function buildConsentPromptMessage() {
  return [
    "🔥 Welcome to Hoko",
    "India's smart way to buy & sell 😎",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "👉 Reply with, If you are a",
    "1️⃣ BUYER",
    "2️⃣ SELLER"
  ].join("\n");
}

function buildConsentConfirmedMessage() {
  return [
    "🔥 Welcome to Hoko",
    "India's smart way to buy & sell 😎",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "👉 Reply with, If you are a",
    "1️⃣ BUYER",
    "2️⃣ SELLER"
  ].join("\n");
}

function buildGenericHelpMessage() {
  return [
    "🔥 Welcome to Hoko",
    "India's smart way to buy & sell 😎",
    "",
    "🛒 Want to BUY? → Get multiple offers from sellers",
    "🏪 Want to SELL? → Get real buyer requirements",
    "",
    "👉 Reply with, If you are a",
    "1️⃣ BUYER",
    "2️⃣ SELLER"
  ].join("\n");
}

function resolveWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
}

async function sendBuyerInviteTemplate(to, tempRequirementId) {
  const provider = resolveWhatsAppProvider();
  if (!["gupshup", "wapi"].includes(provider)) {
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
    const parameters = [deepLink];

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
    return res.status(200).json({
      ok: true,
      received: 0,
      deliveryUpdates: deliveryEvents.length
    });
  }

  for (const event of events) {
    const normalizedInbound = normalizeInboundText(event.text);
    const consentConfirmed = CONSENT_CONFIRM_WORDS.has(normalizedInbound);
    const { sellerContact, buyerContact } = await loadContactByMobile(event.mobileE164);
    const consentKey = getConsentStateKey(event.mobileE164);
    const currentConsentState = consentState.get(consentKey);
    let consentHandled = false;

    if (!sellerContact && !buyerContact) {
      await ensureBuyerProspect(event.mobileE164);
      
      // New user - show greeting and handle BUYER/SELLER directly
      if (BUYER_WORDS.has(normalizedInbound) || normalizedInbound === "buy" || normalizedInbound === "1" || normalizedInbound === "buyer") {
        await applyConsentConfirmed(await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 }), "buyer", event);
        const result = await sendBuyerRequirementInvite(event.mobileE164);
        console.log(`[Buyer] New buyer ${event.mobileE164}, template sent:`, result);
        continue;
      }
      
      if (SELLER_WORDS.has(normalizedInbound) || normalizedInbound === "sell" || normalizedInbound === "2" || normalizedInbound === "seller") {
        consentState.set(consentKey, { step: CONSENT_STATES.AWAITING_SELLER_CITY, mobileE164: event.mobileE164 });
        await applyConsentConfirmed(await WhatsAppBuyerContact.findOne({ mobileE164: event.mobileE164 }), "buyer", event);
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: "Perfect!👍 Which city do you operate in? 📍"
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

    // Existing users - auto-confirm consent and handle BUYER/SELLER
    if (latestSellerContact?.optInStatus !== "opted_in") {
      await applyConsentConfirmed(latestSellerContact, "seller", event);
    }
    if (latestBuyerContact?.optInStatus !== "opted_in") {
      await applyConsentConfirmed(latestBuyerContact, "buyer", event);
    }

    if (consentHandled && !consentConfirmed) {
      continue;
    }

    // Handle role selection for opted-in contacts
    if (currentConsentState?.step === CONSENT_STATES.AWAITING_ROLE) {
      if (BUYER_WORDS.has(normalizedInbound) || normalizedInbound === "buy" || normalizedInbound === "1") {
        consentState.delete(consentKey);
        const result = await sendBuyerRequirementInvite(event.mobileE164);
        console.log(`[Buyer Invite] Sent template to ${event.mobileE164}, result:`, result);
        continue;
      }
      
      if (SELLER_WORDS.has(normalizedInbound) || normalizedInbound === "sell" || normalizedInbound === "2") {
        consentState.delete(consentKey);
        consentState.set(consentKey, { step: CONSENT_STATES.AWAITING_SELLER_CITY, mobileE164: event.mobileE164 });
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: "Perfect!👍 Which city do you operate in? 📍"
        });
        continue;
      }
      
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: "Please reply BUYER or SELLER to continue."
      });
      continue;
    }

    // Handle seller city input after role selection
    if (currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CITY) {
      const inboundText = String(event.text || "").trim();
      if (!inboundText) {
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: "Please share your city name."
        });
        continue;
      }
      const citiesData = await PlatformSettings.findOne({ key: "cities" }).lean();
      const cities = citiesData?.value || [];
      const inputCity = normalizeCityName(inboundText);
      const matchedCity = cities.find(c => normalizeCityName(c) === inputCity);
      const cityToSave = matchedCity || inboundText;
      
      // Ask for products/services next
      consentState.set(consentKey, { 
        step: CONSENT_STATES.AWAITING_SELLER_CATEGORIES, 
        mobileE164: event.mobileE164,
        city: cityToSave 
      });
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: "What products/services do you supply? 📦"
      });
      continue;
    }
    
    // Handle seller categories input
    if (currentConsentState?.step === CONSENT_STATES.AWAITING_SELLER_CATEGORIES) {
      const inboundText = String(event.text || "").trim();
      const cityToSave = currentConsentState?.city || "Unknown";
      
      if (!inboundText) {
        await sendWhatsAppMessage({
          to: event.mobileE164,
          body: "Please share what you supply."
        });
        continue;
      }
      
      const deepLink = await sendSellerInviteLink(event.mobileE164, cityToSave);
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildConsentConfirmedSellerMessage(cityToSave, deepLink)
      });
      
      // Send dummy requirements to new seller
      sendToNewSeller(event.mobileE164, cityToSave).catch(err => console.log("[DummyReq] Error:", err.message));
      
      consentState.delete(consentKey);
      console.log(`[Seller OptIn] ${event.mobileE164} - City: ${cityToSave}, Products: ${inboundText}`);
      continue;
    }

    // Handle BUYER/SELLER for opted-in users
    if (BUYER_WORDS.has(normalizedInbound) || normalizedInbound === "buy" || normalizedInbound === "1" || normalizedInbound === "buyer") {
      const result = await sendBuyerRequirementInvite(event.mobileE164);
      console.log(`[Buyer] Opted-in buyer ${event.mobileE164}, result:`, result);
      continue;
    }
    
    if (SELLER_WORDS.has(normalizedInbound) || normalizedInbound === "sell" || normalizedInbound === "2" || normalizedInbound === "seller") {
      consentState.set(consentKey, { step: CONSENT_STATES.AWAITING_SELLER_CITY, mobileE164: event.mobileE164 });
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: "Perfect!👍 Which city do you operate in? 📍"
      });
      continue;
      continue;
    }

    // Always acknowledge simple greetings so users do not see a silent chat.
    if (GREETING_WORDS.has(normalizedInbound)) {
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: buildGenericHelpMessage()
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
      await sendWhatsAppMessage({
        to: event.mobileE164,
        body: replyBody
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


