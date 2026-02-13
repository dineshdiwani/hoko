const express = require("express");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const ChatMessage = require("../models/ChatMessage");
const Report = require("../models/Report");
const PlatformSettings = require("../models/PlatformSettings");
const AdminAuditLog = require("../models/AdminAuditLog");
const adminAuth = require("../middleware/adminAuth");
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const DEFAULT_TERMS_CONTENT = [
  "By using hoko, you agree to these Terms & Conditions.",
  "hoko is a marketplace platform connecting buyers and sellers. You are responsible for all negotiations, pricing, delivery, and payments.",
  "You must provide accurate information and use the platform responsibly. Impersonation, fraud, or misuse is strictly prohibited.",
  "Abusive, hateful, or harassing language is not allowed in chat or messages. Violations may result in suspension or permanent removal from the platform.",
  "Sellers must ensure their business details are truthful and buyers must post genuine requirements. Any abuse may result in account restrictions.",
  "You are responsible for complying with all applicable laws, taxes, and regulations related to your transactions.",
  "hoko may update these terms at any time. Continued use of the platform indicates acceptance of the updated terms."
].join("\n\n");


router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });

  if (!admin || admin.password !== password) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      id: admin._id,
      role: "admin"
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

async function logAdminAction(admin, action, targetType, targetId, meta = {}) {
  try {
    await AdminAuditLog.create({
      adminId: admin?._id || null,
      action,
      targetType,
      targetId: String(targetId),
      meta
    });
  } catch {
    // best effort
  }
}

/**
 * GET all users (buyers + sellers + admins)
 */
router.get("/users", adminAuth, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

/**
 * Approve or block seller
 */
router.post("/seller/approve", adminAuth, async (req, res) => {
  const { sellerId, approved } = req.body;

  await User.findByIdAndUpdate(sellerId, {
    "sellerProfile.approved": approved
  });

  await logAdminAction(req.admin, "seller_approval", "user", sellerId, {
    approved
  });

  res.json({
    message: approved ? "Seller approved" : "Seller blocked"
  });
});

/**
 * Block or unblock user
 */
router.post("/user/block", adminAuth, async (req, res) => {
  const { userId, blocked } = req.body;
  await User.findByIdAndUpdate(userId, { blocked: Boolean(blocked) });
  await logAdminAction(req.admin, "user_block", "user", userId, {
    blocked: Boolean(blocked)
  });
  res.json({ message: blocked ? "User blocked" : "User unblocked" });
});

/**
 * Force logout / revoke user token
 */
router.post("/user/force-logout", adminAuth, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await logAdminAction(req.admin, "force_logout", "user", userId);
  res.json({ success: true });
});

/**
 * Toggle chat for a user
 */
router.post("/user/chat-toggle", adminAuth, async (req, res) => {
  const { userId, disabled, reason } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  const update = {
    chatDisabled: Boolean(disabled),
    chatDisabledReason: reason || ""
  };
  await User.findByIdAndUpdate(userId, update);
  await logAdminAction(req.admin, "chat_toggle_user", "user", userId, update);
  res.json({ success: true });
});

/**
 * View all buyer requirements (moderation)
 */
router.get("/requirements", adminAuth, async (req, res) => {
  const requirements = await Requirement.find()
    .populate("buyerId", "email city")
    .sort({ createdAt: -1 });
  res.json(requirements);
});

/**
 * Moderate a requirement (remove or restore)
 */
router.post("/requirement/:id/moderate", adminAuth, async (req, res) => {
  const { removed, reason } = req.body || {};
  const isRemoved = Boolean(removed);
  const update = {
    "moderation.removed": isRemoved,
    "moderation.removedAt": isRemoved ? new Date() : null,
    "moderation.removedBy": isRemoved ? req.admin?._id : null,
    "moderation.reason": isRemoved ? (reason || "Removed by admin") : ""
  };
  const requirement = await Requirement.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  await logAdminAction(req.admin, "moderate_requirement", "requirement", req.params.id, {
    removed: isRemoved,
    reason: update["moderation.reason"]
  });
  res.json(requirement);
});

