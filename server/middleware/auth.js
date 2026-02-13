const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.authRole = decoded.role;
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      return res.status(401).json({ message: "Invalid user" });
    }
    if (
      typeof decoded.tokenVersion === "number" &&
      decoded.tokenVersion !== req.user.tokenVersion
    ) {
      return res.status(401).json({ message: "Token revoked" });
    }
    if (req.user.blocked) {
      return res.status(403).json({ message: "User blocked" });
    }
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
