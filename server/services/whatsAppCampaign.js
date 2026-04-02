const PlatformSettings = require("../models/PlatformSettings");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppCampaignRun = require("../models/WhatsAppCampaignRun");
const WhatsAppLead = require("../models/WhatsAppLead");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { sendEmailToRecipient } = require("../utils/sendEmail");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
}

function normalizeFilterList(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter(Boolean)
    )
  );
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function extractContactCategoryKeys(contact) {
  if (Array.isArray(contact?.categoriesNormalized) && contact.categoriesNormalized.length) {
    return contact.categoriesNormalized
      .flatMap((item) => String(item || "").split(/[;,|/]+/))
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  if (Array.isArray(contact?.categories) && contact.categories.length) {
    return contact.categories
      .flatMap((item) => String(item || "").split(/[;,|/]+/))
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return [];
}

function shouldBypassCampaignGuards(triggerType) {
  const normalized = String(triggerType || "").trim().toLowerCase();
  return normalized === "manual_resend";
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function toSentence(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/\s+/g, " ");
}

function buildMakeModel(requirement) {
  const make = firstNonEmpty([requirement?.makeBrand, requirement?.brand]);
  const model = firstNonEmpty([requirement?.typeModel, requirement?.type]);
  if (make && model) return `${make} ${model}`;
  return make || model || "-";
}

function formatMessage({ requirement, deepLink }) {
  const product = toSentence(
    firstNonEmpty([requirement?.product, requirement?.productName, "Buyer requirement"]),
    "Buyer requirement"
  );
  const quantity = toSentence(firstNonEmpty([requirement?.quantity]), "-");
  const unit = toSentence(firstNonEmpty([requirement?.unit, requirement?.type]), "");
  const quantityWithUnit = `${quantity}${unit ? ` ${unit}` : ""}`.trim();
  const makeModel = toSentence(buildMakeModel(requirement), "-");
  const city = toSentence(firstNonEmpty([requirement?.city, "your city"]), "your city");

  return [
    "*URGENT BUYER REQUIREMENT*",
    "",
    `Looking for: *${product}*`,
    `Quantity: *${quantityWithUnit}*`,
    `Make/Model: *${makeModel}*`,
    `Buyer City: *${city}*`,
    "",
    "Suppliers, please share:",
    "- Best Price",
    "- Delivery Timeline",
    "- Availability Status",
    "",
    "*Send your best offer now:*",
    deepLink,
  ].join("\n");
}
function buildSellerDeepLink(appBase, requirement) {
  const requirementIdRaw = String(requirement?._id || "").trim();
  const requirementId = encodeURIComponent(requirementIdRaw);
  return `${appBase}/seller/deeplink/${requirementId}`;
}

function normalizeChannels(input) {
  const requested = input && typeof input === "object" ? input : {};
  const whatsapp = requested.whatsapp !== false;
  const email = requested.email === true;
  if (!whatsapp && !email) {
    return { whatsapp: true, email: false };
  }
  return { whatsapp, email };
}

function createChannelStats() {
  return {
    whatsapp: { attempted: 0, sent: 0, failed: 0, skipped: 0 },
    email: { attempted: 0, sent: 0, failed: 0, skipped: 0 }
  };
}

function summarizeSendError(errorValue) {
  if (!errorValue) return "";
  if (typeof errorValue === "string") return errorValue;
  try {
    return JSON.stringify(errorValue).slice(0, 500);
  } catch {
    return "send_failed";
  }
}

function resolveRequirementProduct(requirement) {
  return firstNonEmpty([requirement?.product, requirement?.productName, "Requirement"]);
}

async function createDeliveryLog(logPayload) {
  try {
    await WhatsAppDeliveryLog.create(logPayload);
  } catch (err) {
    console.warn("Failed to create WhatsApp delivery log", err?.message || err);
  }
}

async function upsertWhatsAppLeadContext({
  contact,
  requirement,
  campaignRunId,
  provider = "campaign"
}) {
  const mobileE164 = String(contact?.mobileE164 || "").trim();
  if (!mobileE164 || !requirement?._id) return;

  const primaryCategory = Array.isArray(contact?.categories)
    ? String(contact.categories[0] || "").trim()
    : "";

  await WhatsAppLead.findOneAndUpdate(
    { mobileE164 },
    {
      $set: {
        mobileE164,
        provider,
        requirementId: requirement._id,
        latestCampaignRunId: campaignRunId || null,
        profile: {
          firmName: String(contact?.firmName || "").trim(),
          managerName: String(contact?.firmName || "").trim(),
          city: String(contact?.city || requirement?.city || "").trim(),
          category: primaryCategory || String(requirement?.category || "").trim(),
          email: String(contact?.email || "").trim()
        }
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
}

async function triggerWhatsAppCampaignForRequirement(
  requirement,
  {
    triggerType = "buyer_post",
    adminId = null,
    notes = "",
    channels = { whatsapp: true, email: false },
    contactFilters = {}
  } = {}
) {
  if (!requirement?._id) {
    return { ok: false, reason: "missing_requirement" };
  }

  const settingsDoc = await PlatformSettings.findOne().lean();
  const campaignSettings = settingsDoc?.whatsAppCampaign || {};
  const bypassCampaignGuards = shouldBypassCampaignGuards(triggerType);
  if (!campaignSettings.enabled && !bypassCampaignGuards) {
    return { ok: false, reason: "campaign_disabled" };
  }

  const requirementCity = normalizeText(requirement.city);
  const requirementCategory = normalizeText(requirement.category);
  const requestedCityKeys = normalizeFilterList(contactFilters?.cityKeys);
  const requestedCategoryKeys = normalizeFilterList(contactFilters?.categoryKeys);
  const requestedContactIds = normalizeIdList(contactFilters?.contactIds);
  const enabledCities = Array.isArray(campaignSettings.cities)
    ? campaignSettings.cities.map(normalizeText).filter(Boolean)
    : [];
  const enabledCategories = Array.isArray(campaignSettings.categories)
    ? campaignSettings.categories.map(normalizeText).filter(Boolean)
    : [];

  if (
    !bypassCampaignGuards &&
    enabledCities.length &&
    !enabledCities.includes(requirementCity)
  ) {
    return { ok: false, reason: "city_not_enabled" };
  }
  if (
    !bypassCampaignGuards &&
    enabledCategories.length &&
    !enabledCategories.includes(requirementCategory)
  ) {
    return { ok: false, reason: "category_not_enabled" };
  }

  const contactQuery = {};
  if (requestedContactIds.length) {
    contactQuery._id = { $in: requestedContactIds };
  } else if (requestedCityKeys.length) {
    contactQuery.cityNormalized = { $in: requestedCityKeys };
  } else if (requirementCity) {
    contactQuery.cityNormalized = requirementCity;
  }
  const contacts = await WhatsAppContact.find(contactQuery).lean();
  if (!contacts.length) {
    return { ok: false, reason: "no_contacts" };
  }

  const appBase = resolvePublicAppUrl();
  const deepLink = buildSellerDeepLink(appBase, requirement);
  const body = formatMessage({ requirement, deepLink });
  const selectedChannels = normalizeChannels(channels);
  const run = await WhatsAppCampaignRun.create({
    requirementId: requirement._id,
    triggerType: triggerType === "manual_resend" ? "manual_resend" : "buyer_post",
    status: "created",
    city: requirement.city || "",
    category: requirement.category || "",
    channels: selectedChannels,
    channelStats: createChannelStats(),
    createdByAdminId: adminId || null,
    notes: String(notes || "").trim()
  });

  const skippedReasons = {
    not_opted_in: 0,
    unsubscribed: 0,
    dnd: 0,
    inactive: 0,
    city_mismatch: 0,
    category_mismatch: 0
  };
  const requirementProduct = resolveRequirementProduct(requirement);

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const channelStats = createChannelStats();
  const emailSubject = `New requirement: ${firstNonEmpty([requirement.product, requirement.productName]) || "Requirement"}`;

  for (const contact of contacts) {
    const useExplicitContactIds = requestedContactIds.length > 0;
    const contactCityKey = normalizeText(contact?.cityNormalized || contact?.city);
    if (!useExplicitContactIds && requestedCityKeys.length && !requestedCityKeys.includes(contactCityKey)) {
      skipped += 1;
      skippedReasons.city_mismatch += 1;
      if (selectedChannels.whatsapp) {
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "skipped",
          reason: "city_mismatch",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
      continue;
    }

    const contactCategories = extractContactCategoryKeys(contact);
    if (
      !useExplicitContactIds &&
      requestedCategoryKeys.length &&
      !requestedCategoryKeys.some((key) => contactCategories.includes(key))
    ) {
      skipped += 1;
      skippedReasons.category_mismatch += 1;
      if (selectedChannels.whatsapp) {
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "skipped",
          reason: "category_mismatch",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
      continue;
    }

    if (contact.active === false) {
      skipped += 1;
      skippedReasons.inactive += 1;
      if (selectedChannels.whatsapp) {
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "skipped",
          reason: "inactive",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
      continue;
    }
    if (contact.optInStatus !== "opted_in") {
      skipped += 1;
      skippedReasons.not_opted_in += 1;
      if (selectedChannels.whatsapp) {
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "skipped",
          reason: "not_opted_in",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
      continue;
    }
    if (contact.unsubscribedAt) {
      skipped += 1;
      skippedReasons.unsubscribed += 1;
      if (selectedChannels.whatsapp) {
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "skipped",
          reason: "unsubscribed",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
      continue;
    }
    if (contact.dndStatus === "dnd") {
      skipped += 1;
      skippedReasons.dnd += 1;
      if (selectedChannels.whatsapp) {
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "skipped",
          reason: "dnd",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
      continue;
    }

    if (selectedChannels.whatsapp) {
      await upsertWhatsAppLeadContext({
        contact,
        requirement,
        campaignRunId: run._id,
        provider: "campaign"
      });
      attempted += 1;
      channelStats.whatsapp.attempted += 1;
      const waResult = await sendWhatsAppMessage({
        to: contact.mobileE164,
        body
      });
      if (waResult?.ok) {
        sent += 1;
        channelStats.whatsapp.sent += 1;
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "sent",
          reason: "",
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      } else {
        failed += 1;
        channelStats.whatsapp.failed += 1;
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "whatsapp",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: String(contact?.email || "").trim(),
          status: "failed",
          reason: summarizeSendError(waResult?.error),
          provider: resolveWhatsAppProvider(),
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      }
    }

    if (selectedChannels.email) {
      const targetEmail = String(contact?.email || "").trim();
      if (!targetEmail) {
        skipped += 1;
        channelStats.email.skipped += 1;
        await createDeliveryLog({
          requirementId: requirement._id,
          campaignRunId: run._id,
          triggerType: run.triggerType,
          channel: "email",
          mobileE164: String(contact?.mobileE164 || "").trim(),
          email: "",
          status: "skipped",
          reason: "missing_email",
          provider: "email",
          city: String(requirement?.city || "").trim(),
          category: String(requirement?.category || "").trim(),
          product: requirementProduct,
          createdByAdminId: adminId || null
        });
      } else {
        attempted += 1;
        channelStats.email.attempted += 1;
        const emailResult = await sendEmailToRecipient({
          to: targetEmail,
          subject: emailSubject,
          text: body,
          html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;white-space:pre-line;">${body}</div>`
        });
        if (emailResult?.ok) {
          sent += 1;
          channelStats.email.sent += 1;
          await createDeliveryLog({
            requirementId: requirement._id,
            campaignRunId: run._id,
            triggerType: run.triggerType,
            channel: "email",
            mobileE164: String(contact?.mobileE164 || "").trim(),
            email: targetEmail,
            status: "sent",
            reason: "",
            provider: "email",
            city: String(requirement?.city || "").trim(),
            category: String(requirement?.category || "").trim(),
            product: requirementProduct,
            createdByAdminId: adminId || null
          });
        } else {
          failed += 1;
          channelStats.email.failed += 1;
          await createDeliveryLog({
            requirementId: requirement._id,
            campaignRunId: run._id,
            triggerType: run.triggerType,
            channel: "email",
            mobileE164: String(contact?.mobileE164 || "").trim(),
            email: targetEmail,
            status: "failed",
            reason: summarizeSendError(emailResult?.error),
            provider: "email",
            city: String(requirement?.city || "").trim(),
            category: String(requirement?.category || "").trim(),
            product: requirementProduct,
            createdByAdminId: adminId || null
          });
        }
      }
    }
  }

  run.status = sent > 0 || attempted === 0 ? "completed" : "failed";
  run.channels = selectedChannels;
  run.channelStats = channelStats;
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
  const appBase = resolvePublicAppUrl();
  const deepLink = buildSellerDeepLink(appBase, requirement);
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
    await upsertWhatsAppLeadContext({
      contact: {
        mobileE164,
        city: requirement.city || "",
        categories: [requirement.category || ""]
      },
      requirement,
      campaignRunId: run._id,
      provider: "manual_test"
    });
    run.status = "completed";
    run.attempted = 1;
    run.skipped = 1;
    run.notes = `Dry run for ${mobileE164}`;
    await run.save();
    await createDeliveryLog({
      requirementId: requirement._id,
      campaignRunId: run._id,
      triggerType: run.triggerType,
      channel: "whatsapp",
      mobileE164: String(mobileE164 || "").trim(),
      email: "",
      status: "dry_run",
      reason: "manual_test_dry_run",
      provider: resolveWhatsAppProvider(),
      city: String(requirement?.city || "").trim(),
      category: String(requirement?.category || "").trim(),
      product: resolveRequirementProduct(requirement),
      createdByAdminId: adminId || null
    });
    return { ok: true, dryRun: true, campaignRunId: run._id };
  }

  await upsertWhatsAppLeadContext({
    contact: {
      mobileE164,
      city: requirement.city || "",
      categories: [requirement.category || ""]
    },
    requirement,
    campaignRunId: run._id,
    provider: "manual_test"
  });
  const result = await sendWhatsAppMessage({ to: mobileE164, body });
  run.status = result?.ok ? "completed" : "failed";
  run.attempted = 1;
  run.sent = result?.ok ? 1 : 0;
  run.failed = result?.ok ? 0 : 1;
  run.notes = result?.ok ? "Test send successful" : "Test send failed";
  await run.save();
  await createDeliveryLog({
    requirementId: requirement._id,
    campaignRunId: run._id,
    triggerType: run.triggerType,
    channel: "whatsapp",
    mobileE164: String(mobileE164 || "").trim(),
    email: "",
    status: result?.ok ? "sent" : "failed",
    reason: result?.ok ? "" : summarizeSendError(result?.error),
    provider: resolveWhatsAppProvider(),
    city: String(requirement?.city || "").trim(),
    category: String(requirement?.category || "").trim(),
    product: resolveRequirementProduct(requirement),
    createdByAdminId: adminId || null
  });

  return { ok: Boolean(result?.ok), campaignRunId: run._id, result };
}

module.exports = {
  triggerWhatsAppCampaignForRequirement,
  sendTestWhatsAppCampaign
};