/**
 * Back-compat: delete requirement (marks removed)
 */
router.delete("/requirement/:id", adminAuth, async (req, res) => {
  const update = {
    "moderation.removed": true,
    "moderation.removedAt": new Date(),
    "moderation.removedBy": req.admin?._id || null,
    "moderation.reason": "Removed by admin"
  };
  const requirement = await Requirement.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  await logAdminAction(req.admin, "moderate_requirement", "requirement", req.params.id, {
    removed: true,
    reason: update["moderation.reason"]
  });
  res.json({ message: "Requirement removed" });
});

/**
 * View all offers (moderation)
 */
router.get("/offers", adminAuth, async (req, res) => {
  const offers = await Offer.find()
    .populate("sellerId", "email city sellerProfile")
    .populate("requirementId", "product productName city category");
  res.json(offers);
});

/**
 * Delete an offer
 */
router.delete("/offer/:id", adminAuth, async (req, res) => {
  const update = {
    "moderation.removed": true,
    "moderation.removedAt": new Date(),
    "moderation.removedBy": req.admin?._id || null,
    "moderation.reason": "Removed by admin"
  };
  await Offer.findByIdAndUpdate(req.params.id, update);
  res.json({ message: "Offer removed" });
});

/**
 * Moderate an offer (remove or restore)
 */
router.post("/offer/:id/moderate", adminAuth, async (req, res) => {
  const { removed, reason } = req.body || {};
  const isRemoved = Boolean(removed);
  const update = {
    "moderation.removed": isRemoved,
    "moderation.removedAt": isRemoved ? new Date() : null,
    "moderation.removedBy": isRemoved ? req.admin?._id : null,
    "moderation.reason": isRemoved ? (reason || "Removed by admin") : ""
  };
  const offer = await Offer.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  await logAdminAction(req.admin, "moderate_offer", "offer", req.params.id, {
    removed: isRemoved,
    reason: update["moderation.reason"]
  });
  res.json(offer);
});

/**
 * View all chat messages (moderation)
 */
router.get("/chats", adminAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const chats = await ChatMessage.find()
    .populate("fromUserId", "email city roles")
    .populate("toUserId", "email city roles")
    .populate("requirementId", "product productName city category")
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json(chats);
});

/**
 * Moderate a chat message (remove or restore)
 */
router.post("/chat/:id/moderate", adminAuth, async (req, res) => {
  const { removed, reason } = req.body || {};
  const isRemoved = Boolean(removed);
  const update = {
    "moderation.removed": isRemoved,
    "moderation.removedAt": isRemoved ? new Date() : null,
    "moderation.removedBy": isRemoved ? req.admin?._id : null,
    "moderation.reason": isRemoved ? (reason || "Removed by admin") : ""
  };
  const chat = await ChatMessage.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  await logAdminAction(req.admin, "moderate_chat", "chat", req.params.id, {
    removed: isRemoved,
    reason: update["moderation.reason"]
  });
  res.json(chat);
});

/**
 * Reports (moderation)
 */
router.get("/reports", adminAuth, async (req, res) => {
  const reports = await Report.find()
    .populate("reporterId", "email city roles")
    .populate("reportedUserId", "email city roles")
    .populate("requirementId", "product productName city category")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(reports);
});

router.post("/report/:id/status", adminAuth, async (req, res) => {
  const { status, adminNote } = req.body || {};
  const update = {
    ...(status ? { status } : {}),
    ...(adminNote !== undefined ? { adminNote } : {})
  };
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  await logAdminAction(req.admin, "report_status", "report", req.params.id, update);
  res.json(report);
});

/**
 * Moderation queue (flagged content)
 */
