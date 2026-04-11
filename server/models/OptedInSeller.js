const mongoose = require("mongoose");

const optedInSellerSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    mobile: {
      type: String,
      trim: true
    },
    countryCode: {
      type: String,
      default: "+91"
    },
    city: {
      type: String,
      trim: true,
      index: true
    },
    categories: [{
      type: String,
      trim: true
    }],
    source: {
      type: String,
      enum: ["whatsapp_keyword", "excel_upload", "referral", "manual", "marketing_link", "qr_code", "sms_blast"],
      default: "whatsapp_keyword"
    },
    optedInAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active"
    },
    lastNotifiedAt: {
      type: Date
    },
    totalNotificationsSent: {
      type: Number,
      default: 0
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

optedInSellerSchema.index({ city: 1, status: 1 });
optedInSellerSchema.index({ categories: 1, status: 1 });
optedInSellerSchema.index({ source: 1, status: 1 });

module.exports = mongoose.model("OptedInSeller", optedInSellerSchema);
