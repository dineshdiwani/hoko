const PlatformSettings = require("../models/PlatformSettings");

const phoneRegex = /(?:\+?\d[\d\s-]{7,}\d)/;
const linkRegex = /(https?:\/\/|www\.)[^\s]+/i;

async function getModerationRules() {
  const doc = await PlatformSettings.findOne().lean();
  return doc?.moderationRules || {
    enabled: true,
    keywords: [],
    blockPhone: true,
    blockLinks: true
  };
}

function checkTextForFlags(text, rules) {
  if (!rules?.enabled) return null;
  const content = String(text || "").toLowerCase();
  if (!content) return null;

  if (rules.blockPhone && phoneRegex.test(content)) {
    return "Contains phone number";
  }
  if (rules.blockLinks && linkRegex.test(content)) {
    return "Contains external link";
  }
  const keywords = Array.isArray(rules.keywords)
    ? rules.keywords.map((k) => String(k || "").toLowerCase()).filter(Boolean)
    : [];
  for (const keyword of keywords) {
    if (content.includes(keyword)) {
      return `Contains keyword: ${keyword}`;
    }
  }
  return null;
}

module.exports = {
  getModerationRules,
  checkTextForFlags
};
