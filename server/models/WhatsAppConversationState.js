const mongoose = require("mongoose");

const whatsAppConversationStateSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    stage: {
      type: String,
      enum: ["awaiting_role", "completed", "other"],
      default: "awaiting_role"
    },
    provider: {
      type: String,
      default: "unknown"
    },
    lastInboundText: {
      type: String,
      default: ""
    },
    lastIntent: {
      type: String,
      default: ""
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "WhatsAppConversationState",
  whatsAppConversationStateSchema
);