router.get("/moderation/queue", adminAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const [requirements, offers, chats] = await Promise.all([
    Requirement.find({
      "moderation.flagged": true,
      "moderation.removed": { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("buyerId", "email city"),
    Offer.find({
      "moderation.flagged": true,
      "moderation.removed": { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sellerId", "email city sellerProfile")
      .populate("requirementId", "product productName city category"),
    ChatMessage.find({
      "moderation.flagged": true,
      "moderation.removed": { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("fromUserId", "email city roles")
      .populate("toUserId", "email city roles")
      .populate("requirementId", "product productName city category")
  ]);

  res.json({ requirements, offers, chats });
});

/**
 * Toggle chat on a requirement
 */
router.post("/requirement/chat-toggle", adminAuth, async (req, res) => {
  const { requirementId, disabled, reason } = req.body || {};
  if (!requirementId) {
    return res.status(400).json({ message: "requirementId required" });
  }
  const update = {
    chatDisabled: Boolean(disabled),
    chatDisabledReason: reason || ""
  };
  await Requirement.findByIdAndUpdate(requirementId, update);
  await logAdminAction(req.admin, "chat_toggle_requirement", "requirement", requirementId, update);
  res.json({ success: true });
});

/**
 * Get platform dropdown options
 */
router.get("/options", adminAuth, async (req, res) => {
  const doc = await PlatformSettings.findOne();
  res.json(
    doc || {
      cities: ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune"],
      categories: [
        "Agriculture & Food Products",
        "Raw Materials (metals, minerals, chemicals)",
        "Consumer Electronics",
        "Electrical & Electronic Components",
        "Machinery & Industrial Equipment",
        "Automotive Parts & Vehicles",
        "Construction Materials & Tools",
        "Furniture & Home Furnishings",
        "Textiles, Apparel & Footwear",
        "Fashion Accessories & Jewelry",
        "Health, Medical & Pharmaceutical Products",
        "Beauty & Personal Care Products",
        "Household Goods & Appliances",
        "Packaging Materials",
        "Office Supplies & Stationery",
        "Sports, Leisure & Toys",
        "Gifts, Handicrafts & Promotional Items",
        "Energy, Power & Fuels",
        "Chemicals & Plastics",
        "Environmental & Recycling Products",
        "Manufacturing & Contract Production",
        "Trading, Import & Export Services",
        "Logistics, Transportation & Warehousing",
        "Installation, Maintenance & Repair",
        "Construction & Engineering Services",
        "IT Services & Software Development",
        "Digital Services (marketing, design, data)",
        "Financial & Accounting Services",
        "Legal & Compliance Services",
        "Consulting & Business Advisory",
        "Human Resources & Recruitment",
        "Education & Training",
        "Healthcare & Medical Services",
        "Marketing, Advertising & Media",
        "Research & Development (R&D)",
        "Quality Inspection & Testing",
        "Security & Facility Management",
        "Travel, Hospitality & Event Services",
        "Outsourcing & BPO Services",
        "Environmental, Safety & Sustainability Services"
      ],
      units: ["pcs", "kg", "litre", "service"],
      currencies: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"],
      notifications: {
        enabled: true,
        cities: [],
        categories: []
      },
      moderationRules: {
        enabled: true,
        keywords: ["whatsapp", "call me", "direct deal"],
        blockPhone: true,
        blockLinks: true
      },
      termsAndConditions: {
        content: DEFAULT_TERMS_CONTENT
      }
    }
  );
});

/**
 * Update platform dropdown options
 */
router.put("/options", adminAuth, async (req, res) => {
  const {
    cities = [],
    categories = [],
    units = [],
    currencies = [],
    notifications = {},
    moderationRules = {},
    termsAndConditions = {}
  } = req.body || {};
  const doc = await PlatformSettings.findOneAndUpdate(
    {},
    {
      cities,
      categories,
      units,
      currencies,
      notifications,
      moderationRules,
      termsAndConditions
    },
    { upsert: true, new: true }
  );
  await logAdminAction(req.admin, "update_options", "platform_settings", doc._id, {
    cities: cities.length,
    categories: categories.length,
    units: units.length,
    currencies: currencies.length
  });
  res.json(doc);
});

module.exports = router;
