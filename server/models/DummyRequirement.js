const mongoose = require("mongoose");

const dummyRequirementSchema = new mongoose.Schema({
  product: {
    type: String,
    required: true,
    index: true
  },
  quantity: {
    type: Number,
    required: true
  },
  unit: String,
  city: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    index: true
  },
  isDummy: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["new", "sent", "expired"],
    default: "new"
  },
  details: {
    type: String
  },
  realRequirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Requirement"
  }
});

dummyRequirementSchema.index({ city: 1, status: 1 });
dummyRequirementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("DummyRequirement", dummyRequirementSchema);