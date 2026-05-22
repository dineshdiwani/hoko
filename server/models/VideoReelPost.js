const mongoose = require("mongoose");

const videoReelPostSchema = new mongoose.Schema(
  {
    hook: { type: String, default: "" },
    media: {
      mode: {
        type: String,
        enum: ["none", "url", "file"],
        default: "none"
      },
      url: { type: String, default: "" },
      filePath: { type: String, default: "" },
      fileName: { type: String, default: "" },
      originalName: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      size: { type: Number, default: 0 }
    },
    channelIds: [{ type: String }],
    scheduleAt: {
      type: Date,
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ["draft", "queued", "processing", "published", "failed", "cancelled"],
      default: "draft",
      index: true
    },
    publishedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    bufferResults: [{ type: mongoose.Schema.Types.Mixed }],
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  { timestamps: true }
);

videoReelPostSchema.index({ status: 1, scheduleAt: 1, createdAt: -1 });

module.exports = mongoose.model("VideoReelPost", videoReelPostSchema);
