function normalizeCategoryValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    [
      "chat",
      "offer",
      "offer_outcome",
      "reverse_auction",
      "lead",
      "requirement",
      "info"
    ].includes(normalized)
  ) {
    return normalized;
  }
  return "";
}

export function getNotificationCategory(notification) {
  const fromData = normalizeCategoryValue(notification?.data?.category);
  if (fromData) return fromData;
  const type = String(notification?.type || "").trim().toLowerCase();
  if (type === "new_message") return "chat";
  if (type === "new_offer" || type === "offer_viewed") return "offer";
  if (type === "offer_outcome_updated") return "offer_outcome";
  if (type === "reverse_auction" || type === "reverse_auction_invoked") {
    return "reverse_auction";
  }
  if (type === "new_post") return "lead";
  if (type === "requirement_updated") return "requirement";
  return "info";
}

export function getNotificationEvent(notification) {
  return (
    String(notification?.data?.event || "").trim() ||
    String(notification?.type || "").trim() ||
    "info"
  );
}

export function getNotificationState(notification) {
  return String(notification?.state || notification?.data?.state || "")
    .trim()
    .toLowerCase();
}

export function getNotificationRequirementId(notification) {
  return (
    String(
      notification?.requirementId ||
        notification?.data?.requirementId ||
        notification?.data?.entityId ||
        ""
    ).trim() || null
  );
}

export function getNotificationBadgeMeta(notification) {
  const category = getNotificationCategory(notification);
  const state = getNotificationState(notification);
  if (category === "chat") {
    return {
      label: "Chat",
      className: "border border-blue-200 bg-blue-50 text-blue-700"
    };
  }
  if (category === "offer") {
    return {
      label: "Offer",
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }
  if (category === "offer_outcome") {
    if (state === "selected") {
      return {
        label: "Selected",
        className: "border border-green-200 bg-green-50 text-green-700"
      };
    }
    if (state === "rejected") {
      return {
        label: "Rejected",
        className: "border border-red-200 bg-red-50 text-red-700"
      };
    }
    if (state === "shortlisted") {
      return {
        label: "Shortlisted",
        className: "border border-amber-200 bg-amber-50 text-amber-800"
      };
    }
    return {
      label: "Outcome",
      className: "border border-slate-200 bg-slate-50 text-slate-700"
    };
  }
  if (category === "reverse_auction") {
    return {
      label: "Auction",
      className: "border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
    };
  }
  if (category === "lead") {
    return {
      label: "Lead",
      className: "border border-indigo-200 bg-indigo-50 text-indigo-700"
    };
  }
  if (category === "requirement") {
    return {
      label: "Requirement",
      className: "border border-sky-200 bg-sky-50 text-sky-700"
    };
  }
  return {
    label: "Info",
    className: "border border-slate-200 bg-slate-50 text-slate-700"
  };
}
