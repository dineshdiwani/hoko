const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      required: true
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    messageType: {
      type: String,
      enum: ["text", "file"],
      default: "text"
    },
    message: { type: String, required: true },
    attachment: {
      filename: { type: String, default: "" },
      originalName: { type: String, default: "" },
      mimetype: { type: String, default: "" },
      size: { type: Number, default: 0 }
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date,
      default: null
    },
    moderation: {
      removed: { type: Boolean, default: false },
      removedAt: { type: Date, default: null },
      removedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
      },
      reason: { type: String, default: "" },
      flagged: { type: Boolean, default: false },
      flaggedAt: { type: Date, default: null },
      flaggedReason: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
