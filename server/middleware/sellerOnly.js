module.exports = function sellerOnly(req, res, next) {
  if (!req.user?.roles?.seller) {
    return res.status(403).json({ message: "Seller access only" });
  }
  if (req.authRole && req.authRole !== "seller") {
    return res.status(403).json({ message: "Switch to seller role" });
  }
  next();
};
