const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String, // hashed later
  role: { type: String, default: "admin" }
});

module.exports = mongoose.model("Admin", AdminSchema);
