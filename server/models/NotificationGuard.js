const mongoose = require("mongoose");

const NotificationGuardSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    kind: {
      type: String,
      default: ""
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model("NotificationGuard", NotificationGuardSchema);
