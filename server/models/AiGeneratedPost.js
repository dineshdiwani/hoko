const mongoose = require("mongoose");

const aiGeneratedPostSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiContentCategory",
      required: true,
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
    hashtags: [{ type: String }],
    imagePrompt: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    cta: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "approved", "rejected", "queued", "posted", "failed"],
      default: "draft",
      index: true
    },
    generationProvider: { type: String, default: "fallback" },
    textModel: { type: String, default: "" },
    imageModel: { type: String, default: "" },
    rawTextResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    rawImageResponse: { type: mongoose.Schema.Types.Mixed, default: null },
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
