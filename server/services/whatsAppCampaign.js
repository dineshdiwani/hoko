const PlatformSettings = require("../models/PlatformSettings");
const WhatsAppContact = require("../models/WhatsAppContact");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function formatMessage({ requirement, deepLink }) {
  const product = firstNonEmpty([requirement.product, requirement.productName]) || "Requirement";
  const makeBrand = firstNonEmpty([requirement.makeBrand, requirement.brand]) || "-";
  const typeModel = firstNonEmpty([requirement.typeModel, requirement.type]) || "-";
  const quantity = firstNonEmpty([requirement.quantity]) || "-";
  const unit = firstNonEmpty([requirement.unit]) || "-";
  const city = firstNonEmpty([requirement.city]) || "-";
  const details = firstNonEmpty([requirement.details]) || "-";

  return [
    "New buyer requirement posted on Hoko.",
    `Post: ${product}`,
    `Make/Brand: ${makeBrand}`,
    `Type Model: ${typeModel}`,
    `Quantity: ${quantity} ${unit}`.trim(),
    `City: ${city}`,
    `Details: ${details}`,
    `Open: ${deepLink}`
  ].join("\n");
}

async function triggerWhatsAppCampaignForRequirement(requirement) {
  if (!requirement?._id) {
    return { ok: false, reason: "missing_requirement" };
  }

  const settingsDoc = await PlatformSettings.findOne().lean();
  const campaignSettings = settingsDoc?.whatsAppCampaign || {};
  if (!campaignSettings.enabled) {
    return { ok: false, reason: "campaign_disabled" };
  }

  const requirementCity = normalizeText(requirement.city);
  const requirementCategory = normalizeText(requirement.category);
  const enabledCities = Array.isArray(campaignSettings.cities)
    ? campaignSettings.cities.map(normalizeText).filter(Boolean)
    : [];
  const enabledCategories = Array.isArray(campaignSettings.categories)
    ? campaignSettings.categories.map(normalizeText).filter(Boolean)
    : [];

  if (enabledCities.length && !enabledCities.includes(requirementCity)) {
    return { ok: false, reason: "city_not_enabled" };
  }
  if (
    enabledCategories.length &&
    !enabledCategories.includes(requirementCategory)
  ) {
    return { ok: false, reason: "category_not_enabled" };
  }

  const contacts = await WhatsAppContact.find({
    cityNormalized: requirementCity,
    active: true
  }).lean();
  if (!contacts.length) {
    return { ok: false, reason: "no_contacts" };
  }

  const appBase =
    String(process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || "https://hokoapp.in")
      .split(",")[0]
      .trim()
      .replace(/\/+$/, "") || "https://hokoapp.in";
  const deepLink = `${appBase}/seller/deeplink/${requirement._id}`;
  const body = formatMessage({ requirement, deepLink });

  const results = await Promise.all(
    contacts.map((contact) =>
      sendWhatsAppMessage({
        to: contact.mobileE164,
        body
      })
    )
  );

  const sent = results.filter((r) => r?.ok).length;
  const failed = results.length - sent;
  return {
    ok: true,
    attempted: results.length,
    sent,
    failed
  };
}

module.exports = {
  triggerWhatsAppCampaignForRequirement
};
