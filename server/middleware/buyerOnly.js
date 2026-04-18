module.exports = function buyerOnly(req, res, next) {
  if (!req.user?.roles?.buyer) {
    return res.status(403).json({ message: "Buyer access only" });
  }
  // Allow if user has both roles (seller+buyer) - they can switch
  const hasBothRoles = req.user?.roles?.seller && req.user?.roles?.buyer;
  if (req.authRole && req.authRole !== "buyer" && !hasBothRoles) {
    return res.status(403).json({ message: "Switch to buyer role" });
  }
  next();
};
