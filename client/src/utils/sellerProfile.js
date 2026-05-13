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

export function getSellerProfileStatus(subject = {}) {
  const sellerProfile = subject?.sellerProfile || {};
  const sellerRole = subject?.role === "seller" || Boolean(subject?.roles?.seller);
  const sellerFields = {
    email: normalizeText(subject?.email),
    mobile: normalizeText(subject?.mobile),
    city: normalizeText(subject?.city),
    registeredBusinessName: normalizeText(sellerProfile.registeredBusinessName),
    managerName: normalizeText(sellerProfile.managerName),
    categories: normalizeCategories(sellerProfile.categories)
  };

  const missing = [];
  if (!sellerRole) missing.push("seller role");
  if (!sellerFields.email) missing.push("email");
  if (!sellerFields.mobile) missing.push("mobile");
  if (!sellerFields.city) missing.push("city");
  if (!sellerFields.registeredBusinessName) missing.push("registered business name");
  if (!sellerFields.managerName) missing.push("manager name");
  if (!sellerFields.categories.length) missing.push("categories");

  return {
    isComplete: missing.length === 0,
    missing,
    sellerFields
  };
}

export function isCompleteSellerProfile(subject = {}) {
  return getSellerProfileStatus(subject).isComplete;
}
