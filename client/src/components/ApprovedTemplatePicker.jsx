import { sortApprovedTemplates } from "../utils/approvedTemplates";

const PLACEHOLDER_PATTERN = /(\{\{[^{}]+\}\})/g;

function renderPreviewContent(text) {
  const parts = String(text || "").split(PLACEHOLDER_PATTERN).filter(Boolean);

  if (!parts.length) {
    return null;
  }

  return parts.map((part, index) => {
    if (part.startsWith("{{") && part.endsWith("}}")) {
      return (
        <span
          key={`${part}-${index}`}
          className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-900"
        >
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export default function ApprovedTemplatePicker({
  title = "Approved Template",
  description = "",
  templates = [],
  selectedTemplateId = "",
  onSelectedTemplateIdChange,
  selectedTemplate = null,
  loading = false,
  onRefresh = null,
  refreshLabel = "Refresh",
  showRefresh = true,
  emptyLabel = "Select an approved template",
  detailsLabel = "Selected template",
  previewLabel = "Template preview",
  children = null,
  className = ""
}) {
  const optionLabel = (template) =>
    `${template?.key || template?.templateName || "Template"} | ${template?.templateName || template?.key || "-"} | ${template?.templateId || "NO_ID"} | ${template?.language || "en"}${template?.category ? ` | ${template.category}` : ""}`;
  const sortedTemplates = sortApprovedTemplates(templates);
  const previewText = String(
    selectedTemplate?.message ||
      selectedTemplate?.body ||
      selectedTemplate?.content ||
      selectedTemplate?.templateBody ||
      selectedTemplate?.template?.body ||
      selectedTemplate?.template?.content ||
      ""
  ).trim();

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${showRefresh && onRefresh ? "" : "mb-1"}`}>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {description ? <p className="text-xs text-gray-500">{description}</p> : null}
        </div>
        {showRefresh && onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
          >
            {loading ? "Loading..." : refreshLabel}
          </button>
        ) : null}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Approved template</label>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
          value={selectedTemplateId}
          onChange={(e) => onSelectedTemplateIdChange?.(e.target.value)}
          disabled={loading}
        >
          <option value="">{loading ? "Loading templates..." : emptyLabel}</option>
          {sortedTemplates.map((template) => (
            <option key={template._id} value={template._id}>
              {optionLabel(template)}
            </option>
          ))}
        </select>
      </div>

      {selectedTemplate ? (
        <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
          <p className="font-medium mb-1">{detailsLabel}</p>
          <p>Key: {selectedTemplate.key || "-"}</p>
          <p>Name: {selectedTemplate.templateName || "-"}</p>
          <p>UUID: {selectedTemplate.templateId || "-"}</p>
          <p>Language: {selectedTemplate.language || "en"}</p>
          <p>Status: {selectedTemplate.status || "APPROVED"}</p>
          <p>Variables: {Number(selectedTemplate.variableCount || 0)}</p>
          <p>Category: {selectedTemplate.category || "-"}</p>
        </div>
      ) : null}

      {selectedTemplate ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-3 text-xs text-gray-700">
          <p className="font-medium mb-2">{previewLabel}</p>
          {previewText ? (
            <pre className="whitespace-pre-wrap break-words font-sans leading-5 text-gray-800">
              {renderPreviewContent(previewText)}
            </pre>
          ) : (
            <p className="text-gray-500">
              No template message cached yet. Sync templates from provider to populate the preview.
            </p>
          )}
        </div>
      ) : null}

      {children}
    </div>
  );
}
