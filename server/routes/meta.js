const express = require("express");
const PlatformSettings = require("../models/PlatformSettings");
const Requirement = require("../models/Requirement");
const { buildOptionsResponse } = require("../config/platformDefaults");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "hoko-api",
    uptimeSec: Math.floor(process.uptime()),
    now: new Date().toISOString()
  });
});

router.get("/options", async (req, res) => {
  const doc = await PlatformSettings.findOne();
  res.json(buildOptionsResponse(doc));
});

router.get("/requirement-preview/:requirementId", async (req, res) => {
  const requirementId = String(req.params.requirementId || "").trim();
  if (!requirementId) {
    return res.status(400).json({ message: "Requirement ID required" });
  }
  try {
    const requirement = await Requirement.findOne({
      _id: requirementId,
      "moderation.removed": { $ne: true }
    })
      .select(
        "_id city category productName product makeBrand brand typeModel quantity type unit details description offerInvitedFrom attachments createdAt"
      )
      .lean();

    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    return res.json(requirement);
  } catch {
    return res.status(404).json({ message: "Requirement not found" });
  }
});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.get("/requirement-share/:requirementId", async (req, res) => {
  const requirementId = String(req.params.requirementId || "").trim();
  if (!requirementId) {
    return res.status(400).send("Requirement ID required");
  }

  const appBase =
    String(process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || "https://hokoapp.in")
      .split(",")[0]
      .trim()
      .replace(/\/+$/, "") || "https://hokoapp.in";
  const encodedRequirementId = encodeURIComponent(requirementId);
  const targetUrl = `${appBase}/seller/deeplink/${encodedRequirementId}`;
  const logoUrl = String(process.env.SHARE_LOGO_URL || `${appBase}/logo.png`).trim();

  let requirement = null;
  try {
    requirement = await Requirement.findOne({
      _id: requirementId,
      "moderation.removed": { $ne: true }
    })
      .select("product productName city category quantity type unit makeBrand brand typeModel")
      .lean();
  } catch {
    requirement = null;
  }

  const product = String(requirement?.product || requirement?.productName || "Buyer Requirement").trim();
  const city = String(requirement?.city || "").trim();
  const quantity = String(requirement?.quantity || "").trim();
  const unit = String(requirement?.unit || requirement?.type || "").trim();
  const makeModel = String(requirement?.makeBrand || requirement?.brand || requirement?.typeModel || "").trim();

  const title = "URGENT BUYER REQUIREMENT | Hoko";
  const descriptionParts = [
    `Looking for ${product}`,
    quantity ? `Qty: ${quantity}${unit ? ` ${unit}` : ""}` : "",
    makeModel ? `Make/Model: ${makeModel}` : "",
    city ? `City: ${city}` : ""
  ].filter(Boolean);
  const description = descriptionParts.join(" | ");

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeTarget = escapeHtml(targetUrl);
  const safeLogo = escapeHtml(logoUrl);

  res.set("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeLogo}" />
  <meta property="og:url" content="${safeTarget}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeLogo}" />
  <meta http-equiv="refresh" content="0; url=${safeTarget}" />
</head>
<body>
  <p>Redirecting to requirement...</p>
  <p><a href="${safeTarget}">Open requirement</a></p>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`);
});

module.exports = router;
