export function isApprovedTemplate(template) {
  return Boolean(
    template?.isActive === true &&
      ["APPROVED", "ACTIVE", "ENABLED"].includes(String(template?.status || "").toUpperCase()) &&
      String(template?.templateId || "").trim()
  );
}

export function getApprovedTemplates(templates = []) {
  return sortApprovedTemplates(Array.isArray(templates) ? templates.filter(isApprovedTemplate) : []);
}

export function sortApprovedTemplates(templates = []) {
  return [...(Array.isArray(templates) ? templates : [])].sort((a, b) => {
    const keyA = String(a?.key || a?.templateName || "").trim().toLowerCase();
    const keyB = String(b?.key || b?.templateName || "").trim().toLowerCase();
    const nameA = String(a?.templateName || "").trim().toLowerCase();
    const nameB = String(b?.templateName || "").trim().toLowerCase();
    const idA = String(a?.templateId || "").trim().toLowerCase();
    const idB = String(b?.templateId || "").trim().toLowerCase();
    const langA = String(a?.language || "").trim().toLowerCase();
    const langB = String(b?.language || "").trim().toLowerCase();

    return (
      keyA.localeCompare(keyB) ||
      nameA.localeCompare(nameB) ||
      idA.localeCompare(idB) ||
      langA.localeCompare(langB)
    );
  });
}
