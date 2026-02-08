const mongoose = require("mongoose");

const pushSchema = new mongoose.Schema({
  userId: String,
  subscription: Object
});

module.exports = mongoose.model("PushSubscription", pushSchema);
