const mongoose = require("mongoose");

const whatsAppTemplateRegistrySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true
    },
    templateName: {
      type: String,
      required: true,
      trim: true
    },
    templateId: {
      type: String,
      default: "",
      trim: true
    },
    language: {
      type: String,
      default: "en",
      trim: true
    },
    category: {
      type: String,
      default: "UTILITY",
      trim: true
    },
    status: {
      type: String,
      default: "PENDING",
      trim: true
    },
    variableCount: {
      type: Number,
      default: 0,
      min: 0
    },
    buttonUrlPattern: {
      type: String,
      default: "",
      trim: true
    },
    isActive: {
      type: Boolean,
      default: false
    },
    version: {
      type: String,
      default: "v1",
      trim: true
    },
    fallbackKey: {
      type: String,
      default: "",
      trim: true
    },
    notes: {
      type: String,
      default: "",
      trim: true
    }
  },
  { timestamps: true }
);

whatsAppTemplateRegistrySchema.index({ key: 1, language: 1, version: 1 }, { unique: true });
whatsAppTemplateRegistrySchema.index({ isActive: 1, status: 1, key: 1 });

module.exports = mongoose.model("WhatsAppTemplateRegistry", whatsAppTemplateRegistrySchema);
