const mongoose = require("mongoose");

const deepLinkContextSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    identityKey: {
      type: String,
      default: "",
      index: true
    },
    actionType: {
      type: String,
      default: "generic",
      index: true
    },
    role: {
      type: String,
      default: ""
    },
    source: {
      type: String,
      default: ""
    },
    path: {
      type: String,
      default: ""
    },
    query: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ["active", "consumed", "expired"],
      default: "active",
      index: true
    },
    consumedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

deepLinkContextSchema.index({ userId: 1, actionType: 1, path: 1, status: 1 });
deepLinkContextSchema.index({ identityKey: 1, actionType: 1, path: 1, status: 1 });

module.exports = mongoose.model("DeepLinkContext", deepLinkContextSchema);
