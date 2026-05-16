const mongoose = require("mongoose");

const aiContentJobLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["generate_drafts"],
      default: "generate_drafts",
      index: true
    },
    status: {
      type: String,
      enum: ["started", "completed", "failed", "skipped"],
      default: "started",
      index: true
    },
    picked: { type: Number, default: 0 },
    createdDrafts: { type: Number, default: 0 },
    message: { type: String, default: "" },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

aiContentJobLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiContentJobLog", aiContentJobLogSchema);
