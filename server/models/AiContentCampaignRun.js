const mongoose = require("mongoose");

const aiContentCampaignRunSchema = new mongoose.Schema(
  {
    mood: { type: String, required: true, trim: true },
    postCount: { type: Number, default: 3, min: 1, max: 5 },
    audienceMode: {
      type: String,
      enum: ["auto", "buyers", "sellers", "both"],
      default: "auto"
    },
    categoryMode: {
      type: String,
      enum: ["auto", "selected"],
      default: "auto"
    },
    selectedCategories: [{ type: String }],
    imageStyle: { type: String, default: "auto" },
    useAppScreenshots: { type: Boolean, default: false },
    fixedCta: { type: String, default: "" },
    ctaLink: { type: String, default: "" },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true
    },
    draftIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiGeneratedPost"
    }],
    progress: { type: Number, default: 0, min: 0, max: 100 },
    lastError: { type: String, default: "" },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  { timestamps: true }
);

aiContentCampaignRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiContentCampaignRun", aiContentCampaignRunSchema);
