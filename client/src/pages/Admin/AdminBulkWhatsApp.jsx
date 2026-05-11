import { useEffect, useRef, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

export default function AdminBulkWhatsApp() {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [parametersText, setParametersText] = useState("");
  const [templateForm, setTemplateForm] = useState({
    templateName: "",
    templateId: "",
    message: "",
    isActive: true
  });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const loadTemplates = async (preferredValue = "") => {
    try {
      setTemplatesLoading(true);
      const res = await api.get("/bulk-whatsapp/templates?includeInactive=true");
      const nextTemplates = Array.isArray(res.data?.templates) ? res.data.templates : [];
      setTemplates(nextTemplates);

      const preferredTemplate = preferredValue
        ? nextTemplates.find(
            (item) =>
              item._id === preferredValue ||
              item.templateId === preferredValue ||
              item.key === preferredValue
          )
        : null;
      const currentTemplate = selectedTemplateId
        ? nextTemplates.find((item) => item._id === selectedTemplateId)
        : null;
      const firstActive = nextTemplates.find((item) => item.isActive !== false) || nextTemplates[0];
      const nextSelected = preferredTemplate || currentTemplate || firstActive;

      if (nextSelected) {
        setSelectedTemplateId(nextSelected._id);
        setEditingTemplateId(nextSelected._id);
        setTemplateForm({
          templateName: nextSelected.templateName || "",
          templateId: nextSelected.templateId || "",
          message: nextSelected.message || "",
          isActive: nextSelected.isActive !== false
        });
        setMessage(nextSelected.message || "");
      }
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to load bulk WhatsApp templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const activeTemplate = templates.find((item) => item._id === selectedTemplateId) || null;
  const selectedTemplateMessage = String(templateForm.message || activeTemplate?.message || "").trim();
  const selectedTemplateName = String(templateForm.templateName || activeTemplate?.templateName || "").trim();
  const selectedTemplateIdValue = String(templateForm.templateId || activeTemplate?.templateId || "").trim();

  const resetTemplateForm = () => {
    setEditingTemplateId("");
    setSelectedTemplateId("");
    setTemplateForm({
      templateName: "",
      templateId: "",
      message: "",
      isActive: true
    });
    setMessage("");
  };

  const syncSelectedTemplate = (templateId) => {
    const selected = templates.find((item) => item._id === templateId) || null;
    setSelectedTemplateId(templateId);
    if (!selected) return;
    setEditingTemplateId(selected._id);
    setTemplateForm({
      templateName: selected.templateName || "",
      templateId: selected.templateId || "",
      message: selected.message || "",
      isActive: selected.isActive !== false
    });
    setMessage(selected.message || "");
  };

  const handleFileSelect = (event) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    const lower = selected.name.toLowerCase();
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      alert("Please upload an Excel file (.xls or .xlsx)");
      event.target.value = "";
      return;
    }
    setFile(selected);
    setParsedData(null);
    setResult(null);
  };

  const uploadAndParse = async () => {
    if (!file) return;
    try {
      setUploading(true);
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const phones = [];
      const errors = [];

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const rawPhone = row?.[0];
        const cleaned = String(rawPhone || "").replace(/[^\d+]/g, "");
        if (cleaned.length >= 10) {
          const phone = cleaned.startsWith("+") ? cleaned : cleaned.startsWith("91") ? `+${cleaned}` : `+91${cleaned}`;
          phones.push(phone);
        } else if (rawPhone && String(rawPhone).trim()) {
          errors.push({ row: i + 1, value: rawPhone, reason: "Invalid format" });
        }
      }

      const uniquePhones = [...new Set(phones)];
      setParsedData({
        phones: uniquePhones,
        valid: uniquePhones.length,
        invalid: errors.length,
        errors
      });
    } catch (err) {
      alert(err?.message || "Failed to parse file");
    } finally {
      setUploading(false);
    }
  };

  const saveTemplate = async () => {
    const payload = {
      templateName: templateForm.templateName.trim(),
      templateId: templateForm.templateId.trim(),
      message: templateForm.message.trim(),
      isActive: templateForm.isActive !== false
    };

    if (!payload.templateName) {
      alert("Enter a template name");
      return;
    }
    if (!payload.templateId) {
      alert("Enter a template ID");
      return;
    }
    if (!payload.message) {
      alert("Enter a template message");
      return;
    }

    try {
      setSavingTemplate(true);
      if (editingTemplateId) {
        await api.put(`/bulk-whatsapp/templates/${editingTemplateId}`, payload);
      } else {
        await api.post("/bulk-whatsapp/templates", payload);
      }
      await loadTemplates(payload.templateId);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!templateId) return;
    if (!window.confirm("Delete this bulk WhatsApp template?")) return;
    try {
      setDeletingTemplateId(templateId);
      await api.delete(`/bulk-whatsapp/templates/${templateId}`);
      if (selectedTemplateId === templateId) {
        resetTemplateForm();
      }
      await loadTemplates();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete template");
    } finally {
      setDeletingTemplateId("");
    }
  };

  const sendBulkWhatsApp = async () => {
    if (!parsedData?.phones?.length) {
      alert("Upload phone numbers first");
      return;
    }
    if (!activeTemplate?.templateId) {
      alert("Select a bulk WhatsApp template");
      return;
    }
    if (!selectedTemplateMessage) {
      alert("Selected template has no message");
      return;
    }
    if (!window.confirm(`Send WhatsApp to ${parsedData.phones.length} numbers?`)) return;

    try {
      setSending(true);
      const parameters = parametersText
        ? parametersText.split(",").map((item) => item.trim()).filter(Boolean)
        : [];
      const res = await api.post("/bulk-whatsapp/send", {
        phones: parsedData.phones,
        templateId: activeTemplate.templateId,
        buttonUrl: buttonUrl.trim() || undefined,
        parameters
      });
      setResult(res.data);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to send WhatsApp");
    } finally {
      setSending(false);
    }
  };

  const clearForm = () => {
    setFile(null);
    setParsedData(null);
    setMessage("");
    setButtonUrl("");
    setParametersText("");
    setResult(null);
    resetTemplateForm();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Bulk WhatsApp</h1>
          <AdminNav />
        </div>

        <div className="bg-white border rounded-2xl p-4 space-y-6 max-w-2xl">
          <div className="border rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Step 1: Upload Mobile Numbers</h3>
              <p className="text-sm text-gray-600 mb-2">
                Upload Excel file with mobile numbers in column A (header optional).
                Numbers can be 10-digit or with country code.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={handleFileSelect}
                className="block w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Selected: {file?.name || "None"}
              </p>
            </div>

            <button
              onClick={uploadAndParse}
              disabled={!file || uploading}
              className="btn-primary w-auto px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {uploading ? "Parsing..." : "Parse Excel"}
            </button>

            {parsedData && (
              <div className="text-sm bg-gray-50 rounded-lg p-3">
                <p className="font-medium">Parsed Results:</p>
                <p>Valid numbers: {parsedData.valid || 0}</p>
                {parsedData.invalid > 0 && (
                  <p className="text-red-600">Invalid entries: {parsedData.invalid}</p>
                )}
                {parsedData.errors?.length > 0 && (
                  <div className="mt-2 text-xs text-red-500">
                    {parsedData.errors.slice(0, 5).map((err, i) => (
                      <div key={i}>Row {err.row}: {err.value} ({err.reason})</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Step 2: Manage Templates</h3>
              <p className="text-sm text-gray-600 mb-2">
                Save WhatsApp template names, template IDs, and message bodies here.
              </p>

              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Template selection</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => syncSelectedTemplate(e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm bg-white"
                      disabled={templatesLoading}
                    >
                      <option value="">{templatesLoading ? "Loading templates..." : "Select a saved template"}</option>
                      {templates.map((template) => (
                        <option key={template._id} value={template._id}>
                          {template.templateName || template.templateId} ({template.templateId})
                          {template.isActive === false ? " - inactive" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={resetTemplateForm}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                    >
                      New Template
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={savingTemplate}
                      className="btn-primary w-auto px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      {savingTemplate ? "Saving..." : editingTemplateId ? "Update Template" : "Save Template"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Template name</label>
                    <input
                      value={templateForm.templateName}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateName: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm"
                      placeholder="Order update"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Template ID</label>
                    <input
                      value={templateForm.templateId}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateId: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm"
                      placeholder="template uuid"
                    />
                  </div>
                </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template message</label>
                <textarea
                    value={templateForm.message}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, message: e.target.value }))}
                    className="w-full border rounded-lg p-3 text-sm"
                    rows={4}
                    placeholder="Approved WhatsApp template body"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Characters: {templateForm.message.length}
                  </p>
                  <div className="mt-2 rounded-lg border bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-600 mb-1">Generated message</p>
                    <div className="text-xs text-gray-700 whitespace-pre-line">
                      {templateForm.message || "Preview will appear here"}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Deeplink / Button URL</label>
                  <input
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                    className="w-full border rounded-lg p-2 text-sm"
                    placeholder="https://hokoapp.in/..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional link button for the WhatsApp template send.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Parameters</label>
                  <input
                    value={parametersText}
                    onChange={(e) => setParametersText(e.target.value)}
                    className="w-full border rounded-lg p-2 text-sm"
                    placeholder="param1, param2, param3"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional comma-separated values for template placeholders.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={templateForm.isActive}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                  Active
                </label>

                <div className="space-y-2">
                  {templates.length > 0 ? (
                    templates.map((template) => (
                      <div
                        key={template._id}
                        className="flex flex-col gap-2 rounded-lg border bg-gray-50 p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{template.templateName || template.templateId}</div>
                          <div className="text-xs text-gray-600">
                            Template ID: {template.templateId} {template.isActive === false ? "(inactive)" : "(active)"}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-pre-line">{template.message}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => syncSelectedTemplate(template._id)}
                            className="px-3 py-1.5 rounded border border-gray-300 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTemplate(template._id)}
                            disabled={deletingTemplateId === template._id}
                            className="px-3 py-1.5 rounded border border-red-300 text-xs text-red-600 disabled:opacity-50"
                          >
                            {deletingTemplateId === template._id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500">No templates saved yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Step 3: Compose Message</h3>
              <p className="text-sm text-gray-600 mb-2">
                Review the selected WhatsApp template before sending.
              </p>
              <textarea
                value={selectedTemplateMessage || message}
                readOnly
                placeholder="Message will load from the selected template"
                className="w-full border rounded-lg p-3 text-sm bg-gray-50"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">
                Characters: {(selectedTemplateMessage || message).length}
              </p>
              {activeTemplate && (
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {selectedTemplateName || activeTemplate.templateId} | Template ID: {selectedTemplateIdValue}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={sendBulkWhatsApp}
                disabled={!parsedData?.phones?.length || !selectedTemplateMessage || !activeTemplate?.templateId || sending}
                className="btn-primary w-auto px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Bulk WhatsApp"}
              </button>
              <button
                onClick={clearForm}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
              >
                Clear
              </button>
            </div>
          </div>

          {result && (
            <div className="border rounded-xl p-4 bg-gray-50">
              <h3 className="font-semibold mb-2">Send Results</h3>
              <div className="text-sm space-y-1">
                <p>Total: {result.total}</p>
                <p className="text-green-600">Sent: {result.sent?.length || 0}</p>
                <p className="text-red-600">Failed: {result.failed?.length || 0}</p>
                {result.failed?.length > 0 && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">Failures:</p>
                    {result.failed.slice(0, 5).map((f, i) => (
                      <div key={i} className="text-red-500">
                        {f.phone}: {f.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
