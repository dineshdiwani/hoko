const mongoose = require("mongoose");

const whatsAppCampaignRunSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null
    },
    triggerType: {
      type: String,
      enum: ["buyer_post", "manual_test", "manual_resend"],
      default: "buyer_post"
    },
    status: {
      type: String,
      enum: ["created", "completed", "failed"],
      default: "created"
    },
    city: { type: String, default: "" },
    category: { type: String, default: "" },
    attempted: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    skippedReasons: {
      not_opted_in: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
      dnd: { type: Number, default: 0 },
      inactive: { type: Number, default: 0 },
      city_mismatch: { type: Number, default: 0 },
      category_mismatch: { type: Number, default: 0 }
    },
    dryRun: { type: Boolean, default: false },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsAppCampaignRun", whatsAppCampaignRunSchema);
