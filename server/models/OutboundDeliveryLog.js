const mongoose = require("mongoose");

const outboundDeliveryLogSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ["whatsapp", "sms", "email", "push"],
      required: true
    },
    eventType: {
      type: String,
      default: ""
    },
    target: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["attempted", "sent", "failed", "skipped"],
      default: "attempted"
    },
    provider: {
      type: String,
      default: ""
    },
    providerMessageId: {
      type: String,
      default: ""
    },
    attempts: {
      type: Number,
      default: 1
    },
    messagePreview: {
      type: String,
      default: ""
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  { timestamps: true }
);

outboundDeliveryLogSchema.index({ channel: 1, status: 1, createdAt: -1 });
outboundDeliveryLogSchema.index({ eventType: 1, createdAt: -1 });
outboundDeliveryLogSchema.index({ target: 1, createdAt: -1 });

module.exports = mongoose.model("OutboundDeliveryLog", outboundDeliveryLogSchema);
