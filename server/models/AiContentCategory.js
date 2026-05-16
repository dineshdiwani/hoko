const mongoose = require("mongoose");

const aiContentCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    targetAudience: { type: String, default: "" },
    tone: {
      type: String,
      enum: ["professional", "friendly", "urgent", "sales", "informative"],
      default: "professional"
    },
    imageStyle: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
    dailyGenerationLimit: { type: Number, default: 1, min: 0, max: 20 },
    lastGeneratedAt: { type: Date, default: null },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    updatedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  { timestamps: true }
);

aiContentCategorySchema.index({ active: 1, lastGeneratedAt: 1, createdAt: 1 });

module.exports = mongoose.model("AiContentCategory", aiContentCategorySchema);
