const mongoose = require("mongoose");

const actionGuardSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    actionType: {
      type: String,
      required: true
    },
    payloadHash: {
      type: String,
      default: ""
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    referenceType: {
      type: String,
      default: ""
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

actionGuardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
actionGuardSchema.index({ actionType: 1, actorId: 1, createdAt: -1 });

module.exports = mongoose.model("ActionGuard", actionGuardSchema);
