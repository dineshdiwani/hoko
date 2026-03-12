const mongoose = require("mongoose");

const nativePushTokenSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, required: true },
    platform: { type: String, default: "android" },
    token: { type: String, index: true, required: true }
  },
  { timestamps: true }
);

nativePushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

module.exports = mongoose.model("NativePushToken", nativePushTokenSchema);
