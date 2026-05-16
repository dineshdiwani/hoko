const mongoose = require("mongoose");

const aiContentTrainingNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["stored", "sent", "archived"],
      default: "stored",
      index: true
    },
    sentAt: { type: Date, default: null },
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

aiContentTrainingNoteSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiContentTrainingNote", aiContentTrainingNoteSchema);
