const mongoose = require("mongoose");

const socialMediaCampaignSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["facebook_page", "instagram", "linkedin"],
      default: "instagram",
      index: true
    },
    type: {
      type: String,
      enum: ["post"],
      default: "post"
    },
    status: {
      type: String,
      enum: ["draft", "queued", "processing", "published", "failed", "cancelled"],
      default: "draft",
      index: true
    },
    pageId: { type: String, default: "" },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    link: { type: String, default: "" },
    media: {
      mode: {
        type: String,
        enum: ["none", "url", "file"],
        default: "none"
      },
      url: { type: String, default: "" },
      filePath: { type: String, default: "" },
      fileName: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      size: { type: Number, default: 0 }
    },
    scheduleAt: {
      type: Date,
      default: null,
      index: true
    },
    publishedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    providerPostId: { type: String, default: "" },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    lastError: { type: String, default: "" },
    source: {
      type: String,
      enum: ["manual", "sheet_import", "ai_draft"],
      default: "manual"
    },
    aiPrompt: { type: String, default: "" },
    aiDraft: { type: mongoose.Schema.Types.Mixed, default: null },
    sheetSource: { type: mongoose.Schema.Types.Mixed, default: null },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    updatedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  { timestamps: true }
);

socialMediaCampaignSchema.index({ status: 1, scheduleAt: 1, createdAt: -1 });

module.exports = mongoose.model("SocialMediaCampaign", socialMediaCampaignSchema);
