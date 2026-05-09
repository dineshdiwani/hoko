function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCategories(categories) {
  if (Array.isArray(categories)) {
    return categories.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof categories === "string") {
    return categories
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return [];
}

function getSellerProfileStatus(subject = {}) {
  const sellerProfile = subject?.sellerProfile || {};
  const sellerRole = subject?.role === "seller" || Boolean(subject?.roles?.seller);
  const email = normalizeText(subject?.email);
  const mobile = normalizeText(subject?.mobile);
  const city = normalizeText(subject?.city);
  const registeredBusinessName = normalizeText(sellerProfile.registeredBusinessName);
  const managerName = normalizeText(sellerProfile.managerName);
  const categories = normalizeCategories(sellerProfile.categories);

  const missing = [];
  if (!sellerRole) missing.push("seller role");
  if (!email) missing.push("email");
  if (!mobile) missing.push("mobile");
  if (!city) missing.push("city");
  if (!registeredBusinessName) missing.push("registered business name");
  if (!managerName) missing.push("manager name");
  if (!categories.length) missing.push("categories");

  return {
    isComplete: missing.length === 0,
    missing,
    sellerFields: {
      email,
      mobile,
      city,
      registeredBusinessName,
      managerName,
      categories
    }
  };
}

module.exports = {
  getSellerProfileStatus,
  isCompleteSellerProfile: (subject = {}) => getSellerProfileStatus(subject).isComplete
};
