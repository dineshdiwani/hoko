module.exports = function sellerOnly(req, res, next) {
  if (!req.user?.roles?.seller) {
    return res.status(403).json({ message: "Seller access only" });
  }
  next();
};
