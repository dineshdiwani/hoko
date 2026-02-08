const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      required: true
    },

    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    price: {
      type: Number,
      required: true
    },

    message: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Offer", offerSchema);
