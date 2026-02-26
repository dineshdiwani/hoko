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
      required: true
    },
    email: {
      type: String,
      default: ""
    },
    categories: [{ type: String }],
    categoriesNormalized: [{ type: String, index: true }],
    active: {
      type: Boolean,
      default: true
    },
    optInStatus: {
      type: String,
      enum: ["opted_in", "not_opted_in"],
      default: "opted_in"
    },
    optInSource: {
      type: String,
      default: "admin_upload"
    },
    optInAt: {
      type: Date,
      default: Date.now
    },
    unsubscribedAt: {
      type: Date,
      default: null
    },
    unsubscribeReason: {
      type: String,
      default: ""
    },
    dndStatus: {
      type: String,
      enum: ["allow", "dnd"],
      default: "allow"
    },
    dndSource: {
      type: String,
      default: ""
    },
    tags: [{ type: String }],
    source: {
      type: String,
      default: "admin_excel"
    }
  },
  { timestamps: true }
);

// Allow same mobile in different cities, but keep one record per mobile+city.
whatsAppContactSchema.index(
  { mobileE164: 1, cityNormalized: 1 },
  { unique: true }
);

module.exports = mongoose.model("WhatsAppContact", whatsAppContactSchema);
