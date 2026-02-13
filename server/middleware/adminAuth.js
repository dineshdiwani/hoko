const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

module.exports = async function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (decoded?.isEnv) {
      req.admin = { _id: "env-admin", role: "admin" };
      return next();
    }
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ message: "Invalid admin" });
    }
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
