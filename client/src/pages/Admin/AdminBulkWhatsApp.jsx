import { useEffect, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

export default function AdminBulkWhatsApp() {
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState({ total: 0, byCity: [], byCategory: [] });
  const [mode, setMode] = useState("city");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [phones, setPhones] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [parameters, setParameters] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [templatesRes, statsRes] = await Promise.all([
        api.get("/bulk-whatsapp/templates"),
        api.get("/bulk-whatsapp/stats")
      ]);
      setTemplates(templatesRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.log("Load error:", err.message);
    }
  };

  const sendByCity = async () => {
    if (!city || !selectedTemplate) {
      alert("City and template required");
      return;
    }
    const confirmMsg = category 
      ? `Send to opted-in sellers in ${city} with category "${category}"?`
      : `Send to all opted-in sellers in ${city}?`;
    if (!confirm(confirmMsg)) return;

    setSending(true);
    setResult(null);
    try {
      const params = parameters ? parameters.split(",").map(p => p.trim()) : [];
      const res = await api.post("/bulk-whatsapp/send-city", {
        city,
        category: category || undefined,
        templateKey: selectedTemplate,
        parameters: params,
        buttonUrl: buttonUrl || undefined
      });
      setResult(res.data);
    } catch (err) {
      alert(err?.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  const sendToPhones = async () => {
    if (!phones || !selectedTemplate) {
      alert("Phone numbers and template required");
      return;
    }

    const phoneList = phones.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
    if (!confirm(`Send to ${phoneList.length} phone numbers?`)) return;

    setSending(true);
    setResult(null);
    try {
      const params = parameters ? parameters.split(",").map(p => p.trim()) : [];
      const res = await api.post("/bulk-whatsapp/send", {
        phones: phoneList,
        templateKey: selectedTemplate,
        parameters: params,
        buttonUrl: buttonUrl || undefined
      });
      setResult(res.data);
    } catch (err) {
      alert(err?.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Bulk WhatsApp</h1>
          <AdminNav />
        </div>

        <div className="space-y-4">
          <div className="bg-white border rounded-2xl p-4">
            <p className="font-semibold mb-3">Opted-in Sellers: {stats.total}</p>
            <div className="flex flex-wrap gap-2">
              {stats.byCity.map((c) => (
                <span key={c._id} className="bg-gray-100 px-2 py-1 rounded text-sm">
                  {c._id}: {c.count}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setMode("city")}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  mode === "city" ? "bg-blue-600 text-white" : "bg-gray-100"
                }`}
              >
                By City
              </button>
              <button
                onClick={() => setMode("phones")}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  mode === "phones" ? "bg-blue-600 text-white" : "bg-gray-100"
                }`}
              >
                By Phones
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select template...</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.templateName} ({t.language})
                    </option>
                  ))}
                </select>
              </div>

              {mode === "city" ? (
<div>
                <label className="text-sm text-gray-600 block mb-1">City</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select city...</option>
                  {stats.byCity.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c._id} ({c.count})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600 block mb-1">Category (optional)</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">All categories</option>
                  {stats.byCategory.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c._id} ({c.count})
                    </option>
                  ))}
                </select>
              </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Phone Numbers</label>
                  <textarea
                    value={phones}
                    onChange={(e) => setPhones(e.target.value)}
                    placeholder="+91xxxxxxxxxx&#10;+91xxxxxxxxxx"
                    rows={4}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  <p className="text-xs text-gray-500">One per line or comma separated</p>
                </div>
              )}

              <div>
                <label className="text-sm text-gray-600 block mb-1">Parameters (comma separated)</label>
                <input
                  type="text"
                  value={parameters}
                  onChange={(e) => setParameters(e.target.value)}
                  placeholder="param1, param2, param3"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 block mb-1">Button URL (optional)</label>
                <input
                  type="text"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <button
                onClick={mode === "city" ? sendByCity : sendToPhones}
                disabled={sending}
                className="w-full btn-primary py-3 rounded-lg disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Bulk WhatsApp"}
              </button>
            </div>
          </div>

          {result && (
            <div className="bg-white border rounded-2xl p-4">
              <p className="font-semibold mb-2">Result</p>
              <p className="text-green-600">Sent: {result.sent?.length || 0}</p>
              <p className="text-red-600">Failed: {result.failed?.length || 0}</p>
              {result.failed?.length > 0 && (
                <div className="mt-2 text-sm text-gray-500">
                  {result.failed.map((f, i) => (
                    <div key={i}>{f.phone}: {f.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}