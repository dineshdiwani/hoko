const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    sellerId: { type: String, required: true },   // seller mobile
    buyerId: { type: String, required: true },    // buyer mobile
    requirementId: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
  },
  { timestamps: true }
);

// Prevent duplicate reviews
ReviewSchema.index(
  { sellerId: 1, buyerId: 1, requirementId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Review", ReviewSchema);
