import { useEffect, useRef, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";
import ApprovedTemplatePicker from "../../components/ApprovedTemplatePicker";
import { getApprovedTemplates } from "../../utils/approvedTemplates";

export default function AdminBulkWhatsApp() {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState(null);
  const [deliveryStatusLoading, setDeliveryStatusLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const loadTemplates = async (preferredValue = "") => {
    try {
      setTemplatesLoading(true);
      const res = await api.get("/admin/whatsapp/templates/registry?includeInactive=true");
      const nextTemplates = Array.isArray(res.data?.items) ? res.data.items : [];
      const activeTemplates = getApprovedTemplates(nextTemplates);
      setTemplates(activeTemplates);
      const preferredTemplate = preferredValue
        ? activeTemplates.find((item) => item._id === preferredValue || item.templateId === preferredValue)
        : null;
      const currentTemplate = selectedTemplateId
        ? activeTemplates.find((item) => item._id === selectedTemplateId)
        : null;
      const firstTemplate = activeTemplates[0];
      const nextSelected = preferredTemplate || currentTemplate || firstTemplate;
      if (nextSelected?._id) {
        setSelectedTemplateId(nextSelected._id);
      }
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to load approved templates from registry");
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const activeTemplate = templates.find((item) => item._id === selectedTemplateId) || null;

  const loadDeliveryStatus = async (batchId) => {
    if (!batchId) return;
    try {
      setDeliveryStatusLoading(true);
      const params = new URLSearchParams();
      params.set("batchId", batchId);
      params.set("channel", "whatsapp");
      params.set("limit", "100");
      const res = await api.get(`/admin/whatsapp/delivery-logs?${params.toString()}`);
      setDeliveryStatus({
        batchId,
        items: Array.isArray(res.data?.items) ? res.data.items : [],
        summary: res.data?.summary || null
      });
    } catch (err) {
      setDeliveryStatus({
        batchId,
        items: [],
        summary: null,
        error: err?.response?.data?.message || err.message || "Failed to load delivery status"
      });
    } finally {
      setDeliveryStatusLoading(false);
    }
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
          const phone = cleaned.startsWith("+")
            ? cleaned
            : cleaned.startsWith("91")
              ? `+${cleaned}`
              : `+91${cleaned}`;
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

  const sendBulkWhatsApp = async () => {
    if (!parsedData?.phones?.length) {
      alert("Upload phone numbers first");
      return;
    }
    if (!selectedTemplateId) {
      alert("Select an approved template");
      return;
    }
    if (!window.confirm(`Send WhatsApp to ${parsedData.phones.length} numbers?`)) return;

    try {
      setSending(true);
      const res = await api.post("/bulk-whatsapp/send", {
        phones: parsedData.phones,
        templateConfigId: selectedTemplateId,
        templateId: activeTemplate?.templateId || "",
        buttonUrl: buttonUrl.trim()
      });
      setResult(res.data);
      setDeliveryStatus(null);
      await loadDeliveryStatus(res.data?.batchId);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to send WhatsApp");
    } finally {
      setSending(false);
    }
  };

  const downloadAnnotatedSheet = async () => {
    if (!parsedData?.phones?.length) {
      alert("Upload and parse the Excel file first");
      return;
    }

    try {
      const res = await api.post(
        "/bulk-whatsapp/export-annotated-sheet",
        { phones: parsedData.phones },
        { responseType: "blob" }
      );

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bulk-whatsapp-annotated-${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to download annotated sheet");
    }
  };

  const clearForm = () => {
    setFile(null);
    setParsedData(null);
    setResult(null);
    setDeliveryStatus(null);
    setButtonUrl("");
    setSelectedTemplateId(templates[0]?._id || "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Bulk Send</h1>
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

          <ApprovedTemplatePicker
            title="Step 2: Select Approved Template"
            description="These templates come from the shared approved template registry. Only active approved UUIDs can be selected."
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectedTemplateIdChange={setSelectedTemplateId}
            selectedTemplate={activeTemplate}
            loading={templatesLoading}
            onRefresh={loadTemplates}
            refreshLabel="Refresh"
            emptyLabel="Select an approved template"
          >
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CTA / Button URL (optional)</label>
              <input
                type="text"
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://hokoapp.in/..."
                className="w-full border rounded-lg p-2 text-sm bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Fill this only if the approved template uses a URL CTA or dynamic button link.
              </p>
            </div>
          </ApprovedTemplatePicker>

          <div className="border rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Step 3: Send</h3>
              <p className="text-sm text-gray-600 mb-2">
                Send the selected approved WhatsApp template to the uploaded numbers.
              </p>
              {activeTemplate && (
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {activeTemplate.templateName} | Template ID: {activeTemplate.templateId}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={sendBulkWhatsApp}
                disabled={!parsedData?.phones?.length || !selectedTemplateId || sending}
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
              <button
                onClick={downloadAnnotatedSheet}
                disabled={!parsedData?.phones?.length}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
              >
                Download annotated sheet
              </button>
            </div>
          </div>

          {result && (
            <div className="border rounded-xl p-4 bg-gray-50">
              <h3 className="font-semibold mb-2">Send Results</h3>
              <div className="text-sm space-y-1">
                <p>Total: {result.total}</p>
                <p className="text-green-600">Provider accepted: {result.accepted?.length || result.sent?.length || 0}</p>
                <p className="text-red-600">Failed: {result.failed?.length || 0}</p>
                <p className="text-xs text-gray-500">
                  Provider accepted means the request reached Gupshup. It does not confirm delivery to the phone.
                </p>
                {result.batchId && (
                  <div className="pt-2">
                    <p className="text-xs text-gray-600 font-medium">Batch ID: {result.batchId}</p>
                    <button
                      onClick={() => loadDeliveryStatus(result.batchId)}
                      disabled={deliveryStatusLoading}
                      className="mt-2 px-3 py-1.5 rounded border border-gray-300 text-xs"
                    >
                      {deliveryStatusLoading ? "Refreshing..." : "Refresh delivery status"}
                    </button>
                  </div>
                )}
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

          {deliveryStatus && (
            <div className="border rounded-xl p-4 bg-white">
              <h3 className="font-semibold mb-2">Delivery Status</h3>
              {deliveryStatus.error ? (
                <p className="text-xs text-red-600">{deliveryStatus.error}</p>
              ) : (
                <div className="text-sm space-y-2">
                  <div className="space-y-1">
                    <p>Total logs: {deliveryStatus.summary?.total ?? deliveryStatus.items.length}</p>
                    <p>Accepted: {deliveryStatus.summary?.accepted || 0}</p>
                    <p>Queued: {deliveryStatus.summary?.queued || 0}</p>
                    <p>Sent: {deliveryStatus.summary?.sent || 0}</p>
                    <p>Delivered: {deliveryStatus.summary?.delivered || 0}</p>
                    <p>Read: {deliveryStatus.summary?.read || 0}</p>
                    <p>Failed: {deliveryStatus.summary?.failed || 0}</p>
                  </div>

                  {deliveryStatus.summary?.failed > 0 && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs">
                      <p className="font-medium text-red-700 mb-2">Failed rows</p>
                      {deliveryStatus.items
                        .filter((item) => item.status === "failed")
                        .slice(0, 5)
                        .map((item) => (
                          <div key={item._id} className="mb-2 last:mb-0">
                            <p className="font-medium">{item.mobileE164 || "Unknown number"}</p>
                            <p>Reason: {item.reason || "No reason provided"}</p>
                            {item.providerMessageId && <p>Provider ID: {item.providerMessageId}</p>}
                            {item.providerResponse && (
                              <p className="whitespace-pre-wrap break-words">
                                Provider response: {typeof item.providerResponse === "string" ? item.providerResponse : JSON.stringify(item.providerResponse)}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
