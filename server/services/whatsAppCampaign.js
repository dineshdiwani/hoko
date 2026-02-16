const PlatformSettings = require("../models/PlatformSettings");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppCampaignRun = require("../models/WhatsAppCampaignRun");
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
    cityNormalized: requirementCity
  }).lean();
  if (!contacts.length) {
    return { ok: false, reason: "no_contacts" };
  }

  const appBase =
    String(process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || "https://hokoapp.in")
      .split(",")[0]
      .trim()
      .replace(/\/+$/, "") || "https://hokoapp.in";
  const requirementId = encodeURIComponent(String(requirement._id || ""));
  const deepLink = `${appBase}/seller/deeplink/${requirementId}?city=${encodeURIComponent(requirement.city || "")}&postId=${requirementId}`;
  const body = formatMessage({ requirement, deepLink });
  const run = await WhatsAppCampaignRun.create({
    requirementId: requirement._id,
    triggerType: "buyer_post",
    status: "created",
    city: requirement.city || "",
    category: requirement.category || ""
  });

  const skippedReasons = {
    not_opted_in: 0,
    unsubscribed: 0,
    dnd: 0,
    inactive: 0,
    city_mismatch: 0,
    category_mismatch: 0
  };

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const contact of contacts) {
    if (contact.active === false) {
      skipped += 1;
      skippedReasons.inactive += 1;
      continue;
    }
    if (contact.optInStatus !== "opted_in") {
      skipped += 1;
      skippedReasons.not_opted_in += 1;
      continue;
    }
    if (contact.unsubscribedAt) {
      skipped += 1;
      skippedReasons.unsubscribed += 1;
      continue;
    }
    if (contact.dndStatus === "dnd") {
      skipped += 1;
      skippedReasons.dnd += 1;
      continue;
    }

    attempted += 1;
    const result = await sendWhatsAppMessage({
      to: contact.mobileE164,
      body
    });
    if (result?.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  run.status = failed > 0 ? "failed" : "completed";
  run.attempted = attempted;
  run.sent = sent;
  run.failed = failed;
  run.skipped = skipped;
  run.skippedReasons = skippedReasons;
  await run.save();

  return {
    ok: true,
    attempted,
    sent,
    failed,
    skipped,
    campaignRunId: run._id
  };
}

async function sendTestWhatsAppCampaign({
  requirement,
  mobileE164,
  adminId,
  dryRun = false
}) {
  if (!requirement?._id) {
    return { ok: false, reason: "missing_requirement" };
  }
  const appBase =
    String(process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || "https://hokoapp.in")
      .split(",")[0]
      .trim()
      .replace(/\/+$/, "") || "https://hokoapp.in";
  const requirementId = encodeURIComponent(String(requirement._id || ""));
  const deepLink = `${appBase}/seller/deeplink/${requirementId}?city=${encodeURIComponent(requirement.city || "")}&postId=${requirementId}`;
  const body = formatMessage({ requirement, deepLink });

  const run = await WhatsAppCampaignRun.create({
    requirementId: requirement._id,
    triggerType: "manual_test",
    status: "created",
    city: requirement.city || "",
    category: requirement.category || "",
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    dryRun: Boolean(dryRun),
    createdByAdminId: adminId || null
  });

  if (dryRun) {
    run.status = "completed";
    run.attempted = 1;
    run.skipped = 1;
    run.notes = `Dry run for ${mobileE164}`;
    await run.save();
    return { ok: true, dryRun: true, campaignRunId: run._id };
  }

  const result = await sendWhatsAppMessage({ to: mobileE164, body });
  run.status = result?.ok ? "completed" : "failed";
  run.attempted = 1;
  run.sent = result?.ok ? 1 : 0;
  run.failed = result?.ok ? 0 : 1;
  run.notes = result?.ok ? "Test send successful" : "Test send failed";
  await run.save();

  return { ok: Boolean(result?.ok), campaignRunId: run._id, result };
}

module.exports = {
  triggerWhatsAppCampaignForRequirement,
  sendTestWhatsAppCampaign
};
