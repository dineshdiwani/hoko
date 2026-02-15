const ROLE_PERMISSIONS = {
  admin: ["*"],
  super_admin: ["*"],
  ops_admin: [
    "users.read",
    "users.manage",
    "sellers.approve",
    "requirements.read",
    "requirements.moderate",
    "offers.read",
    "offers.moderate",
    "chats.read",
    "chats.moderate",
    "reports.read",
    "reports.manage",
    "options.read",
    "options.manage",
    "campaigns.read",
    "campaigns.manage",
    "admins.read"
  ],
  moderator: [
    "requirements.read",
    "requirements.moderate",
    "offers.read",
    "offers.moderate",
    "chats.read",
    "chats.moderate",
    "reports.read",
    "reports.manage"
  ],
  support: [
    "users.read",
    "requirements.read",
    "offers.read",
    "chats.read",
    "reports.read",
    "options.read",
    "campaigns.read"
  ]
};

function getAdminPermissions(admin) {
  const explicit = Array.isArray(admin?.permissions)
    ? admin.permissions.filter(Boolean)
    : [];
  if (explicit.includes("*")) return ["*"];
  const rolePermissions = ROLE_PERMISSIONS[String(admin?.role || "ops_admin")] || [];
  return Array.from(new Set([...rolePermissions, ...explicit]));
}

function hasPermission(admin, required) {
  const permissions = getAdminPermissions(admin);
  if (permissions.includes("*")) return true;
  return permissions.includes(required);
}

function requireAdminPermission(required) {
  return (req, res, next) => {
    if (hasPermission(req.admin, required)) {
      return next();
    }
    return res.status(403).json({
      message: "Forbidden",
      requiredPermission: required
    });
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  getAdminPermissions,
  hasPermission,
  requireAdminPermission
};
