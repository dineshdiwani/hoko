const mongoose = require("mongoose");

const requirementSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    city: {
      type: String,
      required: true
    },

    category: {
      type: String,
      required: true
    },

    productName: {
      type: String,
      required: true
    },

    brand: {
      type: String
    },

    quantity: {
      type: String
    },

    type: {
      type: String
    },

    details: {
      type: String
    },

    attachments: [
      {
        type: String
      }
    ],

    image: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Requirement", requirementSchema);
