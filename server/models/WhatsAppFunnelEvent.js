const mongoose = require("mongoose");

const whatsAppFunnelEventSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      index: true
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound", "system"],
      default: "system"
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    campaign: {
      type: String,
      default: "",
      index: true
    },
    step: {
      type: String,
      default: "",
      index: true
    },
    provider: {
      type: String,
      default: ""
    },
    providerMessageId: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      default: ""
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

whatsAppFunnelEventSchema.index({ createdAt: -1 });
whatsAppFunnelEventSchema.index({ mobileE164: 1, createdAt: -1 });

module.exports = mongoose.model("WhatsAppFunnelEvent", whatsAppFunnelEventSchema);
