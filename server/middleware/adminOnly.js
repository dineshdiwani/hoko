module.exports = function adminOnly(req, res, next) {
  const role = req.headers["x-role"];

  if (role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }

  next();
};
