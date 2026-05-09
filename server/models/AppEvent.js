const mongoose = require("mongoose");

const appEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    actorRole: {
      type: String,
      default: ""
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      default: null
    },
    chatMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null
    },
    source: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["success", "failed", "queued"],
      default: "success"
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    error: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

appEventSchema.index({ eventType: 1, createdAt: -1 });
appEventSchema.index({ userId: 1, createdAt: -1 });
appEventSchema.index({ requirementId: 1, createdAt: -1 });
appEventSchema.index({ offerId: 1, createdAt: -1 });

module.exports = mongoose.model("AppEvent", appEventSchema);
