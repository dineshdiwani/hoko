const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    reviewedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      required: true
    },
    reviewerRole: {
      type: String,
      enum: ["buyer", "seller"],
      required: true
    },
    targetRole: {
      type: String,
      enum: ["buyer", "seller"],
      required: true
    },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
  },
  { timestamps: true }
);

// Prevent duplicate reviews
ReviewSchema.index(
  { reviewerId: 1, reviewedUserId: 1, requirementId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Review", ReviewSchema);
