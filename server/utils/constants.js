module.exports = {
  AUTH_TOKEN_EXPIRY: "7d",
  
  OTP_TTL_MINUTES: 5,
  OTP_MAX_ATTEMPTS: 5,
  
  POST_AUTO_EXPIRY_DAYS: 30,
  MIN_POST_AUTO_EXPIRY_DAYS: 7,
  MAX_POST_AUTO_EXPIRY_DAYS: 30,
  
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  SELLER_DEEPLINK_OTP_TTL_MINUTES: 10,
  
  ERROR_MESSAGES: {
    REQUIRED_FIELD: "This field is required",
    INVALID_INPUT: "Invalid input",
    UNAUTHORIZED: "Unauthorized access",
    FORBIDDEN: "Access denied",
    NOT_FOUND: "Resource not found",
    SERVER_ERROR: "Something went wrong",
    VALIDATION_ERROR: "Validation failed"
  },
  
  USER_ROLES: {
    BUYER: "buyer",
    SELLER: "seller",
    ADMIN: "admin"
  },
  
  REQUIREMENT_STATUS: {
    OPEN: "open",
    CLOSED: "closed",
    FULFILLED: "fulfilled",
    CANCELLED: "cancelled",
    EXPIRED: "expired"
  },
  
  OFFER_STATUS: {
    PENDING: "pending",
    SHORTLISTED: "shortlisted",
    REJECTED: "rejected",
    SELECTED: "selected"
  },
  
  NOTIFICATION_TYPES: {
    NEW_POST: "new_post",
    NEW_OFFER: "new_offer",
    OFFER_SELECTED: "offer_selected",
    OFFER_REJECTED: "offer_rejected"
  }
};