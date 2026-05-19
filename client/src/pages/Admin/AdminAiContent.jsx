import { useEffect, useMemo, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

const emptyCategory = {
  name: "",
  description: "",
  targetAudience: "",
  tone: "professional",
  imageStyle: "",
  active: true,
  dailyGenerationLimit: 1
};

const defaultSettings = {
  fixedCta: "Learn More",
  ctaLink: "",
  aiProvider: "gemini",
  imageProvider: "modelslab",
  generationEnabled: false,
  approvalRequired: false,
  autoBufferEnabled: false,
  autoBufferChannelIds: [],
  autoBufferMode: "addToQueue",
  autoBufferDelayMinutes: 30,
  autoBufferPostType: "post",
  autoPlatformSettings: {
    facebook: {
      enabled: false,
      intervalMinutes: 1440,
      triggerTime: "09:00",
      triggerDay: 1,
      channelIds: [],
      mode: "addToQueue",
      delayMinutes: 30,
      postType: "post"
    },
    instagram: {
      enabled: false,
      intervalMinutes: 1440,
      triggerTime: "09:00",
      triggerDay: 1,
      channelIds: [],
      mode: "addToQueue",
      delayMinutes: 30,
      postType: "post"
    },
    linkedin: {
      enabled: false,
      intervalMinutes: 1440,
      triggerTime: "09:00",
      triggerDay: 1,
      channelIds: [],
      mode: "addToQueue",
      delayMinutes: 30,
      postType: "post"
    }
  },
  maxDraftsPerRun: 3,
  cronIntervalMinutes: 60,
  brandInstructions: "",
  blockedWords: []
};

const DRAFT_CACHE_KEY = "hoko_ai_content_drafts";
const DRAFT_SELECTION_KEY = "hoko_ai_content_selected_drafts";
const CAMPAIGN_FORM_KEY = "hoko_ai_content_campaign_form";
const CATEGORY_FORM_KEY = "hoko_ai_content_category_form";
const TRAINING_TEXT_KEY = "hoko_ai_content_training_text";
const BUFFER_FORM_KEY = "hoko_ai_content_buffer_form";
const DRAFT_HISTORY_LIMIT = 1000;
const PLATFORM_OPTIONS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" }
];
const FREQUENCY_OPTIONS = [
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Every 24 hours" },
  { value: 10080, label: "Weekly" }
];
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" }
];

function preview(value, limit = 140) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function composePostText(draft) {
  return [
    draft?.caption || draft?.hook || "",
    Array.isArray(draft?.hashtags) ? draft.hashtags.join(" ") : "",
    draft?.ctaLink || ""
  ].filter(Boolean).join("\n\n");
}

function mergeDrafts(currentDrafts, incomingDrafts) {
  const incoming = Array.isArray(incomingDrafts) ? incomingDrafts.filter((item) => item?._id) : [];
  if (!incoming.length) return currentDrafts;
  const seen = new Set(incoming.map((item) => item._id));
  return [
    ...incoming,
    ...currentDrafts.filter((item) => !seen.has(item._id))
  ];
}

