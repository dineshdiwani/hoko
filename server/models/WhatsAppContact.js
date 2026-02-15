const mongoose = require("mongoose");

const whatsAppContactSchema = new mongoose.Schema(
  {
    firmName: {
      type: String,
      default: ""
    },
    city: {
      type: String,
      required: true
    },
    cityNormalized: {
      type: String,
      required: true,
      index: true
    },
    countryCode: {
      type: String,
      required: true
    },
    mobileNumber: {
      type: String,
      required: true
    },
    mobileE164: {
      type: String,
      required: true,
      unique: true
    },
    active: {
      type: Boolean,
      default: true
    },
    source: {
      type: String,
      default: "admin_excel"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsAppContact", whatsAppContactSchema);
