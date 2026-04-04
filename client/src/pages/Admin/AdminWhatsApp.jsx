import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";
import { getPublicAppUrl } from "../../utils/runtime";

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
  const [approvedTemplates, setApprovedTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
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
  const [manualQueue, setManualQueue] = useState([]);
  const [manualMessagePreview, setManualMessagePreview] = useState("");
  const [resendingPost, setResendingPost] = useState(false);
  const [manualChannels, setManualChannels] = useState({
    whatsapp: true,
    email: false
  });
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [deliveryLogSummary, setDeliveryLogSummary] = useState({
    total: 0,
    accepted: 0,
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
    opened_manual_link: 0,
    dry_run: 0
  });
  const [deliveryLogPage, setDeliveryLogPage] = useState(1);
  const [deliveryLogPages, setDeliveryLogPages] = useState(1);
  const [deliveryLogFilters, setDeliveryLogFilters] = useState({
    requirementId: "",
    triggerType: "",
    status: "",
    mobileE164: "",
    channel: ""
  });
  const [loadingDeliveryLogs, setLoadingDeliveryLogs] = useState(false);
  const [templateContactSearch, setTemplateContactSearch] = useState("");
  const [selectedTemplateContactIds, setSelectedTemplateContactIds] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateVariables, setTemplateVariables] = useState([]);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const fileInputRef = useRef(null);

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const uniqueByNormalized = (values) => {
    const seen = new Set();
    const out = [];
    for (const value of values) {
      const label = String(value || "").trim();
      const key = normalizeText(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  };
  const getPostStatusDisplay = (item) =>
    `${item?.product || "Requirement"} | ${item?.city || "-"} | ${item?.category || "-"} | ID: ${String(
      item?.requirementId || item?._id || "-"
    )}`;
  const firstNonEmpty = (values) => {
    for (const value of values) {
      if (String(value || "").trim()) return String(value).trim();
    }
    return "";
  };
  const toSentence = (value, fallback = "") => {
    const text = String(value || "").trim();
    if (!text) return fallback;
    return text.replace(/\s+/g, " ");
  };
  const buildMakeModel = (requirement) => {
    const make = firstNonEmpty([requirement?.makeBrand, requirement?.brand]);
    const model = firstNonEmpty([requirement?.typeModel, requirement?.type]);
    if (make && model) return `${make} ${model}`;
    return make || model || "-";
  };

  const buildManualMessage = useCallback(
    (requirement) => {
      if (!requirement?._id) return "";
      const product = toSentence(
        firstNonEmpty([requirement?.product, requirement?.productName, "Buyer requirement"]),
        "Buyer requirement"
      );
      const quantity = toSentence(firstNonEmpty([requirement?.quantity]), "-");
      const unit = toSentence(firstNonEmpty([requirement?.unit, requirement?.type]), "");
      const quantityWithUnit = `${quantity}${unit ? ` ${unit}` : ""}`.trim();
      const makeModel = toSentence(buildMakeModel(requirement), "-");
      const city = toSentence(firstNonEmpty([requirement?.city, "your city"]), "your city");
      const baseUrl = getPublicAppUrl();
      const reqIdRaw = String(requirement._id || "").trim();
      const reqIdParam = encodeURIComponent(reqIdRaw);
      const deepLink = `${baseUrl}/seller/deeplink/${reqIdParam}`;

      return [
        "*URGENT BUYER REQUIREMENT*",
        "",
        `Looking for: *${product}*`,
        `Quantity: *${quantityWithUnit}*`,
        `Make/Model: *${makeModel}*`,
        `Buyer City: *${city}*`,
        "",
        "Suppliers, please share:",
        "- Best Price",
        "- Delivery Timeline",
        "- Availability Status",
        "",
        "*Send your best offer now:*",
        deepLink,
      ].join("\n");
    },
    []
  );

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
  const maskMobile = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 6) return raw;
    return `${raw.slice(0, 3)}******${raw.slice(-3)}`;
  };
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
    return uniqueByNormalized([...fromContacts, ...fromRequirements, ...fromOptions])
      .sort((a, b) => a.localeCompare(b));
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
    return uniqueByNormalized([...fromContacts, ...fromRequirements, ...fromOptions])
      .sort((a, b) => a.localeCompare(b));
  }, [contacts, requirements, options.categories]);

  useEffect(() => {
    if (!manualUseAllCities) return;
    setManualSelectedCities(availableManualCities);
  }, [availableManualCities, manualUseAllCities]);

  useEffect(() => {
    const validIds = new Set(eligibleTemplateContacts.map((contact) => String(contact._id)));
    setSelectedTemplateContactIds((prev) => prev.filter((id) => validIds.has(String(id))));
  }, [eligibleTemplateContacts]);

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

  const eligibleTemplateContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.active !== false &&
          contact.optInStatus === "opted_in" &&
          !contact.unsubscribedAt &&
          contact.dndStatus !== "dnd"
      ),
    [contacts]
  );

  const filteredTemplateContacts = useMemo(() => {
    const query = normalizeText(templateContactSearch);
    if (!query) return eligibleTemplateContacts.slice(0, 100);
    return eligibleTemplateContacts
      .filter((contact) =>
        [
          contact?.firmName,
          contact?.mobileE164,
          contact?.city,
          Array.isArray(contact?.categories) ? contact.categories.join(" ") : ""
        ]
          .map((value) => normalizeText(value))
          .some((value) => value.includes(query))
      )
      .slice(0, 100);
  }, [eligibleTemplateContacts, templateContactSearch]);

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((item) => String(item.id) === String(selectedTemplateKey)) || null,
    [approvedTemplates, selectedTemplateKey]
  );

  useEffect(() => {
    const variableCount = Number(selectedTemplate?.bodyVariableCount || 0);
    setTemplateVariables((prev) => Array.from({ length: variableCount }, (_, index) => prev[index] || ""));
  }, [selectedTemplate]);

  const loadData = useCallback(async () => {
    const settled = await Promise.allSettled([
      api.get("/admin/options"),
      api.get("/admin/whatsapp/contacts/summary"),
      api.get("/admin/whatsapp/campaign-runs"),
      api.get("/admin/whatsapp/contacts"),
      api.get("/admin/requirements"),
      api.get("/admin/whatsapp/post-statuses"),
      api.get("/admin/whatsapp/templates")
    ]);

    const [
      optionsResult,
      summaryResult,
      runsResult,
      contactsResult,
      requirementsResult,
      postStatusesResult,
      templatesResult
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
    setApprovedTemplates(
      templatesResult.status === "fulfilled" && Array.isArray(templatesResult.value?.data?.items)
        ? templatesResult.value.data.items
        : []
    );
  }, []);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const loadTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const res = await api.get("/admin/whatsapp/templates");
      setApprovedTemplates(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      setApprovedTemplates([]);
      alert(err?.response?.data?.message || "Failed to load approved templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadDeliveryLogs = useCallback(async () => {
    try {
      setLoadingDeliveryLogs(true);
      const params = new URLSearchParams();
      params.set("page", String(deliveryLogPage));
      params.set("limit", "50");
      if (deliveryLogFilters.requirementId) params.set("requirementId", deliveryLogFilters.requirementId);
      if (deliveryLogFilters.triggerType) params.set("triggerType", deliveryLogFilters.triggerType);
      if (deliveryLogFilters.status) params.set("status", deliveryLogFilters.status);
      if (deliveryLogFilters.mobileE164) params.set("mobileE164", deliveryLogFilters.mobileE164);
      if (deliveryLogFilters.channel) params.set("channel", deliveryLogFilters.channel);
      const res = await api.get(`/admin/whatsapp/delivery-logs?${params.toString()}`);
      const payload = res.data || {};
      setDeliveryLogs(Array.isArray(payload.items) ? payload.items : []);
      setDeliveryLogSummary(payload.summary || {
        total: 0,
        accepted: 0,
        queued: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        skipped: 0,
        opened_manual_link: 0,
        dry_run: 0
      });
      setDeliveryLogPages(Math.max(Number(payload.pages || 1), 1));
    } catch {
      setDeliveryLogs([]);
      setDeliveryLogSummary({
        total: 0,
        accepted: 0,
        queued: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        skipped: 0,
        opened_manual_link: 0,
        dry_run: 0
      });
      setDeliveryLogPages(1);
    } finally {
      setLoadingDeliveryLogs(false);
    }
  }, [deliveryLogFilters, deliveryLogPage]);

  useEffect(() => {
    loadDeliveryLogs().catch(() => {});
  }, [loadDeliveryLogs]);

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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
      await loadDeliveryLogs();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to run test send");
    }
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
    setManualQueue([]);
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
    const getContactCategories = (contact) =>
      Array.isArray(contact?.categoriesNormalized) && contact.categoriesNormalized.length
        ? contact.categoriesNormalized
            .flatMap((item) => String(item || "").split(/[;,|/]+/))
            .map((item) => normalizeText(item))
            .filter(Boolean)
        : (Array.isArray(contact?.categories)
            ? contact.categories
                .flatMap((item) => String(item || "").split(/[;,|/]+/))
                .map((item) => normalizeText(item))
                .filter(Boolean)
            : []);
    const cityFilteredContacts = contacts.filter((contact) =>
      manualUseAllCities ? true : selectedCityKeys.includes(normalizeText(contact.city))
    );
    const categoryFilteredContacts = cityFilteredContacts.filter((contact) => {
      const categories = getContactCategories(contact);
      return categories.some(
        (category) =>
          category === selectedCategoryKey ||
          category.includes(selectedCategoryKey) ||
          selectedCategoryKey.includes(category)
      );
    });

    const queue = categoryFilteredContacts
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
      alert(
        `No eligible contacts found. City matches: ${cityFilteredContacts.length}, Category matches: ${categoryFilteredContacts.length}. Check selected city/category and opt-in/DND status.`
      );
      return;
    }
    alert(`Manual queue created with ${queue.length} pending contacts`);
  };

  const openManualWhatsApp = async (entry) => {
    if (!entry?.id || !manualRequirementId) {
      alert("Select a requirement and create pending queue first");
      return;
    }

    setManualQueue((prev) =>
      prev.map((row) =>
        row.id === entry.id ? { ...row, status: "sending" } : row
      )
    );

    try {
      const response = await api.post("/admin/whatsapp/resend", {
        requirementId: manualRequirementId,
        channels: { whatsapp: true, email: false },
        contactFilters: {
          contactIds: [String(entry.id)]
        }
      });
      const sent = Number(response?.data?.sent || 0);
      const failed = Number(response?.data?.failed || 0);
      const nextStatus = sent > 0 && failed === 0 ? "sent" : "failed";

      setManualQueue((prev) =>
        prev.map((row) =>
          row.id === entry.id ? { ...row, status: nextStatus } : row
        )
      );
      await loadData();
      await loadDeliveryLogs();
      if (nextStatus === "failed") {
        alert("API send failed for this contact. Check Delivery Logs reason.");
      }
    } catch (err) {
      setManualQueue((prev) =>
        prev.map((row) =>
          row.id === entry.id ? { ...row, status: "failed" } : row
        )
      );
      alert(err?.response?.data?.message || err?.response?.data?.reason || "Failed to send via WhatsApp API");
    }
  };

  const toggleTemplateContact = (contactId) => {
    setSelectedTemplateContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((item) => item !== contactId) : [...prev, contactId]
    );
  };

  const selectVisibleTemplateContacts = () => {
    const visibleIds = filteredTemplateContacts.map((contact) => String(contact._id));
    setSelectedTemplateContactIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const clearTemplateContactSelection = () => {
    setSelectedTemplateContactIds([]);
  };

  const sendSelectedTemplate = async () => {
    if (!selectedTemplate) {
      alert("Select an approved template");
      return;
    }
    if (!selectedTemplateContactIds.length) {
      alert("Select at least one contact");
      return;
    }

    try {
      setSendingTemplate(true);
      const res = await api.post("/admin/whatsapp/template-send", {
        contactIds: selectedTemplateContactIds,
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.languageCode,
        parameters: templateVariables.map((value) => String(value || "").trim())
      });
      const payload = res.data || {};
      alert(
        `Template send complete. Attempted: ${payload.attempted || 0}, Sent: ${payload.sent || 0}, Failed: ${payload.failed || 0}, Skipped: ${payload.skipped || 0}`
      );
      await loadDeliveryLogs();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to send template message");
    } finally {
      setSendingTemplate(false);
    }
  };

  const selectedPostStatus = useMemo(
    () =>
      postStatuses.find(
        (item) => String(item?.requirementId || "") === String(manualRequirementId || "")
      ) || null,
    [postStatuses, manualRequirementId]
  );

  const triggeredPostSummaries = useMemo(
    () =>
      postStatuses
        .map((item) => ({
          requirementId: String(item?.requirementId || "").trim(),
          product: item?.product || "Requirement",
          city: item?.city || "",
          category: item?.category || "",
          deliveryState: item?.deliveryState || "pending",
          totalRuns: Number(item?.totalRuns || 0),
          totalSent: Number(item?.totalSent || 0),
          totalFailed: Number(item?.totalFailed || 0),
          totalAttempted: Number(item?.totalAttempted || 0),
          latestRunAt: item?.latestRun?.createdAt || null
        }))
        .filter((item) => item.requirementId && item.totalRuns > 0)
        .sort((a, b) => new Date(b.latestRunAt || 0) - new Date(a.latestRunAt || 0)),
    [postStatuses]
  );

  const selectTriggeredPostForRetrigger = (summary) => {
    const requirementId = String(summary?.requirementId || "").trim();
    if (!requirementId) return;
    setManualRequirementId(requirementId);
    setManualCategory("");
    setManualQueue([]);
    setManualCityMenuOpen(false);
    setDeliveryLogPage(1);
    setDeliveryLogFilters((prev) => ({
      ...prev,
      requirementId
    }));
  };

  const hasManualRequirement = Boolean(String(manualRequirementId || "").trim());
  const hasManualCategory = Boolean(String(manualCategory || "").trim());
  const hasManualCitySelection = manualUseAllCities || manualSelectedCities.length > 0;
  const hasManualChannelSelection = manualChannels.whatsapp || manualChannels.email;
  const canCreateManualQueue = hasManualRequirement && hasManualCategory && hasManualCitySelection;
  const canResendSelectedPost =
    canCreateManualQueue &&
    hasManualChannelSelection &&
    manualQueue.length > 0 &&
    !resendingPost;

  const resendSelectedPost = async () => {
    if (!canCreateManualQueue) {
      alert("Select pending post, category, and city filters first");
      return;
    }
    if (!hasManualChannelSelection) {
      alert("Select at least one channel: WhatsApp and/or Email");
      return;
    }
    if (!manualQueue.length) {
      alert("Create pending queue first so API send uses the same filtered contacts");
      return;
    }
    try {
      setResendingPost(true);
      const selectedCityKeys = manualUseAllCities
        ? []
        : manualSelectedCities.map((city) => normalizeText(city)).filter(Boolean);
      const selectedCategoryKey = normalizeText(manualCategory);
      const res = await api.post("/admin/whatsapp/resend", {
        requirementId: manualRequirementId,
        channels: manualChannels,
        contactFilters: {
          cityKeys: selectedCityKeys,
          categoryKeys: selectedCategoryKey ? [selectedCategoryKey] : [],
          contactIds: manualQueue.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
        }
      });
      const stats = res.data || {};
      alert(
        `Resend complete. Attempted: ${stats.attempted || 0}, Sent: ${stats.sent || 0}, Failed: ${stats.failed || 0}, Skipped: ${stats.skipped || 0}`
      );
      await loadData();
      await loadDeliveryLogs();
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
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleNotificationFile}
                  className="mt-2 block w-full text-sm"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Selected file: {notificationFile?.name || "None"}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Last uploaded file: {whatsAppSummary?.uploadFile?.originalName || "None"}
                </p>
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
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Approved Template Send (WAPI BSP)</p>
                    <p className="text-xs text-gray-500">
                      Load approved templates from WAPI, select contacts here, and trigger the template directly.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadTemplates}
                    disabled={loadingTemplates}
                    className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
                  >
                    {loadingTemplates ? "Refreshing..." : "Refresh Templates"}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={selectedTemplateKey}
                    onChange={(e) => setSelectedTemplateKey(e.target.value)}
                  >
                    <option value="">Select approved template</option>
                    {approvedTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {`${template.name} | ${template.languageCode}${template.category ? ` | ${template.category}` : ""}`}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Search contacts by firm, mobile, city, category"
                    value={templateContactSearch}
                    onChange={(e) => setTemplateContactSearch(e.target.value)}
                  />
                </div>
                {selectedTemplate && (
                  <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
                    <div>
                      Selected template: <span className="font-semibold">{selectedTemplate.name}</span> | Language: {selectedTemplate.languageCode} | Variables: {selectedTemplate.bodyVariableCount || 0}
                    </div>
                    {!!templateVariables.length && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                        {templateVariables.map((value, index) => (
                          <input
                            key={`template-variable-${index + 1}`}
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            placeholder={`Variable ${index + 1}`}
                            value={value}
                            onChange={(e) =>
                              setTemplateVariables((prev) =>
                                prev.map((item, itemIndex) => (itemIndex === index ? e.target.value : item))
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectVisibleTemplateContacts}
                    className="px-3 py-1.5 rounded border border-gray-300"
                  >
                    Select Visible Contacts
                  </button>
                  <button
                    type="button"
                    onClick={clearTemplateContactSelection}
                    className="px-3 py-1.5 rounded border border-gray-300"
                  >
                    Clear Selection
                  </button>
                  <div className="px-3 py-1.5 rounded border bg-gray-50">
                    Selected: <span className="font-semibold">{selectedTemplateContactIds.length}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded border bg-gray-50">
                    Eligible contacts: <span className="font-semibold">{eligibleTemplateContacts.length}</span>
                  </div>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto border rounded-lg p-2">
                  {filteredTemplateContacts.map((contact) => {
                    const contactId = String(contact._id);
                    const checked = selectedTemplateContactIds.includes(contactId);
                    return (
                      <label key={`template-contact-${contactId}`} className="flex items-start gap-2 border rounded-lg p-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTemplateContact(contactId)}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-semibold">{contact.firmName || "-"} | {contact.mobileE164}</div>
                          <div className="text-gray-500">
                            {contact.city} | {contact.email || "-"} | Categories: {(contact.categories || []).join(", ") || "-"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {filteredTemplateContacts.length === 0 && (
                    <p className="text-xs text-gray-500">No eligible contacts match the current search.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={sendSelectedTemplate}
                  disabled={!selectedTemplate || !selectedTemplateContactIds.length || sendingTemplate}
                  className="px-3 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-60"
                >
                  {sendingTemplate ? "Sending Template..." : "Send Template To Selected Contacts"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Campaign Operations</h2>
            <div className="bg-white border rounded-2xl p-3 space-y-4">
              <div className="border rounded-xl p-3 space-y-3">
                <p className="text-sm font-semibold">Manual WhatsApp Queue (Device App Send)</p>
                <p className="text-xs text-gray-500">
                  First dropdown shows all posts. You can re-trigger previously sent posts.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={manualRequirementId} onChange={(e) => {
                    const nextRequirementId = e.target.value;
                    setManualRequirementId(nextRequirementId);
                    setDeliveryLogPage(1);
                    setDeliveryLogFilters((prev) => ({
                      ...prev,
                      requirementId: nextRequirementId
                    }));
                    const req = requirements.find((item) => String(item._id) === String(nextRequirementId));
                    if (req) {
                      // Keep category explicit to avoid accidental broad sends.
                      setManualCategory("");
                      setManualCityMenuOpen(false);
                      setManualMessagePreview(buildManualMessage(req));
                      setManualQueue([]);
                    } else {
                      setManualCategory("");
                      setManualQueue([]);
                      setManualMessagePreview("");
                    }
                  }}>
                    <option value="">Select Post (Requirement)</option>
                    {postStatuses.slice(0, 500).map((item) => (
                      <option key={item.requirementId} value={item.requirementId}>
                        {`${getPostStatusDisplay(item)} | State: ${String(item?.deliveryState || "pending").toUpperCase()} | Runs: ${Number(item?.totalRuns || 0)}`}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={manualCategory}
                    onChange={(e) => {
                      setManualCategory(e.target.value);
                      setManualQueue([]);
                    }}
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
                              setManualQueue([]);
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
                <button
                  onClick={createManualQueue}
                  disabled={!canCreateManualQueue}
                  className="px-3 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-60"
                >
                  Create Pending Queue
                </button>
                <button
                  onClick={resendSelectedPost}
                  disabled={!canResendSelectedPost}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-amber-300 text-amber-700 disabled:opacity-60"
                >
                  {resendingPost ? "Sending..." : "Send Selected Post via API"}
                </button>
                <p className="text-xs text-gray-500">
                  Use this button for automatic sending through server logic to selected channels (WhatsApp/Email). It is different from the per-contact manual send buttons below.
                </p>
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
                        <button
                          onClick={() => openManualWhatsApp(entry)}
                          disabled={entry.status === "sending"}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-300 text-green-700 disabled:opacity-50"
                        >
                          {entry.status === "sending" ? "Sending..." : "Send via WhatsApp API"}
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
                <div className="border rounded-xl p-3 space-y-3">
                  <p className="text-sm font-semibold">Delivery Logs (Manual + API)</p>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={deliveryLogFilters.requirementId}
                      onChange={(e) => {
                        setDeliveryLogPage(1);
                        setDeliveryLogFilters((prev) => ({ ...prev, requirementId: e.target.value }));
                      }}
                    >
                      <option value="">All Requirements</option>
                      {requirements.slice(0, 500).map((item) => (
                        <option key={`delivery-requirement-${item._id}`} value={item._id}>
                          {getPostStatusDisplay({ requirementId: item._id, product: item.product || item.productName, city: item.city, category: item.category })}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={deliveryLogFilters.triggerType}
                      onChange={(e) => {
                        setDeliveryLogPage(1);
                        setDeliveryLogFilters((prev) => ({ ...prev, triggerType: e.target.value }));
                      }}
                    >
                      <option value="">All Triggers</option>
                      <option value="manual_queue">manual_queue</option>
                      <option value="manual_resend">manual_resend</option>
                      <option value="buyer_post">buyer_post</option>
                      <option value="manual_test">manual_test</option>
                      <option value="template_send">template_send</option>
                    </select>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={deliveryLogFilters.status}
                      onChange={(e) => {
                        setDeliveryLogPage(1);
                        setDeliveryLogFilters((prev) => ({ ...prev, status: e.target.value }));
                      }}
                    >
                      <option value="">All Statuses</option>
                      <option value="accepted">accepted</option>
                      <option value="queued">queued</option>
                      <option value="sent">sent</option>
                      <option value="delivered">delivered</option>
                      <option value="read">read</option>
                      <option value="failed">failed</option>
                      <option value="skipped">skipped</option>
                      <option value="opened_manual_link">opened_manual_link</option>
                      <option value="dry_run">dry_run</option>
                    </select>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={deliveryLogFilters.channel}
                      onChange={(e) => {
                        setDeliveryLogPage(1);
                        setDeliveryLogFilters((prev) => ({ ...prev, channel: e.target.value }));
                      }}
                    >
                      <option value="">All Channels</option>
                      <option value="whatsapp">whatsapp</option>
                      <option value="email">email</option>
                    </select>
                    <input
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="Search mobile (+91...)"
                      value={deliveryLogFilters.mobileE164}
                      onChange={(e) => {
                        setDeliveryLogPage(1);
                        setDeliveryLogFilters((prev) => ({ ...prev, mobileE164: e.target.value }));
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-9 gap-2 text-xs">
                    <div className="rounded-lg border px-2 py-1 bg-gray-50">Total: <span className="font-semibold">{deliveryLogSummary.total || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-cyan-50 text-cyan-700">Accepted: <span className="font-semibold">{deliveryLogSummary.accepted || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-sky-50 text-sky-700">Queued: <span className="font-semibold">{deliveryLogSummary.queued || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-green-50 text-green-700">Sent: <span className="font-semibold">{deliveryLogSummary.sent || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-emerald-50 text-emerald-700">Delivered: <span className="font-semibold">{deliveryLogSummary.delivered || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-teal-50 text-teal-700">Read: <span className="font-semibold">{deliveryLogSummary.read || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-red-50 text-red-700">Failed: <span className="font-semibold">{deliveryLogSummary.failed || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-amber-50 text-amber-700">Skipped: <span className="font-semibold">{deliveryLogSummary.skipped || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-blue-50 text-blue-700">Manual Opened: <span className="font-semibold">{deliveryLogSummary.opened_manual_link || 0}</span></div>
                    <div className="rounded-lg border px-2 py-1 bg-purple-50 text-purple-700">Dry Run: <span className="font-semibold">{deliveryLogSummary.dry_run || 0}</span></div>
                  </div>
                  <div
                    className="border rounded-lg p-2"
                    style={{
                      height: "160px",
                      overflowX: "hidden",
                      overflowY: "scroll",
                      scrollbarGutter: "stable both-edges"
                    }}
                  >
                    <div className="overflow-x-auto">
                      <table className="text-xs whitespace-nowrap" style={{ minWidth: "1200px" }}>
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="text-left px-2 py-2">Time</th>
                          <th className="text-left px-2 py-2">Requirement</th>
                          <th className="text-left px-2 py-2">Trigger</th>
                          <th className="text-left px-2 py-2">Channel</th>
                          <th className="text-left px-2 py-2">Contact</th>
                          <th className="text-left px-2 py-2">Result</th>
                          <th className="text-left px-2 py-2">Reason</th>
                          <th className="text-left px-2 py-2">Run</th>
                          <th className="text-left px-2 py-2">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryLogs.map((row) => {
                          const requirementLabel = [
                            row?.product || row?.requirementId?.product || row?.requirementId?.productName || "Requirement",
                            row?.city || row?.requirementId?.city || "-",
                            row?.category || row?.requirementId?.category || "-"
                          ].join(" | ");
                          return (
                            <tr key={row._id} className="border-t">
                              <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                              <td className="px-2 py-2">{requirementLabel}</td>
                              <td className="px-2 py-2">{row.triggerType}</td>
                              <td className="px-2 py-2">{row.channel}</td>
                              <td className="px-2 py-2 whitespace-nowrap" title={row.mobileE164 || row.email || "-"}>
                                {row.mobileE164 ? maskMobile(row.mobileE164) : row.email || "-"}
                              </td>
                              <td className="px-2 py-2">{row.status}</td>
                              <td className="px-2 py-2 max-w-xs truncate" title={row.reason || ""}>{row.reason || "-"}</td>
                              <td className="px-2 py-2">{row.campaignRunId || "-"}</td>
                              <td className="px-2 py-2">{row?.createdByAdminId?.email || "system"}</td>
                            </tr>
                          );
                        })}
                        {!loadingDeliveryLogs && deliveryLogs.length === 0 && (
                          <tr>
                            <td className="px-2 py-3 text-gray-500" colSpan={9}>No delivery logs found.</td>
                          </tr>
                        )}
                        {loadingDeliveryLogs && (
                          <tr>
                            <td className="px-2 py-3 text-gray-500" colSpan={9}>Loading delivery logs...</td>
                          </tr>
                        )}
                      </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-50"
                      disabled={deliveryLogPage <= 1}
                      onClick={() => setDeliveryLogPage((prev) => Math.max(prev - 1, 1))}
                    >
                      Previous
                    </button>
                    <span>Page {deliveryLogPage} / {deliveryLogPages}</span>
                    <button
                      className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-50"
                      disabled={deliveryLogPage >= deliveryLogPages}
                      onClick={() => setDeliveryLogPage((prev) => Math.min(prev + 1, deliveryLogPages))}
                    >
                      Next
                    </button>
                  </div>
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
                <div
                  className="mt-3 space-y-2 border rounded-lg p-2"
                  style={{
                    height: "160px",
                    overflowX: "hidden",
                    overflowY: "scroll",
                    scrollbarGutter: "stable both-edges"
                  }}
                >
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
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Triggered Posts Summary</p>
                <p className="text-xs text-gray-500 mb-2">
                  Done jobs history with run count, totals, and quick re-trigger action.
                </p>
                <div
                  className="border rounded-lg p-2"
                  style={{
                    height: "160px",
                    overflowX: "hidden",
                    overflowY: "scroll",
                    scrollbarGutter: "stable both-edges"
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="text-xs whitespace-nowrap" style={{ minWidth: "1200px" }}>
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="text-left px-2 py-2">Post</th>
                        <th className="text-left px-2 py-2">State</th>
                        <th className="text-left px-2 py-2">Runs</th>
                        <th className="text-left px-2 py-2">Attempted</th>
                        <th className="text-left px-2 py-2">Sent</th>
                        <th className="text-left px-2 py-2">Failed</th>
                        <th className="text-left px-2 py-2">Latest Trigger</th>
                        <th className="text-left px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {triggeredPostSummaries.map((row) => (
                        <tr key={`triggered-${row.requirementId}`} className="border-t">
                          <td className="px-2 py-2">
                            {`${row.product || "Requirement"} | ${row.city || "-"} | ${row.category || "-"}`}
                          </td>
                          <td className="px-2 py-2 capitalize">{row.deliveryState || "-"}</td>
                          <td className="px-2 py-2">{row.totalRuns}</td>
                          <td className="px-2 py-2">{row.totalAttempted}</td>
                          <td className="px-2 py-2">{row.totalSent}</td>
                          <td className="px-2 py-2">{row.totalFailed}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(row.latestRunAt)}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => selectTriggeredPostForRetrigger(row)}
                              className="px-2 py-1 rounded border border-amber-300 text-amber-700"
                            >
                              Re-trigger This Post
                            </button>
                          </td>
                        </tr>
                      ))}
                      {triggeredPostSummaries.length === 0 && (
                        <tr>
                          <td className="px-2 py-3 text-gray-500" colSpan={8}>
                            No triggered posts yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}







