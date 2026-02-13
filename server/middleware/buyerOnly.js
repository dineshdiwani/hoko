module.exports = function buyerOnly(req, res, next) {
  if (!req.user?.roles?.buyer) {
    return res.status(403).json({ message: "Buyer access only" });
  }
  if (req.authRole && req.authRole !== "buyer") {
    return res.status(403).json({ message: "Switch to buyer role" });
  }
  next();
};
