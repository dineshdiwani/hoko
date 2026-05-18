const mongoose = require("mongoose");

const aiGeneratedPostSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiContentCategory",
      required: true,
      index: true
    },
    campaignRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiContentCampaignRun",
      default: null,
      index: true
    },
    categorySnapshot: {
      name: { type: String, default: "" },
      description: { type: String, default: "" },
      targetAudience: { type: String, default: "" },
      tone: { type: String, default: "" },
      imageStyle: { type: String, default: "" }
    },
    topic: { type: String, default: "" },
    hook: { type: String, default: "" },
    caption: { type: String, default: "" },
    channelCaptions: {
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
      linkedin: { type: String, default: "" }
    },
    targetPlatforms: [{
      type: String,
      enum: ["facebook", "instagram", "linkedin"]
    }],
    hashtags: [{ type: String }],
    imagePrompt: { type: String, default: "" },
    imageTextOverlay: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    cta: { type: String, default: "" },
    ctaLink: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "approved", "rejected", "queued", "posted", "failed"],
      default: "draft",
      index: true
    },
    generationProvider: { type: String, default: "fallback" },
    textModel: { type: String, default: "" },
    imageProvider: { type: String, default: "" },
    imageModel: { type: String, default: "" },
    rawTextResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    rawImageResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    buffer: {
      postId: { type: String, default: "" },
      channelId: { type: String, default: "" },
      channelName: { type: String, default: "" },
      channelService: { type: String, default: "" },
      mode: { type: String, default: "" },
      dueAt: { type: Date, default: null },
      status: { type: String, default: "" },
      sentAt: { type: Date, default: null },
      rawResponse: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    bufferImageAttached: { type: Boolean, default: false },
    scheduledAt: { type: Date, default: null, index: true },
    approvedAt: { type: Date, default: null },
    approvedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    rejectedAt: { type: Date, default: null },
    rejectedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    lastError: { type: String, default: "" }
  },
  { timestamps: true }
);

aiGeneratedPostSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("AiGeneratedPost", aiGeneratedPostSchema);
