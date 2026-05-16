const mongoose = require("mongoose");

const aiContentSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    fixedCta: { type: String, default: "Learn More" },
    generationEnabled: { type: Boolean, default: false },
    approvalRequired: { type: Boolean, default: true },
    maxDraftsPerRun: { type: Number, default: 3, min: 1, max: 20 },
    cronIntervalMinutes: { type: Number, default: 60, min: 5, max: 1440 },
    brandInstructions: { type: String, default: "" },
    blockedWords: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiContentSettings", aiContentSettingsSchema);