function readStoredJson(key, fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function getStoredDrafts() {
  const drafts = readStoredJson(DRAFT_CACHE_KEY, []);
  return Array.isArray(drafts) ? drafts.filter((item) => item?._id) : [];
}

function getStoredSelection() {
  const ids = readStoredJson(DRAFT_SELECTION_KEY, []);
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function replaceDraft(drafts, updatedDraft) {
  if (!updatedDraft?._id) return drafts;
  return drafts.map((draft) => draft._id === updatedDraft._id ? updatedDraft : draft);
}

function mergeSettings(value = {}) {
  const platformSettings = PLATFORM_OPTIONS.reduce((result, platform) => {
    result[platform.id] = {
      ...defaultSettings.autoPlatformSettings[platform.id],
      ...(value?.autoPlatformSettings?.[platform.id] || {})
    };
    return result;
  }, {});
  return {
    ...defaultSettings,
    ...value,
    autoPlatformSettings: platformSettings
  };
}

function withTimeout(promise, ms = 20000, message = "Request timed out") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

export default function AdminAiContent() {
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState(null);
  const [dashboardCategories, setDashboardCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState(() => getStoredDrafts());
  const [logs, setLogs] = useState([]);
  const [trainingNotes, setTrainingNotes] = useState([]);
  const [campaignRuns, setCampaignRuns] = useState([]);
  const [trainingText, setTrainingText] = useState(() => {
    try {
      return window.localStorage.getItem(TRAINING_TEXT_KEY) || "";
    } catch {
      return "";
    }
  });
  const [campaignForm, setCampaignForm] = useState(() => ({
    mood: "",
    postCount: 3,
    categoryMode: "auto",
    selectedCategories: [],
    audienceMode: "auto",
    imageStyle: "auto",
    useAppScreenshots: true,
    fixedCta: "",
    ctaLink: "",
    ...readStoredJson(CAMPAIGN_FORM_KEY, {})
  }));
  const [categoryForm, setCategoryForm] = useState(() => ({
    ...emptyCategory,
    ...readStoredJson(CATEGORY_FORM_KEY, {})
  }));
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [autoPosting, setAutoPosting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(null);
  const [bufferChannels, setBufferChannels] = useState([]);
  const [bufferConfigured, setBufferConfigured] = useState(false);
  const [bufferForm, setBufferForm] = useState(() => ({
    channelId: "",
    channelIds: [],
    mode: "shareNow",
    postType: "post",
    dueAt: "",
    ...readStoredJson(BUFFER_FORM_KEY, {})
  }));
  const [selectedDraftIds, setSelectedDraftIds] = useState(() => getStoredSelection());
  const [publishingId, setPublishingId] = useState("");
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [editingPostId, setEditingPostId] = useState("");
  const [postTextByDraftId, setPostTextByDraftId] = useState({});

  const activeCount = useMemo(
    () => categories.filter((item) => item.active !== false).length,
    [categories]
  );

  async function loadAll() {
    try {
      setLoading(true);
      const [settingsRes, categoriesRes, draftsRes, postedDraftsRes, logsRes, trainingRes, runsRes] = await Promise.allSettled([
        withTimeout(api.get("/ai-content/settings"), 15000),
        withTimeout(api.get("/ai-content/categories"), 15000),
        withTimeout(api.get(`/ai-content/drafts?limit=${DRAFT_HISTORY_LIMIT}`), 30000),
        withTimeout(api.get(`/ai-content/drafts?hasBuffer=1&limit=${DRAFT_HISTORY_LIMIT}`), 30000),
        withTimeout(api.get("/ai-content/logs?limit=10"), 10000),
        withTimeout(api.get("/ai-content/training-notes?limit=20"), 10000),
        withTimeout(api.get("/ai-content/campaign-runs?limit=10"), 10000)
      ]);

      if (settingsRes.status === "fulfilled") setSettings(settingsRes.value.data?.settings ? mergeSettings(settingsRes.value.data.settings) : mergeSettings());
      if (categoriesRes.status === "fulfilled") setCategories(Array.isArray(categoriesRes.value.data?.items) ? categoriesRes.value.data.items : []);
      if (draftsRes.status === "fulfilled") {
        setDrafts((existing) => mergeDrafts(existing, Array.isArray(draftsRes.value.data?.items) ? draftsRes.value.data.items : []));
      }
      if (postedDraftsRes.status === "fulfilled") {
        setDrafts((existing) => mergeDrafts(existing, Array.isArray(postedDraftsRes.value.data?.items) ? postedDraftsRes.value.data.items : []));
      }
      if (logsRes.status === "fulfilled") setLogs(Array.isArray(logsRes.value.data?.items) ? logsRes.value.data.items : []);
      if (trainingRes.status === "fulfilled") setTrainingNotes(Array.isArray(trainingRes.value.data?.items) ? trainingRes.value.data.items : []);
      if (runsRes.status === "fulfilled") setCampaignRuns(Array.isArray(runsRes.value.data?.items) ? runsRes.value.data.items : []);
    } catch (err) {
      console.warn("Failed to load AI content data", err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDraftsOnly({ silent = false } = {}) {
    try {
      setDraftsLoading(true);
      const [draftsRes, postedDraftsRes] = await Promise.allSettled([
        withTimeout(api.get(`/ai-content/drafts?limit=${DRAFT_HISTORY_LIMIT}`), 30000, "Drafts are still loading. Please try again."),
        withTimeout(api.get(`/ai-content/drafts?hasBuffer=1&limit=${DRAFT_HISTORY_LIMIT}`), 30000, "Posted drafts are still loading. Please try again.")
      ]);
      if (draftsRes.status === "fulfilled") {
        setDrafts((existing) => mergeDrafts(existing, Array.isArray(draftsRes.value.data?.items) ? draftsRes.value.data.items : []));
      }
      if (postedDraftsRes.status === "fulfilled") {
        setDrafts((existing) => mergeDrafts(existing, Array.isArray(postedDraftsRes.value.data?.items) ? postedDraftsRes.value.data.items : []));
      }
      if (draftsRes.status === "rejected" && postedDraftsRes.status === "rejected") {
        throw draftsRes.reason || postedDraftsRes.reason;
      }
    } catch (err) {
      if (!silent) {
        alert(err?.response?.data?.message || err.message || "Failed to load generated drafts");
      }
    } finally {
      setDraftsLoading(false);
    }
  }

  async function refreshDraftsQuietly() {
    await loadDraftsOnly({ silent: true });
  }

  async function loadSettingsOnly({ silent = false } = {}) {
    try {
      const res = await withTimeout(api.get("/ai-content/settings"), 15000);
      setSettings(res.data?.settings ? mergeSettings(res.data.settings) : mergeSettings());
    } catch (err) {
      if (!silent) {
        alert(err?.response?.data?.message || err.message || "Failed to load automation settings");
      }
    }
  }

  async function loadTrainingNotesOnly({ silent = false } = {}) {
    try {
      const res = await withTimeout(api.get("/ai-content/training-notes?limit=20"), 15000);
      setTrainingNotes(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      if (!silent) {
        alert(err?.response?.data?.message || err.message || "Failed to load training notes");
      }
    }
  }

  async function loadBufferChannels() {
    try {
      const res = await api.get("/ai-content/buffer/channels");
      const channels = Array.isArray(res.data?.channels) ? res.data.channels : [];
      setBufferChannels(channels);
      setBufferConfigured(Boolean(res.data?.configured));
      const defaultChannelId = res.data?.defaultChannelId || channels[0]?.id || "";
      setBufferForm((current) => ({
        ...current,
        channelId: current.channelId || current.channelIds?.[0] || defaultChannelId,
        channelIds: Array.isArray(current.channelIds) && current.channelIds.length
          ? current.channelIds
          : (current.channelId ? [current.channelId] : defaultChannelId ? [defaultChannelId] : [])
      }));
    } catch (err) {
      setBufferConfigured(false);
      console.warn("Failed to load Buffer channels", err?.response?.data?.message || err.message);
    }
  }

  async function loadDashboardCategories() {
    try {
      const res = await api.get("/admin/options/categories");
      const values = Array.isArray(res.data?.values) ? res.data.values : [];
      setDashboardCategories(values.filter(Boolean));
      if (!categoryForm.name && values.length > 0) {
        setCategoryForm((current) => current.name ? current : { ...current, name: values[0] });
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to load dashboard categories");
    }
  }

  useEffect(() => {
    loadAll().catch(() => {});
    loadSettingsOnly({ silent: true }).catch(() => {});
    loadTrainingNotesOnly({ silent: true }).catch(() => {});
    loadDashboardCategories().catch(() => {});
    loadBufferChannels().catch(() => {});
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(drafts.slice(0, DRAFT_HISTORY_LIMIT)));
    } catch {}
  }, [drafts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_SELECTION_KEY, JSON.stringify(selectedDraftIds));
    } catch {}
  }, [selectedDraftIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAMPAIGN_FORM_KEY, JSON.stringify(campaignForm));
    } catch {}
  }, [campaignForm]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CATEGORY_FORM_KEY, JSON.stringify(categoryForm));
    } catch {}
  }, [categoryForm]);

  useEffect(() => {
    try {
      window.localStorage.setItem(BUFFER_FORM_KEY, JSON.stringify(bufferForm));
    } catch {}
  }, [bufferForm]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRAINING_TEXT_KEY, trainingText);
    } catch {}
  }, [trainingText]);

  async function saveSettings() {
    try {
      setSettingsSaving(true);
      setSettingsNotice(null);
      const autoPlatformSettings = PLATFORM_OPTIONS.reduce((result, platform) => {
        const current = settings?.autoPlatformSettings?.[platform.id] || {};
        result[platform.id] = {
          enabled: Boolean(current.enabled),
          intervalMinutes: FREQUENCY_OPTIONS.some((item) => item.value === Number(current.intervalMinutes))
            ? Number(current.intervalMinutes)
            : 1440,
          triggerTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(current.triggerTime || "")) ? current.triggerTime : "09:00",
          triggerDay: Math.max(0, Math.min(6, Number(current.triggerDay ?? 1))),
          channelIds: Array.isArray(current.channelIds) ? current.channelIds : [],
          mode: ["shareNow", "shareNext", "customScheduled", "addToQueue"].includes(current.mode) ? current.mode : "addToQueue",
          delayMinutes: Math.max(0, Math.min(10080, Number(current.delayMinutes ?? 30))),
          postType: ["post", "story", "reel"].includes(current.postType) ? current.postType : "post",
          lastRunAt: current.lastRunAt || null
        };
        return result;
      }, {});
      const payload = {
        ...defaultSettings,
        ...(settings || {}),
        autoPlatformSettings,
        aiProvider: ["gemini", "openai", "fallback"].includes(settings?.aiProvider) ? settings.aiProvider : "gemini",
        imageProvider: ["gemini", "modelslab", "none"].includes(settings?.imageProvider) ? settings.imageProvider : "modelslab",
        maxDraftsPerRun: Math.max(1, Math.min(20, Number(settings?.maxDraftsPerRun || 3))),
        cronIntervalMinutes: Math.max(5, Math.min(1440, Number(settings?.cronIntervalMinutes || 60))),
        autoBufferChannelIds: Array.isArray(settings?.autoBufferChannelIds) ? settings.autoBufferChannelIds : [],
        autoBufferMode: ["shareNow", "shareNext", "customScheduled", "addToQueue"].includes(settings?.autoBufferMode) ? settings.autoBufferMode : "addToQueue",
        autoBufferPostType: ["post", "story", "reel"].includes(settings?.autoBufferPostType) ? settings.autoBufferPostType : "post",
        autoBufferDelayMinutes: Math.max(0, Math.min(10080, Number(settings?.autoBufferDelayMinutes ?? 30))),
        blockedWords: Array.isArray(settings?.blockedWords)
          ? settings.blockedWords
          : String(settings?.blockedWords || "").split(",").map((item) => item.trim()).filter(Boolean)
      };
      const res = await api.put("/ai-content/settings", payload);
      setSettings(res.data?.settings ? { ...defaultSettings, ...res.data.settings } : defaultSettings);
      setSettingsNotice({ type: "success", message: "Automation settings saved successfully" });
      alert("Automation settings saved successfully");
    } catch (err) {
      const message = err?.response?.data?.message || err.message || "Failed to save settings";
      setSettingsNotice({ type: "error", message });
      alert(message);
    } finally {
      setSettingsSaving(false);
    }
  }

  function editCategory(category) {
    setEditingId(category._id);
    setCategoryForm({
      name: category.name || "",
      description: category.description || "",
      targetAudience: category.targetAudience || "",
      tone: category.tone || "professional",
      imageStyle: category.imageStyle || "",
      active: category.active !== false,
      dailyGenerationLimit: Number(category.dailyGenerationLimit || 1)
    });
  }

  function resetCategoryForm() {
    setEditingId("");
    setCategoryForm(emptyCategory);
    try {
      window.localStorage.removeItem(CATEGORY_FORM_KEY);
    } catch {}
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) {
      alert("Category name is required");
      return;
    }

    try {
      const wasEditing = Boolean(editingId);
      if (editingId) {
        await api.patch(`/ai-content/categories/${editingId}`, categoryForm);
      } else {
        await api.post("/ai-content/categories", categoryForm);
      }
      resetCategoryForm();
      await loadAll();
      alert(wasEditing ? "Category updated successfully" : "Category saved successfully");
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to save category");
    }
  }

  async function deleteCategory(categoryId) {
    if (!window.confirm("Delete this category? Existing generated drafts will remain.")) return;
    try {
      await api.delete(`/ai-content/categories/${categoryId}`);
      await loadAll();
      alert("Category deleted successfully");
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to delete category");
    }
  }

  async function runGeneration() {
    let timer = null;
    try {
      setGenerating(true);
      setGenerationProgress({
        percent: 15,
        title: "Starting generation",
        message: "Picking active categories..."
      });
      timer = window.setInterval(() => {
        setGenerationProgress((current) => {
          if (!current) return current;
          const nextPercent = Math.min(90, Number(current.percent || 0) + 10);
          return {
            ...current,
            percent: nextPercent,
            title: nextPercent < 45 ? "Choosing topics" : nextPercent < 75 ? "Generating hooks and images" : "Saving drafts",
            message: nextPercent < 75 ? "AI is preparing HOKO marketplace drafts..." : "Almost done..."
          };
        });
      }, 900);
      const res = await api.post("/ai-content/generate/run", { force: true });
      if (timer) window.clearInterval(timer);
      timer = null;
      const result = res.data?.result || {};
      setGenerationProgress({
        percent: 100,
        title: "Generation complete",
        message: `Generated drafts: ${result.createdDrafts || 0}`
      });
      await refreshDraftsQuietly();
      alert(`Generated drafts: ${result.createdDrafts || 0}`);
      window.setTimeout(() => setGenerationProgress(null), 1200);
    } catch (err) {
      if (timer) window.clearInterval(timer);
      setGenerationProgress({
        percent: 100,
        title: "Generation failed",
        message: err?.response?.data?.message || err.message || "Failed to generate drafts",
        failed: true
      });
      alert(err?.response?.data?.message || err.message || "Failed to generate drafts");
    } finally {
      setGenerating(false);
    }
  }

  async function runAutoPostCheck({ force = false } = {}) {
    try {
      setAutoPosting(true);
      const res = await api.post("/ai-content/auto-post/run", {
        limit: settings?.maxDraftsPerRun || 3,
        force
      });
      await loadAll();
      const autoBuffer = res.data?.result?.autoBuffer || {};
      alert(`${force ? "Forced auto-post run" : "Auto-post check"} completed: ${autoBuffer.sent || 0} sent. Reason: ${autoBuffer.reason || "checked"}`);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to run auto-post check");
    } finally {
      setAutoPosting(false);
    }
  }

  async function runCampaignGeneration() {
    if (!campaignForm.mood.trim()) {
      alert("Enter today's mood or campaign direction first");
      return;
    }

    try {
      setGenerating(true);
      setGenerationProgress({
        percent: 10,
        title: "Starting campaign run",
        message: "AI is planning categories, audiences, and draft angles..."
      });

      const fixedCta = campaignForm.fixedCta.trim() || settings?.fixedCta || "Learn More";
      const ctaLink = campaignForm.ctaLink.trim() || settings?.ctaLink || "";
      const res = await api.post("/ai-content/campaign-runs", {
        ...campaignForm,
        fixedCta,
        ctaLink
      });
      const result = res.data?.result || {};
      const runId = result.runId;
      if (!runId) {
        throw new Error("Campaign run did not return an id");
      }

      let completed = false;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const detailRes = await api.get(`/ai-content/campaign-runs/${runId}`);
        const run = detailRes.data?.run || null;
        const currentDrafts = Array.isArray(detailRes.data?.drafts) ? detailRes.data.drafts : [];
        if (currentDrafts.length) {
          setDrafts((existing) => mergeDrafts(existing, currentDrafts));
        }
        const progress = Math.max(10, Math.min(100, Number(run?.progress || 15)));
        setGenerationProgress({
          percent: progress,
          title: run?.status === "failed" ? "Campaign generation failed" : run?.status === "completed" ? "Campaign previews ready" : "Generating campaign previews",
          message: run?.status === "completed"
            ? `Created previews: ${currentDrafts.length || run?.draftIds?.length || 0}`
            : run?.status === "failed"
              ? run?.lastError || "Failed to create campaign previews"
              : `Created ${currentDrafts.length || run?.draftIds?.length || 0} of ${campaignForm.postCount} previews...`,
          failed: run?.status === "failed"
        });

        if (run?.status === "completed") {
          completed = true;
          if (currentDrafts.length) {
            setDrafts((existing) => mergeDrafts(existing, currentDrafts));
          }
          refreshDraftsQuietly();
          setGenerationProgress(null);
          alert(`Campaign previews ready: ${currentDrafts.length || run?.draftIds?.length || 0}`);
          break;
        }
        if (run?.status === "failed") {
          completed = true;
          if (currentDrafts.length) {
            setDrafts((existing) => mergeDrafts(existing, currentDrafts));
          }
          refreshDraftsQuietly();
          setGenerationProgress(null);
          break;
        }
      }

      if (!completed) {
        refreshDraftsQuietly();
        setGenerationProgress({
          percent: 95,
          title: "Still generating",
          message: "The campaign is still running in the background. Refresh in a moment to see new previews."
        });
        alert("Campaign is still generating in the background");
        window.setTimeout(() => setGenerationProgress(null), 3000);
      }
    } catch (err) {
      setGenerationProgress({
        percent: 100,
        title: "Campaign generation failed",
        message: err?.response?.data?.message || err.message || "Failed to create campaign previews",
        failed: true
      });
      alert(err?.response?.data?.message || err.message || "Failed to create campaign previews");
    } finally {
      setGenerating(false);
    }
  }

  function selectedBufferChannels() {
    const ids = Array.isArray(bufferForm.channelIds) && bufferForm.channelIds.length
      ? bufferForm.channelIds
      : bufferForm.channelId ? [bufferForm.channelId] : [];
    return ids
      .map((id) => bufferChannels.find((channel) => channel.id === id))
      .filter(Boolean);
  }

  function toggleBufferChannel(channelId) {
    setBufferForm((current) => {
      const currentIds = Array.isArray(current.channelIds) ? current.channelIds : current.channelId ? [current.channelId] : [];
      const nextIds = currentIds.includes(channelId)
        ? currentIds.filter((id) => id !== channelId)
        : [...currentIds, channelId];
      return {
        ...current,
        channelId: nextIds[0] || "",
        channelIds: nextIds
      };
    });
  }

  function updateAutoPlatform(platform, patch) {
    setSettings((current) => {
      const merged = mergeSettings(current || {});
      return {
        ...merged,
        autoPlatformSettings: {
          ...merged.autoPlatformSettings,
          [platform]: {
            ...merged.autoPlatformSettings[platform],
            ...patch
          }
        }
      };
    });
  }

  function toggleAutoPlatformChannel(platform, channelId) {
    const current = settings?.autoPlatformSettings?.[platform] || {};
    const ids = Array.isArray(current.channelIds) ? current.channelIds : [];
    updateAutoPlatform(platform, {
      channelIds: ids.includes(channelId)
        ? ids.filter((id) => id !== channelId)
        : [...ids, channelId]
    });
  }

  function toggleDraftSelection(draftId) {
    setSelectedDraftIds((current) => (
      current.includes(draftId)
        ? current.filter((id) => id !== draftId)
        : [...current, draftId]
    ));
  }

  async function sendDraftToBuffer(draft) {
    const channels = selectedBufferChannels();
    if (!channels.length) {
      alert("Select at least one Buffer channel first");
      return;
    }
    try {
      setPublishingId(draft._id);
      const results = [];
      for (const channel of channels) {
        const res = await api.post(`/ai-content/drafts/${draft._id}/buffer`, {
          channelId: channel.id,
          channelName: channel?.name || "",
          channelService: channel?.service || "",
          postType: bufferForm.postType,
          mode: bufferForm.mode,
          dueAt: bufferForm.mode === "customScheduled" ? bufferForm.dueAt : "",
          text: postTextByDraftId[draft._id] || composePostText(draft)
        });
        results.push({ channel, ok: true });
        if (res.data?.draft) {
          setDrafts((current) => replaceDraft(current, res.data.draft));
        }
      }
      await refreshDraftsQuietly();
      setSelectedDraftIds((current) => current.filter((id) => id !== draft._id));
      alert(`Draft sent to Buffer: ${results.length}`);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to send draft to Buffer");
      await refreshDraftsQuietly();
    } finally {
      setPublishingId("");
    }
  }

  async function sendSelectedToBuffer() {
    if (!selectedDraftIds.length) {
      alert("Select drafts first");
      return;
    }
    const channels = selectedBufferChannels();
    if (!channels.length) {
      alert("Select at least one Buffer channel first");
      return;
    }
    try {
      setBulkPublishing(true);
      const textByDraftId = {};
      for (const draftId of selectedDraftIds) {
        if (postTextByDraftId[draftId]) textByDraftId[draftId] = postTextByDraftId[draftId];
      }
      let successCount = 0;
      let failedCount = 0;
      const failedMessages = [];
      for (const channel of channels) {
        const res = await api.post("/ai-content/drafts/buffer/bulk", {
          draftIds: selectedDraftIds,
          channelId: channel.id,
          channelName: channel?.name || "",
          channelService: channel?.service || "",
          postType: bufferForm.postType,
          mode: bufferForm.mode,
          dueAt: bufferForm.mode === "customScheduled" ? bufferForm.dueAt : "",
          textByDraftId
        });
        successCount += Number(res.data?.successCount || 0);
        failedCount += Number(res.data?.failedCount || 0);
        if (Array.isArray(res.data?.results)) {
          failedMessages.push(...res.data.results.filter((item) => !item.success).map((item) => `${channel.name || channel.id}: ${item.message}`).filter(Boolean));
        }
      }
      alert(`Sent to Buffer: ${successCount}${failedCount ? `, failed: ${failedCount}${failedMessages.length ? `\n${failedMessages.join("\n")}` : ""}` : ""}`);
      setSelectedDraftIds([]);
      await refreshDraftsQuietly();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to send selected drafts");
      await refreshDraftsQuietly();
    } finally {
      setBulkPublishing(false);
    }
  }

  async function deleteDraft(draftId) {
    if (!window.confirm("Delete this generated draft?")) return;
    try {
      await api.delete(`/ai-content/drafts/${draftId}`);
      setDrafts((current) => current.filter((draft) => draft._id !== draftId));
      setSelectedDraftIds((current) => current.filter((id) => id !== draftId));
      await refreshDraftsQuietly();
      alert("Draft deleted successfully");
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to delete draft");
    }
  }

  async function saveTrainingNote() {
    if (!trainingText.trim()) {
      alert("Enter training text first");
      return;
    }
    try {
      await api.post("/ai-content/training-notes", { text: trainingText.trim() });
      setTrainingText("");
      try {
        window.localStorage.removeItem(TRAINING_TEXT_KEY);
      } catch {}
      await loadTrainingNotesOnly();
      alert("Training note saved successfully");
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to save training note");
    }
  }

  async function setTrainingNoteStatus(noteId, status) {
    try {
      await api.patch(`/ai-content/training-notes/${noteId}/status`, { status });
      await loadTrainingNotesOnly();
      alert(status === "active" ? "Training note activated successfully" : "Training note paused successfully");
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to update training note");
    }
  }

  async function deleteTrainingNote(noteId) {
    if (!window.confirm("Delete this training note?")) return;
    try {
      await api.delete(`/ai-content/training-notes/${noteId}`);
      setTrainingNotes((current) => current.filter((note) => note._id !== noteId));
      await loadTrainingNotesOnly({ silent: true });
      alert("Training note deleted successfully");
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to delete training note");
    }
  }

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h1 className="page-hero">AI Content</h1>
            <p className="text-sm text-gray-600">
              Select categories once; automation creates HOKO marketing topics, short hooks, CTA, and matching images.
            </p>
          </div>
          <AdminNav />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <section className="bg-white border rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Morning Campaign Run</h2>
                  <p className="text-xs text-gray-500">
                    Enter mood once. AI selects categories, audience, hook angle, image environment, and creates preview drafts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runCampaignGeneration}
                  disabled={generating}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
                >
                  {generating ? "Generating..." : "Generate Campaign Previews"}
                </button>
              </div>

              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-28 bg-white"
                value={campaignForm.mood}
                onChange={(e) => setCampaignForm({ ...campaignForm, mood: e.target.value })}
                placeholder="Example: Today focus on buyers saving money through lower seller offers and reverse auction. Make it sharp for Indian traders and contractors."
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Draft count
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={campaignForm.postCount}
                    onChange={(e) => setCampaignForm({ ...campaignForm, postCount: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Categories
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={campaignForm.categoryMode}
                    onChange={(e) => setCampaignForm({ ...campaignForm, categoryMode: e.target.value })}
                  >
                    <option value="auto">Auto select</option>
                    <option value="selected">Use selected</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Audience
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={campaignForm.audienceMode}
                    onChange={(e) => setCampaignForm({ ...campaignForm, audienceMode: e.target.value })}
                  >
                    <option value="auto">Auto</option>
                    <option value="buyers">Buyers</option>
                    <option value="sellers">Sellers</option>
                    <option value="both">Both</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Image direction
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={campaignForm.imageStyle}
                    onChange={(e) => setCampaignForm({ ...campaignForm, imageStyle: e.target.value })}
                    placeholder="auto, clean app ad, warehouse, shop counter..."
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  CTA text
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={campaignForm.fixedCta}
                    onChange={(e) => setCampaignForm({ ...campaignForm, fixedCta: e.target.value })}
                    placeholder={settings?.fixedCta || "Learn More"}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  CTA link
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={campaignForm.ctaLink}
                    onChange={(e) => setCampaignForm({ ...campaignForm, ctaLink: e.target.value })}
                    placeholder={settings?.ctaLink || "https://hokoapp.in"}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={campaignForm.useAppScreenshots}
                  onChange={(e) => setCampaignForm({ ...campaignForm, useAppScreenshots: e.target.checked })}
                />
                Allow app screenshot/mockup direction in image prompts
              </label>

              {campaignForm.categoryMode === "selected" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {dashboardCategories.map((category) => {
                    const checked = campaignForm.selectedCategories.includes(category);
                    return (
                      <label key={category} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...campaignForm.selectedCategories, category]
                              : campaignForm.selectedCategories.filter((item) => item !== category);
                            setCampaignForm({ ...campaignForm, selectedCategories: next });
                          }}
                        />
                        {category}
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {campaignRuns.length ? (
                <div className="rounded-xl border bg-gray-50 p-3 text-xs">
                  <p className="font-semibold mb-2">Recent campaign runs</p>
                  <div className="space-y-1">
                    {campaignRuns.slice(0, 4).map((run) => (
                      <div key={run._id} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate">{preview(run.mood, 80)}</span>
                          <span className="shrink-0 uppercase">{run.status} · {run.draftIds?.length || 0}</span>
                        </div>
                        {run.lastError ? (
                          <p className="text-red-600">{run.lastError}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="bg-white border rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Automation Settings</h2>
                  <p className="text-xs text-gray-500">
                    Cron reads these settings; the app remains usable if generation fails.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={settingsSaving || !settings}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
                >
                  {settingsSaving ? "Saving..." : "Save Settings"}
                </button>
              </div>
              {settingsNotice ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    settingsNotice.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {settingsNotice.message}
                </div>
              ) : null}

              {settings ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-gray-600">
                    Fixed CTA
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={settings.fixedCta || ""}
                      onChange={(e) => setSettings({ ...settings, fixedCta: e.target.value })}
                      placeholder="Learn More"
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    CTA link
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={settings.ctaLink || ""}
                      onChange={(e) => setSettings({ ...settings, ctaLink: e.target.value })}
                      placeholder="https://hokoapp.in"
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Post generation API
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={settings.aiProvider || "gemini"}
                      onChange={(e) => setSettings({ ...settings, aiProvider: e.target.value })}
                    >
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="fallback">Local fallback</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Image generation API
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={settings.imageProvider || "modelslab"}
                      onChange={(e) => setSettings({ ...settings, imageProvider: e.target.value })}
                    >
                      <option value="modelslab">ModelsLab</option>
                      <option value="gemini">Gemini</option>
                      <option value="none">No images</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Max drafts per run
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={settings.maxDraftsPerRun || 3}
                      onChange={(e) => setSettings({ ...settings, maxDraftsPerRun: Number(e.target.value) })}
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Cron interval minutes
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={settings.cronIntervalMinutes ?? 60}
                      onChange={(e) => setSettings({ ...settings, cronIntervalMinutes: Number(e.target.value) })}
                    />
                  </label>
                  <label className="md:col-span-2 text-xs font-medium text-gray-600">
                    Brand instructions
                    <textarea
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-20 bg-white"
                      value={settings.brandInstructions || ""}
                      onChange={(e) => setSettings({ ...settings, brandInstructions: e.target.value })}
                      placeholder="Example: Keep copy direct, practical, and focused on HOKO reverse auction value."
                    />
                  </label>
                  <label className="md:col-span-2 text-xs font-medium text-gray-600">
                    Blocked words
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={Array.isArray(settings.blockedWords) ? settings.blockedWords.join(", ") : settings.blockedWords || ""}
                      onChange={(e) => setSettings({
                        ...settings,
                        blockedWords: e.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                      })}
                      placeholder="Comma-separated words to avoid"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.generationEnabled)}
                      onChange={(e) => setSettings({ ...settings, generationEnabled: e.target.checked })}
                    />
                    Enable cron generation
                  </label>
                  <div className="md:col-span-2 rounded-xl border bg-gray-50 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Platform Auto Mode</p>
                        <p className="text-xs text-gray-500">Each platform can run on its own frequency and Buffer channels. AI target platforms still decide which drafts are eligible.</p>
                      </div>
                      <button
                        type="button"
                        onClick={loadBufferChannels}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      >
                        Load
                      </button>
                    </div>
                    {!bufferConfigured ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Buffer API key is not available to the server.
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3">
                      {PLATFORM_OPTIONS.map((platform) => {
                        const profile = settings.autoPlatformSettings?.[platform.id] || defaultSettings.autoPlatformSettings[platform.id];
                        const platformChannels = bufferChannels.filter((channel) => {
                          const service = String(channel.service || "").toLowerCase();
                          return platform.id === "facebook"
                            ? service === "facebook" || service.startsWith("facebook_")
                            : platform.id === "linkedin"
                              ? service === "linkedin" || service.startsWith("linkedin_")
                              : service === "instagram" || service.startsWith("instagram_");
                        });
                        return (
                          <div key={platform.id} className="rounded-xl border bg-white p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={Boolean(profile.enabled)}
                                  onChange={(e) => updateAutoPlatform(platform.id, { enabled: e.target.checked })}
                                />
                                {platform.label}
                              </label>
                              <span className="text-[11px] text-gray-500">
                                {profile.lastRunAt ? `Last: ${formatTime(profile.lastRunAt)}` : "Not run yet"}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                              <label className="text-xs font-medium text-gray-600">
                                Frequency
                                <select
                                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                                  value={profile.intervalMinutes ?? 1440}
                                  onChange={(e) => updateAutoPlatform(platform.id, { intervalMinutes: Number(e.target.value) })}
                                >
                                  {FREQUENCY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs font-medium text-gray-600">
                                {Number(profile.intervalMinutes) === 720 ? "First trigger" : "Trigger time"}
                                <input
                                  type="time"
                                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                                  value={profile.triggerTime || "09:00"}
                                  onChange={(e) => updateAutoPlatform(platform.id, { triggerTime: e.target.value })}
                                />
                              </label>
                              <label className="text-xs font-medium text-gray-600">
                                Weekly day
                                <select
                                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                                  value={profile.triggerDay ?? 1}
                                  disabled={Number(profile.intervalMinutes) !== 10080}
                                  onChange={(e) => updateAutoPlatform(platform.id, { triggerDay: Number(e.target.value) })}
                                >
                                  {WEEKDAY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs font-medium text-gray-600">
                                Publish mode
                                <select
                                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                                  value={profile.mode || "addToQueue"}
                                  onChange={(e) => updateAutoPlatform(platform.id, { mode: e.target.value })}
                                >
                                  <option value="addToQueue">Add to queue</option>
                                  <option value="shareNext">Share next</option>
                                  <option value="customScheduled">Schedule after delay</option>
                                  <option value="shareNow">Publish now</option>
                                </select>
                              </label>
                              <label className="text-xs font-medium text-gray-600">
                                Delay minutes
                                <input
                                  type="number"
                                  min="0"
                                  max="10080"
                                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                                  value={profile.delayMinutes ?? 30}
                                  onChange={(e) => updateAutoPlatform(platform.id, { delayMinutes: Number(e.target.value) })}
                                />
                              </label>
                              <label className="text-xs font-medium text-gray-600">
                                Post type
                                <select
                                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                                  value={profile.postType || "post"}
                                  onChange={(e) => updateAutoPlatform(platform.id, { postType: e.target.value })}
                                >
                                  <option value="post">Post</option>
                                  <option value="story">Story</option>
                                  <option value="reel">Reel</option>
                                </select>
                              </label>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[11px] text-gray-500">
                                {Number(profile.intervalMinutes) === 720
                                  ? "Runs at the first trigger time and again 12 hours later."
                                  : Number(profile.intervalMinutes) === 10080
                                    ? "Runs once per week on the selected day and time."
                                    : "Runs once per day at the selected time."}
                              </p>
                              <p className="text-xs font-medium text-gray-600">{platform.label} Buffer channels</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {platformChannels.map((channel) => {
                                  const checked = Array.isArray(profile.channelIds) && profile.channelIds.includes(channel.id);
                                  return (
                                    <label key={channel.id} className="flex items-center gap-2 rounded-lg border bg-gray-50 p-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleAutoPlatformChannel(platform.id, channel.id)}
                                      />
                                      <span>{channel.name || channel.service} <span className="text-gray-400">({channel.service})</span></span>
                                    </label>
                                  );
                                })}
                                {!platformChannels.length ? (
                                  <div className="rounded-lg border bg-gray-50 p-2 text-xs text-gray-500">
                                    No {platform.label} Buffer channels loaded.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">{loading ? "Loading..." : "No settings loaded."}</p>
              )}
            </section>

            <section className="bg-white border rounded-2xl p-4 space-y-4">
              <div>
                <h2 className="font-semibold">Model Training Notes</h2>
                <p className="text-xs text-gray-500">
                  Store hook guidance for future model tuning. These notes are not sent with each generated post.
                </p>
              </div>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-28 bg-white"
                value={trainingText}
                onChange={(e) => setTrainingText(e.target.value)}
                placeholder="Example: HOKO hooks should focus on buyers posting requirements, sellers competing with price offers, lower price selection, and reverse auction urgency."
              />
              <button
                type="button"
                onClick={saveTrainingNote}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white"
              >
                Save Training Note
              </button>
              <div className="space-y-2">
                {trainingNotes.map((note) => (
                  <div key={note._id} className="border rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold uppercase">{note.status}</span>
                      <span className="text-gray-500">{formatTime(note.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-gray-700">{note.text}</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setTrainingNoteStatus(note._id, "sent")} className="px-3 py-1.5 rounded border text-[11px] font-semibold">
                        Mark Sent
                      </button>
                      <button onClick={() => setTrainingNoteStatus(note._id, "archived")} className="px-3 py-1.5 rounded border text-[11px] font-semibold">
                        Archive
                      </button>
                      <button onClick={() => deleteTrainingNote(note._id)} className="px-3 py-1.5 rounded border text-[11px] font-semibold text-red-600">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!trainingNotes.length ? (
                  <div className="border rounded-xl p-3 text-sm text-gray-500">No training notes yet.</div>
                ) : null}
              </div>
            </section>

            <section className="bg-white border rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Categories</h2>
                  <p className="text-xs text-gray-500">
                    Active categories: {activeCount}. The worker chooses topics automatically from these category selections.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runGeneration}
                  disabled={generating || activeCount === 0}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
                >
                  {generating ? "Generating..." : "Generate Drafts Now"}
                </button>
              </div>

              <div className="border rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  >
                    <option value="" disabled>
                      Select dashboard category
                    </option>
                    {dashboardCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    {categoryForm.name && !dashboardCategories.includes(categoryForm.name) ? (
                      <option value={categoryForm.name}>{categoryForm.name}</option>
                    ) : null}
                  </select>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="Audience hint, optional"
                    value={categoryForm.targetAudience}
                    onChange={(e) => setCategoryForm({ ...categoryForm, targetAudience: e.target.value })}
                  />
                  <select
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    value={categoryForm.tone}
                    onChange={(e) => setCategoryForm({ ...categoryForm, tone: e.target.value })}
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="urgent">Urgent</option>
                    <option value="sales">Sales</option>
                    <option value="informative">Informative</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    value={categoryForm.dailyGenerationLimit}
                    onChange={(e) => setCategoryForm({ ...categoryForm, dailyGenerationLimit: Number(e.target.value) })}
                    placeholder="Daily limit"
                  />
                  <input
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="Image style, optional"
                    value={categoryForm.imageStyle}
                    onChange={(e) => setCategoryForm({ ...categoryForm, imageStyle: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={categoryForm.active}
                      onChange={(e) => setCategoryForm({ ...categoryForm, active: e.target.checked })}
                    />
                    Active
                  </label>
                  {dashboardCategories.length === 0 ? (
                    <p className="md:col-span-2 text-xs text-red-600">
                      No dashboard categories found. Add categories from Admin options first.
                    </p>
                  ) : null}
                  <textarea
                    className="md:col-span-2 border rounded-lg px-3 py-2 text-sm min-h-20 bg-white"
                    placeholder="Optional context for this category. The AI still chooses the topic automatically."
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveCategory}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white"
                  >
                    {editingId ? "Update Category" : "Add Category"}
                  </button>
                  <button
                    type="button"
                    onClick={resetCategoryForm}
                    className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category._id} className="border rounded-xl p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{category.name}</p>
                        <p className="text-xs text-gray-500">
                          {category.active === false ? "Inactive" : "Active"} | {category.tone} | daily {category.dailyGenerationLimit || 0}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">{preview(category.description, 180)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => editCategory(category)} className="px-3 py-1.5 rounded border text-xs font-semibold">
                          Edit
                        </button>
                        <button onClick={() => deleteCategory(category._id)} className="px-3 py-1.5 rounded border text-xs font-semibold text-red-600">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!categories.length ? (
                  <div className="border rounded-xl p-3 text-sm text-gray-500">No categories yet.</div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="bg-white border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Generated Drafts</h2>
                <button
                  onClick={loadDraftsOnly}
                  disabled={draftsLoading}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
                >
                  {draftsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div className="rounded-xl border bg-gray-50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Buffer Publishing</p>
                    <p className="text-[11px] text-gray-500">
                      Queue AI-created posts to connected Buffer social channels.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadBufferChannels}
                    className="rounded border px-3 py-1.5 text-[11px] font-semibold"
                  >
                    Channels
                  </button>
                </div>
                {!bufferConfigured ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    Buffer API key is not available to the server.
                  </p>
                ) : null}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-gray-600">Social channels</p>
                  <div className="grid grid-cols-1 gap-2">
                    {bufferChannels.map((channel) => {
                      const checked = Array.isArray(bufferForm.channelIds) && bufferForm.channelIds.includes(channel.id);
                      return (
                        <label key={channel.id} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBufferChannel(channel.id)}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {channel.name || channel.id} {channel.service ? `(${channel.service})` : ""}
                          </span>
                        </label>
                      );
                    })}
                    {!bufferChannels.length ? (
                      <div className="rounded-lg border bg-white px-3 py-2 text-xs text-gray-500">
                        No Buffer channels loaded.
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-[11px] font-medium text-gray-600">
                    Post type
                    <select
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs"
                      value={bufferForm.postType}
                      onChange={(e) => setBufferForm({ ...bufferForm, postType: e.target.value })}
                    >
                      <option value="post">Post</option>
                      <option value="story">Story</option>
                      <option value="reel">Reel</option>
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-gray-600">
                    Publish mode
                    <select
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs"
                      value={bufferForm.mode}
                      onChange={(e) => setBufferForm({ ...bufferForm, mode: e.target.value })}
                    >
                      <option value="shareNow">Publish now</option>
                      <option value="addToQueue">Add to queue</option>
                      <option value="shareNext">Share next</option>
                      <option value="customScheduled">Schedule time</option>
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-gray-600">
                    Schedule time
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs disabled:bg-gray-100"
                      value={bufferForm.dueAt}
                      disabled={bufferForm.mode !== "customScheduled"}
                      onChange={(e) => setBufferForm({ ...bufferForm, dueAt: e.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={sendSelectedToBuffer}
                  disabled={bulkPublishing || !selectedDraftIds.length || !selectedBufferChannels().length}
                  className="w-full rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {bulkPublishing ? "Sending..." : `Send Selected (${selectedDraftIds.length})`}
                </button>
              </div>

              <div className="space-y-2 max-h-[44rem] overflow-auto pr-1">
                {drafts.map((draft) => (
                  <div key={draft._id} className="border rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedDraftIds.includes(draft._id)}
                          onChange={() => toggleDraftSelection(draft._id)}
                        />
                        <span className="truncate font-semibold text-sm">{draft.topic || "Untitled draft"}</span>
                      </label>
                      <div className="flex shrink-0 items-center gap-1">
                        {draft.buffer?.postId ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700">
                            Buffer
                          </span>
                        ) : null}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase">
                          {draft.status}
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border bg-white">
                      {draft.imageUrl ? (
                        <img src={draft.imageUrl} alt="" className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-gray-100 px-4 text-center text-xs text-gray-500">
                          Image will appear here after generation
                        </div>
                      )}
                      <div className="space-y-3 p-3">
                        <p className="text-sm font-semibold leading-snug text-gray-900">
                          {draft.hook || draft.caption || "-"}
                        </p>
                        {draft.cta ? (
                          draft.ctaLink ? (
                            <a
                              href={normalizeUrl(draft.ctaLink)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-full items-center justify-center rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white"
                            >
                              {draft.cta}
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="w-full rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white"
                            >
                              {draft.cta}
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                    <details className="rounded-lg border bg-gray-50 p-2">
                      <summary className="cursor-pointer text-[11px] font-semibold text-gray-600">Generation details</summary>
                      <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                        <p><span className="font-medium">Topic:</span> {preview(draft.topic, 120)}</p>
                        <p><span className="font-medium">Category:</span> {draft.categorySnapshot?.name || draft.categoryId?.name || "-"}</p>
                        <p><span className="font-medium">Auto platforms:</span> {Array.isArray(draft.targetPlatforms) && draft.targetPlatforms.length ? draft.targetPlatforms.join(", ") : "all selected channels"}</p>
                        {draft.imageTextOverlay ? (
                          <p><span className="font-medium">Image overlay:</span> {draft.imageTextOverlay}</p>
                        ) : null}
                        <p><span className="font-medium">Image prompt:</span> {preview(draft.imagePrompt, 180)}</p>
                        {Array.isArray(draft.hashtags) && draft.hashtags.length ? (
                          <p>{draft.hashtags.join(" ")}</p>
                        ) : null}
                      </div>
                    </details>
                    {draft.lastError ? <p className="text-red-600">Image note: {draft.lastError}</p> : null}
                    {draft.buffer?.postId ? (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-[11px] text-emerald-800">
                        Buffer post: {draft.buffer.postId}
                        {draft.buffer.channelName ? ` | ${draft.buffer.channelName}` : ""}
                        {draft.buffer.dueAt ? ` | ${formatTime(draft.buffer.dueAt)}` : ""}
                        {draft.bufferImageAttached ? " | image attached" : " | no image confirmation"}
                      </div>
                    ) : null}
                    {editingPostId === draft._id ? (
                      <textarea
                        className="w-full rounded-lg border bg-white px-3 py-2 text-xs"
                        rows={5}
                        value={postTextByDraftId[draft._id] ?? composePostText(draft)}
                        onChange={(e) => setPostTextByDraftId({ ...postTextByDraftId, [draft._id]: e.target.value })}
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setEditingPostId(editingPostId === draft._id ? "" : draft._id)}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold"
                      >
                        {editingPostId === draft._id ? "Hide Text" : "Edit Post"}
                      </button>
                      <button
                        onClick={() => sendDraftToBuffer(draft)}
                        disabled={publishingId === draft._id || !selectedBufferChannels().length}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold disabled:opacity-50"
                      >
                        {publishingId === draft._id ? "Sending..." : "Send Buffer"}
                      </button>
                      <button
                        onClick={() => deleteDraft(draft._id)}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!drafts.length ? (
                  <div className="border rounded-xl p-3 text-sm text-gray-500">No generated drafts yet.</div>
                ) : null}
              </div>
            </section>

            <section className="bg-white border rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">Job Logs</h2>
                <button
                  type="button"
                  onClick={() => runAutoPostCheck()}
                  disabled={autoPosting}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  {autoPosting ? "Checking..." : "Run Auto-Post Check"}
                </button>
                <button
                  type="button"
                  onClick={() => runAutoPostCheck({ force: true })}
                  disabled={autoPosting}
                  className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {autoPosting ? "Running..." : "Force Auto-Post Now"}
                </button>
              </div>
              {logs.map((log) => (
                <div key={log._id} className="border rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold uppercase">{log.status}</span>
                    <span className="text-gray-500">{formatTime(log.createdAt)}</span>
                  </div>
                  <p>Picked: {log.picked || 0} | Drafts: {log.createdDrafts || 0}</p>
                  {log.message ? <p className="text-red-600">{log.message}</p> : null}
                  {log.details?.autoBuffer ? (
                    <p className="text-gray-600">
                      Auto-post: {log.details.autoBuffer.sent || 0} sent | due: {(log.details.autoBuffer.duePlatforms || []).join(", ") || "-"} | marked: {(log.details.autoBuffer.markedPlatforms || []).join(", ") || "-"} | {log.details.autoBuffer.reason || "checked"}
                    </p>
                  ) : null}
                </div>
              ))}
              {!logs.length ? <p className="text-sm text-gray-500">No logs yet.</p> : null}
            </section>
          </div>
        </div>
      </div>
      {generationProgress ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`font-semibold ${generationProgress.failed ? "text-red-600" : "text-gray-900"}`}>
                  {generationProgress.title}
                </h2>
                <p className="mt-1 text-sm text-gray-600">{generationProgress.message}</p>
              </div>
              {generationProgress.failed ? (
                <button
                  type="button"
                  onClick={() => setGenerationProgress(null)}
                  className="rounded border px-2 py-1 text-xs font-semibold"
                >
                  Close
                </button>
              ) : null}
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full transition-all duration-300 ${generationProgress.failed ? "bg-red-500" : "bg-black"}`}
                style={{ width: `${Math.max(5, Math.min(100, Number(generationProgress.percent || 0)))}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs text-gray-500">
              {Math.max(0, Math.min(100, Number(generationProgress.percent || 0)))}%
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
