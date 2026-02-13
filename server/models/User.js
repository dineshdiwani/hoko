const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true
    },

    passwordHash: {
      type: String
    },

    googleProfile: {
      sub: { type: String },
      name: { type: String },
      picture: { type: String }
    },

    city: {
      type: String,
      required: true
    },

    preferredCurrency: {
      type: String,
      default: "INR"
    },

    roles: {
      buyer: { type: Boolean, default: true },
      seller: { type: Boolean, default: false },
      admin: { type: Boolean, default: false }
    },

    sellerProfile: {
      firmName: { type: String },
      managerName: { type: String },
      categories: [{ type: String }],
      approved: { type: Boolean, default: false },
      businessName: { type: String },
      registrationDetails: { type: String },
      businessAddress: { type: String },
      ownerName: { type: String },
      website: { type: String },
      taxId: { type: String }
    },

    termsAccepted: {
      at: { type: Date }
    },

    blocked: {
      type: Boolean,
      default: false
    },

    tokenVersion: {
      type: Number,
      default: 0
    },

    chatDisabled: {
      type: Boolean,
      default: false
    },
    chatDisabledReason: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
