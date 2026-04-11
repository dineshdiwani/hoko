const mongoose = require("mongoose");

const tempRequirementSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["pending", "completed", "expired", "cancelled"],
      default: "pending"
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    source: {
      type: String,
      enum: ["whatsapp", "direct"],
      default: "whatsapp"
    },
    templateUsed: {
      type: String,
      default: "buyer_invite_post_requirement"
    },
    expiresAt: {
      type: Date,
      default: () => {
        const now = new Date();
        now.setDate(now.getDate() + 7);
        return now;
      }
    }
  },
  { timestamps: true }
);

tempRequirementSchema.index({ mobileE164: 1 });
tempRequirementSchema.index({ status: 1, expiresAt: 1 });
tempRequirementSchema.index({ _id: 1, status: 1 });

module.exports = mongoose.model("TempRequirement", tempRequirementSchema);
