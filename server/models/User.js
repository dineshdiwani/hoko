const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true
    },

    city: {
      type: String,
      required: true
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
      approved: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
