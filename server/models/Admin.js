const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: "" },
  // Backward compatibility for older records; migrated on successful login.
  password: { type: String, default: "" },
  role: {
    type: String,
    enum: ["admin", "super_admin", "ops_admin", "moderator", "support"],
    default: "ops_admin"
  },
  permissions: [{ type: String }],
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  failedLoginCount: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("Admin", AdminSchema);
