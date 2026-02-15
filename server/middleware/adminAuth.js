const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

module.exports = async function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ message: "Invalid admin" });
    }
    if (admin.active === false) {
      return res.status(403).json({ message: "Admin account disabled" });
    }
    const tokenVersion = Number(decoded?.tokenVersion || 0);
    if (Number(admin.tokenVersion || 0) !== tokenVersion) {
      return res.status(401).json({ message: "Session expired" });
    }
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
