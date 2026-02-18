import { useCallback, useEffect, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

export default function AdminWhatsApp() {
  const [options, setOptions] = useState({
    cities: [],
    categories: [],
    whatsAppCampaign: {
      enabled: false,
      cities: [],
      categories: []
    }
  });
  const [requirements, setRequirements] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [campaignRuns, setCampaignRuns] = useState([]);
  const [whatsAppSummary, setWhatsAppSummary] = useState({
    total: 0,
    cities: [],
    lastUpdatedAt: null,
    uploadFile: null
  });
  const [notificationFile, setNotificationFile] = useState(null);
  const [uploadingWhatsApp, setUploadingWhatsApp] = useState(false);
  const [downloadingWhatsAppFile, setDownloadingWhatsAppFile] = useState(false);
  const [unsubscribeMobile, setUnsubscribeMobile] = useState("");
  const [unsubscribeReason, setUnsubscribeReason] = useState("");
  const [dndBulk, setDndBulk] = useState("");
  const [testRequirementId, setTestRequirementId] = useState("");
  const [testMobile, setTestMobile] = useState("");
  const [manualRequirementId, setManualRequirementId] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualTemplateFields, setManualTemplateFields] = useState({
    product: true,
    makeBrand: true,
    typeModel: true,
    quantity: true,
    city: true,
    details: true,
    link: true
  });
  const [manualQueue, setManualQueue] = useState([]);
  const [manualMessagePreview, setManualMessagePreview] = useState("");

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const getRequirementDisplay = (req) =>
    `${req?.product || req?.productName || "Requirement"} | ${req?.city || "-"} | ${req?.category || "-"}`;

  const formatDateTime = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const buildManualMessage = useCallback(
    (requirement) => {
      if (!requirement?._id) return "";
      const lines = ["New buyer requirement posted on Hoko."];
      if (manualTemplateFields.product) {
        lines.push(`Post: ${requirement.product || requirement.productName || "-"}`);
      }
      if (manualTemplateFields.makeBrand) {
        lines.push(`Make/Brand: ${requirement.makeBrand || requirement.brand || "-"}`);
      }
      if (manualTemplateFields.typeModel) {
        lines.push(`Type Model: ${requirement.typeModel || requirement.type || "-"}`);
      }
      if (manualTemplateFields.quantity) {
        const quantity = requirement.quantity || "-";
        const unit = requirement.unit || "-";
        lines.push(`Quantity: ${quantity} ${unit}`.trim());
      }
      if (manualTemplateFields.city) {
        lines.push(`City: ${requirement.city || "-"}`);
      }
      if (manualTemplateFields.details) {
        lines.push(`Details: ${requirement.details || "-"}`);
      }
      if (manualTemplateFields.link) {
        const baseUrl = window.location.origin.replace(/\/+$/, "");
        const cityParam = encodeURIComponent(requirement.city || "");
        const reqIdParam = encodeURIComponent(requirement._id || "");
        lines.push(`Open: ${baseUrl}/seller/deeplink/${reqIdParam}?city=${cityParam}&postId=${reqIdParam}`);
      }
      return lines.join("\n");
    },
    [manualTemplateFields]
  );

  const loadData = useCallback(async () => {
    const [optionsRes, summaryRes, runsRes, contactsRes, requirementsRes] =
      await Promise.all([
        api.get("/admin/options"),
        api.get("/admin/whatsapp/contacts/summary"),
        api.get("/admin/whatsapp/campaign-runs"),
        api.get("/admin/whatsapp/contacts"),
        api.get("/admin/requirements")
      ]);
    const data = optionsRes.data || {};
    setOptions((prev) => ({
      ...prev,
      ...data,
      whatsAppCampaign: {
        ...prev.whatsAppCampaign,
        ...(data.whatsAppCampaign || {})
      }
    }));
    setWhatsAppSummary(summaryRes.data || {});
    setCampaignRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
    setContacts(Array.isArray(contactsRes.data) ? contactsRes.data : []);
    setRequirements(Array.isArray(requirementsRes.data) ? requirementsRes.data : []);
  }, []);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const toggleWhatsAppCity = (city) => {
    setOptions((prev) => {
      const current = prev.whatsAppCampaign?.cities || [];
      const next = current.includes(city)
        ? current.filter((c) => c !== city)
        : [...current, city];
      return {
        ...prev,
        whatsAppCampaign: {
          ...prev.whatsAppCampaign,
          cities: next
        }
      };
    });
  };

  const toggleWhatsAppCategory = (cat) => {
    setOptions((prev) => {
      const current = prev.whatsAppCampaign?.categories || [];
      const next = current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat];
      return {
        ...prev,
        whatsAppCampaign: {
          ...prev.whatsAppCampaign,
          categories: next
        }
      };
    });
  };

  const saveWhatsAppSettings = async () => {
    await api.put("/admin/options", options);
    alert("WhatsApp settings saved");
    await loadData();
  };

  const handleNotificationFile = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setNotificationFile(null);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      alert("Please upload an Excel file (.xls or .xlsx)");
      event.target.value = "";
      setNotificationFile(null);
      return;
    }
    setNotificationFile(file);
  };

  const uploadWhatsAppContacts = async () => {
    if (!notificationFile) return;
    const formData = new FormData();
    formData.append("file", notificationFile);
    formData.append("mode", "replace");
    try {
      setUploadingWhatsApp(true);
      const res = await api.post("/admin/whatsapp/contacts/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      const stats = res.data || {};
      alert(
        `Upload complete. Parsed: ${stats.parsed || 0}, Inserted: ${stats.inserted || 0}, Updated: ${stats.updated || 0}, Failed: ${stats.failed || 0}`
      );
      setNotificationFile(null);
      await loadData();
    } catch (err) {
      const serverData = err?.response?.data;
      const serverMessage =
        typeof serverData === "string"
          ? serverData
          : serverData?.message;
      const fallback = err?.response?.status
        ? `Failed to upload WhatsApp contacts (HTTP ${err.response.status})`
        : "Failed to upload WhatsApp contacts";
      alert(serverMessage || err?.message || fallback);
    } finally {
      setUploadingWhatsApp(false);
    }
  };

  const downloadWhatsAppUploadedFile = async () => {
    try {
      setDownloadingWhatsAppFile(true);
      const res = await api.get("/admin/whatsapp/contacts/uploaded-file", {
        responseType: "blob"
      });
      const disposition = String(res.headers?.["content-disposition"] || "");
      const match = disposition.match(/filename=\"([^\"]+)\"/i);
      const fileName = match?.[1] || "whatsapp-contacts.xlsx";
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      let message = "Failed to download uploaded file";
      const raw = err?.response?.data;
      if (raw instanceof Blob) {
        try {
          const text = await raw.text();
          const parsed = JSON.parse(text);
          if (parsed?.message) message = parsed.message;
        } catch {}
      } else if (raw?.message) {
        message = raw.message;
      }
      alert(message);
    } finally {
      setDownloadingWhatsAppFile(false);
    }
  };

  const updateContactCompliance = async (contactId, patch) => {
    try {
      await api.patch(`/admin/whatsapp/contacts/${contactId}/compliance`, patch);
      await loadData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update contact compliance");
    }
  };

  const submitUnsubscribe = async () => {
    if (!unsubscribeMobile.trim()) {
      alert("Enter mobile in E.164 format, e.g. +919999999999");
      return;
    }
    try {
      await api.post("/admin/whatsapp/unsubscribe", {
        mobileE164: unsubscribeMobile,
        reason: unsubscribeReason
      });
      alert("Contact unsubscribed");
      setUnsubscribeMobile("");
      setUnsubscribeReason("");
      await loadData();
    } catch (err) {
      alert(err?.response?.data?.message || "Unsubscribe failed");
    }
  };

  const importDndList = async () => {
    const numbers = dndBulk
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!numbers.length) {
      alert("Add at least one number");
      return;
    }
    try {
      const res = await api.post("/admin/whatsapp/dnd/import", {
        numbers,
        source: "admin_bulk"
      });
      alert(`DND import updated ${res.data?.updated || 0} contacts`);
      setDndBulk("");
      await loadData();
    } catch (err) {
      alert(err?.response?.data?.message || "DND import failed");
    }
  };

  const sendCampaignTest = async (dryRun) => {
    if (!testRequirementId.trim() || !testMobile.trim()) {
      alert("Requirement ID and mobile are required");
      return;
    }
    try {
      const res = await api.post("/admin/whatsapp/test-send", {
        requirementId: testRequirementId.trim(),
        mobileE164: testMobile.trim(),
        dryRun
      });
      alert(dryRun ? "Dry run created" : res.data?.ok ? "Test message sent" : "Test message failed");
      await loadData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to run test send");
    }
  };

  const toggleManualTemplateField = (field) => {
    setManualTemplateFields((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const createManualQueue = () => {
    if (!manualRequirementId) {
      alert("Select a requirement");
      return;
    }
    if (!manualCity) {
      alert("Select city");
      return;
    }
    if (!manualCategory) {
      alert("Please select category");
      return;
    }
    const requirement = requirements.find((req) => String(req._id) === String(manualRequirementId));
    if (!requirement) {
      alert("Selected requirement not found");
      return;
    }
    if (normalizeText(requirement.city) !== normalizeText(manualCity)) {
      alert("Selected city does not match this post");
      return;
    }
    if (normalizeText(requirement.category) !== normalizeText(manualCategory)) {
      alert("Selected category does not match this post");
      return;
    }

    const message = buildManualMessage(requirement);
    const queue = contacts
      .filter((contact) => normalizeText(contact.city) === normalizeText(manualCity))
      .filter((contact) => contact.active !== false)
      .filter((contact) => contact.optInStatus === "opted_in")
      .filter((contact) => !contact.unsubscribedAt)
      .filter((contact) => contact.dndStatus !== "dnd")
      .map((contact) => ({
        id: contact._id,
        firmName: contact.firmName || "-",
        city: contact.city || "-",
        mobileE164: contact.mobileE164,
        status: "pending",
        whatsappLink: `https://wa.me/${String(contact.mobileE164 || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`
      }));

    setManualMessagePreview(message);
    setManualQueue(queue);
    if (!queue.length) {
      alert("No eligible contacts found for selected city/category");
      return;
    }
    alert(`Manual queue created with ${queue.length} pending contacts`);
  };

  const openManualWhatsApp = (entry) => {
    if (!entry?.whatsappLink) return;
    window.open(entry.whatsappLink, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Admin WhatsApp</h1>
          <AdminNav />
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-bold mb-3">WhatsApp Broadcast Contacts</h2>
            <div className="bg-white border rounded-2xl p-3 space-y-4">
              <div>
                <label className="text-sm text-gray-600">Excel File</label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleNotificationFile}
                  className="mt-2 block w-full text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Columns required in order: A Firm Name, B City, C Country Code, D Mobile Number.
                </p>
              </div>
              <div className="text-xs text-gray-600">
                <p>
                  Active WhatsApp contacts: <span className="font-semibold">{whatsAppSummary.total || 0}</span>
                </p>
                <p className="mt-1">
                  Opted-in: {whatsAppSummary?.compliance?.optedIn || 0} | Unsubscribed: {whatsAppSummary?.compliance?.unsubscribed || 0} | DND: {whatsAppSummary?.compliance?.dnd || 0}
                </p>
              </div>
              <button
                onClick={uploadWhatsAppContacts}
                className="btn-primary w-auto px-3 py-2 text-sm rounded-lg"
                disabled={!notificationFile || uploadingWhatsApp}
              >
                {uploadingWhatsApp ? "Uploading..." : "Upload Excel Contacts"}
              </button>
              <div className="text-xs text-gray-600 space-y-1">
                <p>
                  Last updated on:{" "}
                  <span className="font-medium">
                    {formatDateTime(whatsAppSummary?.lastUpdatedAt || whatsAppSummary?.uploadFile?.uploadedAt)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={downloadWhatsAppUploadedFile}
                  disabled={!whatsAppSummary?.uploadFile || downloadingWhatsAppFile}
                  className="underline text-blue-700 disabled:text-gray-400 disabled:no-underline"
                >
                  {downloadingWhatsAppFile ? "Downloading..." : "Download last uploaded file"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">WhatsApp Auto Campaign</h2>
            <div className="bg-white border rounded-2xl p-3 space-y-3">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={options.whatsAppCampaign?.enabled ?? false}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      whatsAppCampaign: {
                        ...prev.whatsAppCampaign,
                        enabled: e.target.checked
                      }
                    }))
                  }
                />
                Enabled
              </label>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Cities</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto pr-1">
                  {(options.cities || []).map((city) => (
                    <label key={`wa-${city}`} className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2">
                      <input
                        type="checkbox"
                        checked={(options.whatsAppCampaign?.cities || []).includes(city)}
                        onChange={() => toggleWhatsAppCity(city)}
                      />
                      {city}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Categories</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto pr-1">
                  {(options.categories || []).map((cat) => (
                    <label key={`wa-cat-${cat}`} className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2">
                      <input
                        type="checkbox"
                        checked={(options.whatsAppCampaign?.categories || []).includes(cat)}
                        onChange={() => toggleWhatsAppCategory(cat)}
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>

              <button onClick={saveWhatsAppSettings} className="btn-primary w-auto px-3 py-2 text-sm rounded-lg">
                Save WhatsApp Settings
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">WhatsApp Compliance Controls</h2>
            <div className="bg-white border rounded-2xl p-3 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Unsubscribe mobile (e.g. +919876543210)" value={unsubscribeMobile} onChange={(e) => setUnsubscribeMobile(e.target.value)} />
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Unsubscribe reason" value={unsubscribeReason} onChange={(e) => setUnsubscribeReason(e.target.value)} />
              </div>
              <button onClick={submitUnsubscribe} className="px-3 py-2 rounded-lg text-sm font-semibold border border-red-300 text-red-700">
                Mark Unsubscribed
              </button>
              <div>
                <label className="text-sm text-gray-600">Bulk DND Import (one mobile per line)</label>
                <textarea className="w-full border rounded-lg p-2 mt-2 text-sm" rows={3} value={dndBulk} onChange={(e) => setDndBulk(e.target.value)} />
                <button onClick={importDndList} className="mt-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300">
                  Import DND List
                </button>
              </div>
              <div>
                <p className="text-sm font-semibold mb-2">Recent Contacts (Top 20)</p>
                <div className="space-y-2 max-h-80 overflow-auto">
                  {contacts.slice(0, 20).map((contact) => (
                    <div key={contact._id} className="border rounded-lg p-2 text-xs text-gray-700">
                      <div className="font-semibold">{contact.firmName || "-"} | {contact.mobileE164}</div>
                      <div className="text-gray-500">{contact.city} | Opt-in: {contact.optInStatus} | DND: {contact.dndStatus} | Unsubscribed: {contact.unsubscribedAt ? "Yes" : "No"}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <button onClick={() => updateContactCompliance(contact._id, { optInStatus: contact.optInStatus === "opted_in" ? "not_opted_in" : "opted_in", optInSource: "admin_toggle" })} className="px-2 py-1 rounded border border-gray-300">Toggle Opt-in</button>
                        <button onClick={() => updateContactCompliance(contact._id, { dndStatus: contact.dndStatus === "dnd" ? "allow" : "dnd", dndSource: "admin_toggle" })} className="px-2 py-1 rounded border border-gray-300">Toggle DND</button>
                        <button onClick={() => updateContactCompliance(contact._id, { unsubscribed: !contact.unsubscribedAt, unsubscribeReason: "Admin toggle" })} className="px-2 py-1 rounded border border-red-300 text-red-700">Toggle Unsubscribe</button>
                      </div>
                    </div>
                  ))}
                  {contacts.length === 0 && <p className="text-xs text-gray-500">No contacts uploaded yet.</p>}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Campaign Operations</h2>
            <div className="bg-white border rounded-2xl p-3 space-y-4">
              <div className="border rounded-xl p-3 space-y-3">
                <p className="text-sm font-semibold">Manual WhatsApp Queue (Device App Send)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={manualRequirementId} onChange={(e) => {
                    const nextRequirementId = e.target.value;
                    setManualRequirementId(nextRequirementId);
                    const req = requirements.find((item) => String(item._id) === String(nextRequirementId));
                    if (req) {
                      setManualCity(req.city || "");
                      setManualCategory(req.category || "");
                      setManualMessagePreview(buildManualMessage(req));
                    }
                  }}>
                    <option value="">Select Post (Requirement)</option>
                    {requirements.slice(0, 200).map((req) => (
                      <option key={req._id} value={req._id}>{getRequirementDisplay(req)}</option>
                    ))}
                  </select>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={manualCity} onChange={(e) => setManualCity(e.target.value)}>
                    <option value="">Select City</option>
                    {(options.cities || []).map((city) => (<option key={`manual-city-${city}`} value={city}>{city}</option>))}
                  </select>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
                    <option value="">Select Category</option>
                    {(options.categories || []).map((category) => (<option key={`manual-category-${category}`} value={category}>{category}</option>))}
                  </select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    ["product", "Post"],
                    ["makeBrand", "Make/Brand"],
                    ["typeModel", "Type Model"],
                    ["quantity", "Quantity"],
                    ["city", "City"],
                    ["details", "Details"],
                    ["link", "Seller Dashboard Link"]
                  ].map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2">
                      <input type="checkbox" checked={Boolean(manualTemplateFields[field])} onChange={() => toggleManualTemplateField(field)} />
                      {label}
                    </label>
                  ))}
                </div>
                <button onClick={createManualQueue} className="px-3 py-2 rounded-lg text-sm font-semibold btn-primary">
                  Create Pending Queue
                </button>
                <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded-lg p-3 text-gray-700">
                  {manualMessagePreview || "Select post, city, and category to preview message"}
                </pre>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {manualQueue.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-2 text-xs text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <div className="font-semibold">{entry.firmName} | {entry.mobileE164}</div>
                        <div className="text-gray-500">{entry.city} | Status: {entry.status}</div>
                      </div>
                      <button onClick={() => openManualWhatsApp(entry)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-300 text-green-700">
                        Send via WhatsApp
                      </button>
                    </div>
                  ))}
                  {manualQueue.length === 0 && <p className="text-xs text-gray-500">No pending queue created yet.</p>}
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">API Campaign Test</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Requirement ID for test send" value={testRequirementId} onChange={(e) => setTestRequirementId(e.target.value)} />
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Target mobile (E.164)" value={testMobile} onChange={(e) => setTestMobile(e.target.value)} />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => sendCampaignTest(true)} className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300">Dry Run</button>
                  <button onClick={() => sendCampaignTest(false)} className="px-3 py-2 rounded-lg text-sm font-semibold btn-primary">Test Send</button>
                </div>
                <div className="mt-3 space-y-2 max-h-80 overflow-auto">
                  {campaignRuns.slice(0, 25).map((run) => (
                    <div key={run._id} className="border rounded-lg p-2 text-xs text-gray-700">
                      <div className="font-semibold">{run.triggerType} | {run.status}</div>
                      <div>Attempted: {run.attempted} | Sent: {run.sent} | Failed: {run.failed} | Skipped: {run.skipped}</div>
                      <div className="text-gray-500">{new Date(run.createdAt).toLocaleString()} | {run.city} | {run.category}</div>
                    </div>
                  ))}
                  {campaignRuns.length === 0 && <p className="text-xs text-gray-500">No campaign runs yet.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
