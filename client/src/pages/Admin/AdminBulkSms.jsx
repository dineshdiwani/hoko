import { useCallback, useRef, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

export default function AdminBulkSms() {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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
    const formData = new FormData();
    formData.append("file", file);
    try {
      setUploading(true);
      const res = await api.post("/bulk-sms/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setParsedData(res.data);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to parse file");
    } finally {
      setUploading(false);
    }
  };

  const sendBulkSms = async () => {
    if (!parsedData?.mobiles?.length) {
      alert("Upload mobile numbers first");
      return;
    }
    if (!message.trim()) {
      alert("Enter a message");
      return;
    }
    if (message.trim().length > 160) {
      alert("Message exceeds 160 characters");
      return;
    }
    try {
      setSending(true);
      const res = await api.post("/bulk-sms/send", {
        mobiles: parsedData.mobiles,
        message: message.trim()
      });
      setResult(res.data);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  const clearForm = () => {
    setFile(null);
    setParsedData(null);
    setMessage("");
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Bulk SMS (Fast2SMS)</h1>
          <AdminNav />
        </div>

        <div className="bg-white border rounded-2xl p-4 space-y-6 max-w-2xl">
          <div className="border rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Step 1: Upload Mobile Numbers</h3>
              <p className="text-sm text-gray-600 mb-2">
                Upload Excel file with mobile numbers in column A (header optional).
                Numbers can be 10-digit (e.g., 9876543210) or with country code (e.g., +919876543210).
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
              <h3 className="font-semibold mb-2">Step 2: Enter Message</h3>
              <p className="text-sm text-gray-600 mb-2">
                Message will be sent to all valid numbers. Keep it under 160 characters.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                className="w-full border rounded-lg p-3 text-sm"
                rows={4}
                maxLength={160}
              />
              <p className="text-xs text-gray-500 mt-1">
                Characters: {message.length}/160
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={sendBulkSms}
                disabled={!parsedData?.mobiles?.length || !message.trim() || sending}
                className="btn-primary w-auto px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Bulk SMS"}
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
                <p className="text-green-600">Sent: {result.sent}</p>
                {result.failed > 0 && (
                  <p className="text-red-600">Failed: {result.failed}</p>
                )}
                {result.failures?.length > 0 && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">Failures:</p>
                    {result.failures.slice(0, 5).map((f, i) => (
                      <div key={i} className="text-red-500">
                        {f.mobile}: {f.reason}
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