const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema(
  {
    from: { type: String, required: true }, // mobile
    to: { type: String, required: true },   // mobile
    message: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
