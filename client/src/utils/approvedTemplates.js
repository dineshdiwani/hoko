export function isApprovedTemplate(template) {
  return Boolean(
    template?.isActive === true &&
      ["APPROVED", "ACTIVE", "ENABLED"].includes(String(template?.status || "").toUpperCase()) &&
      String(template?.templateId || "").trim()
  );
}

export function getApprovedTemplates(templates = []) {
  return Array.isArray(templates)
    ? templates.filter(isApprovedTemplate)
    : [];
}
