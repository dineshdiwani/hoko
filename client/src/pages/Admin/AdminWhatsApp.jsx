import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [postStatuses, setPostStatuses] = useState([]);
  const [pendingPosts, setPendingPosts] = useState([]);
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
  const [manualCategory, setManualCategory] = useState("");
  const [manualSelectedCities, setManualSelectedCities] = useState([]);
  const [manualUseAllCities, setManualUseAllCities] = useState(true);
  const [manualCityMenuOpen, setManualCityMenuOpen] = useState(false);
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
  const [resendingPost, setResendingPost] = useState(false);
  const [manualChannels, setManualChannels] = useState({
    whatsapp: true,
    email: false
  });

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const getPostStatusDisplay = (item) =>
    `${item?.product || "Requirement"} | ${item?.city || "-"} | ${item?.category || "-"}`;

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
      const lines = [];
      if (manualTemplateFields.product) {
        lines.push(`Post: *${requirement.product || requirement.productName || "-"}*`);
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
        lines.push(`Go to link to submit your offer: ${baseUrl}/seller/deeplink/${reqIdParam}?city=${cityParam}&postId=${reqIdParam}`);
      }
      return lines.join("\n");
    },
    [manualTemplateFields]
  );

  const availableManualCities = useMemo(() => {
    const fromContacts = contacts
      .map((contact) => String(contact?.city || "").trim())
      .filter(Boolean);
    const fromRequirements = requirements
      .map((req) => String(req?.city || "").trim())
      .filter(Boolean);
    const fromOptions = Array.isArray(options.cities)
      ? options.cities.map((city) => String(city || "").trim()).filter(Boolean)
      : [];
    return Array.from(
      new Set([...fromContacts, ...fromRequirements, ...fromOptions])
    ).sort((a, b) => a.localeCompare(b));
  }, [contacts, requirements, options.cities]);

  const availableManualCategories = useMemo(() => {
    const fromContacts = contacts.flatMap((contact) =>
      Array.isArray(contact?.categories)
        ? contact.categories.map((category) => String(category || "").trim()).filter(Boolean)
        : []
    );
    const fromRequirements = requirements
      .map((req) => String(req?.category || "").trim())
      .filter(Boolean);
    const fromOptions = Array.isArray(options.categories)
      ? options.categories.map((category) => String(category || "").trim()).filter(Boolean)
      : [];
    return Array.from(
      new Set([...fromContacts, ...fromRequirements, ...fromOptions])
    ).sort((a, b) => a.localeCompare(b));
  }, [contacts, requirements, options.categories]);

  useEffect(() => {
    if (!manualUseAllCities) return;
    setManualSelectedCities(availableManualCities);
  }, [availableManualCities, manualUseAllCities]);

  const manualCitySelectionLabel = useMemo(() => {
    if (manualUseAllCities) return "All cities";
    if (!manualSelectedCities.length) return "Select cities";
    if (manualSelectedCities.length === 1) return manualSelectedCities[0];
    return `${manualSelectedCities.length} cities selected`;
  }, [manualUseAllCities, manualSelectedCities]);

  const manualCategoryOptions = useMemo(() => {
    const selected = String(manualCategory || "").trim();
    const selectedExists = availableManualCategories.some(
      (item) => normalizeText(item) === normalizeText(selected)
    );
    if (!selected || selectedExists) {
      return availableManualCategories;
    }
    return [selected, ...availableManualCategories];
  }, [availableManualCategories, manualCategory]);

  const loadData = useCallback(async () => {
    const settled = await Promise.allSettled([
      api.get("/admin/options"),
      api.get("/admin/whatsapp/contacts/summary"),
      api.get("/admin/whatsapp/campaign-runs"),
      api.get("/admin/whatsapp/contacts"),
      api.get("/admin/requirements"),
      api.get("/admin/whatsapp/post-statuses")
    ]);

    const [
      optionsResult,
      summaryResult,
      runsResult,
      contactsResult,
      requirementsResult,
      postStatusesResult
    ] = settled;

    const optionsData =
      optionsResult.status === "fulfilled" ? optionsResult.value?.data || {} : {};
    setOptions((prev) => ({
      ...prev,
      ...optionsData,
      whatsAppCampaign: {
        ...prev.whatsAppCampaign,
        ...(optionsData.whatsAppCampaign || {})
      }
    }));

    setWhatsAppSummary(
      summaryResult.status === "fulfilled" ? summaryResult.value?.data || {} : {
        total: 0,
        cities: [],
        lastUpdatedAt: null,
        uploadFile: null
      }
    );
    setCampaignRuns(
      runsResult.status === "fulfilled" && Array.isArray(runsResult.value?.data)
        ? runsResult.value.data
        : []
    );
    setContacts(
      contactsResult.status === "fulfilled" && Array.isArray(contactsResult.value?.data)
        ? contactsResult.value.data
        : []
    );
    setRequirements(
      requirementsResult.status === "fulfilled" && Array.isArray(requirementsResult.value?.data)
        ? requirementsResult.value.data
        : []
    );
    const statusPayload =
      postStatusesResult.status === "fulfilled" ? postStatusesResult.value?.data || {} : {};
    setPostStatuses(Array.isArray(statusPayload.posts) ? statusPayload.posts : []);
    setPendingPosts(Array.isArray(statusPayload.pendingPosts) ? statusPayload.pendingPosts : []);
  }, []);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

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

  const toggleManualCity = (city) => {
    setManualSelectedCities((prev) => {
      const source = manualUseAllCities ? availableManualCities : prev;
      const next = source.includes(city)
        ? source.filter((item) => item !== city)
        : [...source, city];
      return Array.from(new Set(next));
    });
    setManualUseAllCities(false);
  };

  const createManualQueue = () => {
    if (!manualRequirementId) {
      alert("Select a requirement");
      return;
    }
    if (!manualCategory) {
      alert("Please select category");
      return;
    }
    if (!manualUseAllCities && !manualSelectedCities.length) {
      alert("Select at least one city or enable all cities");
      return;
    }
    const requirement = requirements.find((req) => String(req._id) === String(manualRequirementId));
    if (!requirement) {
      alert("Selected requirement not found");
      return;
    }

    const message = buildManualMessage(requirement);
    const selectedCityKeys = manualUseAllCities
      ? []
      : manualSelectedCities.map((city) => normalizeText(city)).filter(Boolean);
    const selectedCategoryKey = normalizeText(manualCategory);

    const queue = contacts
      .filter((contact) =>
        manualUseAllCities ? true : selectedCityKeys.includes(normalizeText(contact.city))
      )
      .filter((contact) => {
        const contactCategories = Array.isArray(contact?.categoriesNormalized) && contact.categoriesNormalized.length
          ? contact.categoriesNormalized.map((item) => normalizeText(item))
          : (Array.isArray(contact?.categories) ? contact.categories.map((item) => normalizeText(item)) : []);
        return contactCategories.includes(selectedCategoryKey);
      })
      .filter((contact) => contact.active !== false)
      .filter((contact) => contact.optInStatus === "opted_in")
      .filter((contact) => !contact.unsubscribedAt)
      .filter((contact) => contact.dndStatus !== "dnd")
      .map((contact) => ({
        id: contact._id,
        firmName: contact.firmName || "-",
        city: contact.city || "-",
        mobileE164: contact.mobileE164,
        email: contact.email || "",
        status: "pending",
        whatsappLink: `https://wa.me/${String(contact.mobileE164 || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`,
        emailLink: contact.email
          ? `mailto:${encodeURIComponent(String(contact.email || "").trim())}?subject=${encodeURIComponent("New requirement opportunity")}&body=${encodeURIComponent(message)}`
          : ""
      }));

    setManualMessagePreview(message);
    setManualQueue(queue);
    if (!queue.length) {
      alert("No eligible contacts found for selected category/cities");
      return;
    }
    alert(`Manual queue created with ${queue.length} pending contacts`);
  };

  const openManualWhatsApp = (entry) => {
    if (!entry?.whatsappLink) return;
    window.open(entry.whatsappLink, "_blank", "noopener,noreferrer");
  };

  const selectedPostStatus = useMemo(
    () =>
      postStatuses.find(
        (item) => String(item?.requirementId || "") === String(manualRequirementId || "")
      ) || null,
    [postStatuses, manualRequirementId]
  );

  const resendSelectedPost = async () => {
    if (!manualRequirementId) {
      alert("Select a pending post first");
      return;
    }
    if (!manualChannels.whatsapp && !manualChannels.email) {
      alert("Select at least one channel: WhatsApp and/or Email");
      return;
    }
    try {
      setResendingPost(true);
      const res = await api.post("/admin/whatsapp/resend", {
        requirementId: manualRequirementId,
        channels: manualChannels
      });
      const stats = res.data || {};
      alert(
        `Resend complete. Attempted: ${stats.attempted || 0}, Sent: ${stats.sent || 0}, Failed: ${stats.failed || 0}, Skipped: ${stats.skipped || 0}`
      );
      await loadData();
      setManualQueue([]);
    } catch (err) {
      alert(err?.response?.data?.message || err?.response?.data?.reason || "Failed to resend post");
    } finally {
      setResendingPost(false);
    }
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
                  Columns required in order: A Firm Name, B City, C Country ISD Code, D Mobile Number, E Categories (use ; between multiple categories), F Email.
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
                      <div className="text-gray-500">
                        {contact.city} | {contact.email || "-"} | Categories: {(contact.categories || []).join(", ") || "-"} | Opt-in: {contact.optInStatus} | DND: {contact.dndStatus} | Unsubscribed: {contact.unsubscribedAt ? "Yes" : "No"}
                      </div>
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
                <p className="text-xs text-gray-500">
                  First dropdown shows only pending posts (not yet sent successfully to sellers).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={manualRequirementId} onChange={(e) => {
                    const nextRequirementId = e.target.value;
                    setManualRequirementId(nextRequirementId);
                    const req = requirements.find((item) => String(item._id) === String(nextRequirementId));
                    if (req) {
                      const reqCategory = String(req.category || "").trim();
                      const reqCity = String(req.city || "").trim();
                      const matchingCategory = availableManualCategories.find(
                        (item) => normalizeText(item) === normalizeText(reqCategory)
                      );
                      const matchingCity = availableManualCities.find(
                        (city) => normalizeText(city) === normalizeText(reqCity)
                      );
                      setManualCategory(matchingCategory || reqCategory);
                      if (reqCity) {
                        setManualUseAllCities(false);
                        setManualSelectedCities([matchingCity || reqCity]);
                      }
                      setManualCityMenuOpen(false);
                      setManualMessagePreview(buildManualMessage(req));
                    }
                  }}>
                    <option value="">Select Pending Post (Requirement)</option>
                    {pendingPosts.slice(0, 300).map((item) => (
                      <option key={item.requirementId} value={item.requirementId}>
                        {getPostStatusDisplay(item)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                  >
                    <option value="">Select Category</option>
                    {manualCategoryOptions.map((category) => (
                      <option key={`manual-category-${category}`} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <button
                      type="button"
                      className="w-full border rounded-lg px-3 py-2 text-sm text-left bg-white"
                      onClick={() => setManualCityMenuOpen((prev) => !prev)}
                    >
                      {manualCitySelectionLabel}
                    </button>
                    {manualCityMenuOpen && (
                      <div className="absolute z-20 mt-2 w-full max-h-60 overflow-auto rounded-xl border bg-white p-2 shadow-lg">
                        <label className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2 mb-2">
                          <input
                            type="checkbox"
                            checked={manualUseAllCities}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setManualUseAllCities(checked);
                              setManualSelectedCities(checked ? availableManualCities : []);
                            }}
                          />
                          All cities (default)
                        </label>
                        {availableManualCities.map((city) => (
                          <label key={`manual-city-${city}`} className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2 mb-1">
                            <input
                              type="checkbox"
                              checked={manualUseAllCities ? true : manualSelectedCities.includes(city)}
                              onChange={() => toggleManualCity(city)}
                            />
                            {city}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {selectedPostStatus && (
                  <div className="rounded-lg border p-2 text-xs text-gray-700">
                    <div>
                      Delivery state: <span className="font-semibold capitalize">{selectedPostStatus.deliveryState}</span>
                    </div>
                    <div>
                      Total runs: {selectedPostStatus.totalRuns || 0} | Total sent: {selectedPostStatus.totalSent || 0} | Total failed: {selectedPostStatus.totalFailed || 0}
                    </div>
                    {selectedPostStatus.latestRun && (
                      <div className="text-gray-500">
                        Latest run: {selectedPostStatus.latestRun.triggerType} | {selectedPostStatus.latestRun.status} | {new Date(selectedPostStatus.latestRun.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
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
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Trigger Channels</p>
                  <p className="text-xs text-gray-500 mb-2">
                    These channels are used when you click "Resend to Sellers (API)".
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2">
                      <input
                        type="checkbox"
                        checked={manualChannels.whatsapp}
                        onChange={(e) =>
                          setManualChannels((prev) => ({
                            ...prev,
                            whatsapp: e.target.checked
                          }))
                        }
                      />
                      Trigger WhatsApp
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700 border rounded-lg px-3 py-2">
                      <input
                        type="checkbox"
                        checked={manualChannels.email}
                        onChange={(e) =>
                          setManualChannels((prev) => ({
                            ...prev,
                            email: e.target.checked
                          }))
                        }
                      />
                      Trigger Email
                    </label>
                  </div>
                </div>
                <button onClick={createManualQueue} className="px-3 py-2 rounded-lg text-sm font-semibold btn-primary">
                  Create Pending Queue
                </button>
                <button
                  onClick={resendSelectedPost}
                  disabled={!manualRequirementId || resendingPost}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-amber-300 text-amber-700 disabled:opacity-60"
                >
                  {resendingPost ? "Resending..." : "Resend to Sellers (API)"}
                </button>
                <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded-lg p-3 text-gray-700">
                  {manualMessagePreview || "Select post to preview message"}
                </pre>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {manualQueue.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-2 text-xs text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <div className="font-semibold">{entry.firmName} | {entry.mobileE164}</div>
                        <div className="text-gray-500">{entry.city} | {entry.email || "-"} | Status: {entry.status}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openManualWhatsApp(entry)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-300 text-green-700">
                          Send via WhatsApp
                        </button>
                        <button
                          onClick={() => entry.emailLink && window.open(entry.emailLink, "_blank", "noopener,noreferrer")}
                          disabled={!entry.emailLink}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 text-blue-700 disabled:opacity-50"
                        >
                          Send via Email
                        </button>
                      </div>
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
