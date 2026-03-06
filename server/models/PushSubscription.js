const mongoose = require("mongoose");

const pushSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  endpoint: { type: String, index: true, default: "" },
  subscription: Object
}, { timestamps: true });

pushSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model("PushSubscription", pushSchema);
