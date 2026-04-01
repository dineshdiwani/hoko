const express = require("express");
const router = express.Router();

const PendingOfferDraft = require("../models/PendingOfferDraft");
const Requirement = require("../models/Requirement");
const WhatsAppLead = require("../models/WhatsAppLead");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");
const {
  classifyInboundText,
  extractInboundEvents,
  parseRegisterPayload
} = require("../services/whatsAppInbound");

router.use(express.json({ limit: "1mb" }));
router.use(express.urlencoded({ extended: false }));

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
  const events = extractInboundEvents(req.body);
  if (!events.length) {
    return res.status(200).json({ ok: true, received: 0 });
  }

  for (const event of events) {
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

  return res.status(200).json({ ok: true, received: events.length });
});

module.exports = router;


