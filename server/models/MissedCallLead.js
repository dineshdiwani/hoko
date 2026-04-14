const mongoose = require("mongoose");

const missedCallLeadSchema = new mongoose.Schema({
  mobileE164: {
    type: String,
    required: true,
    index: true
  },
  mobileRaw: String,
  calledAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["new", "contacted", "not_interested"],
    default: "new"
  },
  source: {
    type: String,
    default: "missed_call"
  },
  notes: String,
  followUpAt: Date
});

missedCallLeadSchema.index({ calledAt: -1 });
missedCallLeadSchema.index({ status: 1, calledAt: -1 });

module.exports = mongoose.model("MissedCallLead", missedCallLeadSchema);