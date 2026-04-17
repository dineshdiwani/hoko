const mongoose = require("mongoose");

const whatsappOTPSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      index: true
    },
    otp: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    verified: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    requirementData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    status: {
      type: String,
      enum: ["pending", "verified", "expired", "used"],
      default: "pending"
    },
    attempts: {
      type: Number,
      default: 0
    },
    lastAttemptAt: {
      type: Date,
      default: null
    },
    provider: {
      type: String,
      default: "whatsapp"
    }
  },
  { timestamps: true }
);

whatsappOTPSchema.index({ mobileE164: 1, createdAt: -1 });
whatsappOTPSchema.index({ mobileE164: 1, status: 1 });
whatsappOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

whatsappOTPSchema.methods.isValid = function() {
  return this.status === "pending" && new Date() < this.expiresAt;
};

whatsappOTPSchema.methods.incrementAttempts = async function() {
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  if (this.attempts >= 5) {
    this.status = "expired";
  }
  await this.save();
};

module.exports = mongoose.model("WhatsAppOTP", whatsappOTPSchema);
