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
  generationEnabled: false,
  approvalRequired: true,
  maxDraftsPerRun: 3,
  cronIntervalMinutes: 60,
  brandInstructions: "",
  blockedWords: []
};

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

function withTimeout(promise, ms = 20000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("Request timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

export default function AdminAiContent() {
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [dashboardCategories, setDashboardCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [trainingNotes, setTrainingNotes] = useState([]);
  const [campaignRuns, setCampaignRuns] = useState([]);
  const [trainingText, setTrainingText] = useState("");
  const [campaignForm, setCampaignForm] = useState({
    mood: "",
    postCount: 3,
    categoryMode: "auto",
    selectedCategories: [],
    audienceMode: "auto",
    imageStyle: "auto",
    useAppScreenshots: true,
    fixedCta: "",
    ctaLink: ""
  });
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(null);
  const [bufferChannels, setBufferChannels] = useState([]);
  const [bufferConfigured, setBufferConfigured] = useState(false);
  const [bufferForm, setBufferForm] = useState({
    channelId: "",
    mode: "shareNow",
    dueAt: ""
  });
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
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
      const [settingsRes, categoriesRes, draftsRes, logsRes, trainingRes, runsRes] = await withTimeout(Promise.all([
        api.get("/ai-content/settings"),
        api.get("/ai-content/categories"),
        api.get("/ai-content/drafts?limit=30"),
        api.get("/ai-content/logs?limit=10"),
        api.get("/ai-content/training-notes?limit=20"),
        api.get("/ai-content/campaign-runs?limit=10")
      ]));
      setSettings(settingsRes.data?.settings || null);
      setCategories(Array.isArray(categoriesRes.data?.items) ? categoriesRes.data.items : []);
      setDrafts(Array.isArray(draftsRes.data?.items) ? draftsRes.data.items : []);
      setLogs(Array.isArray(logsRes.data?.items) ? logsRes.data.items : []);
      setTrainingNotes(Array.isArray(trainingRes.data?.items) ? trainingRes.data.items : []);
      setCampaignRuns(Array.isArray(runsRes.data?.items) ? runsRes.data.items : []);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to load AI content data");
    } finally {
      setLoading(false);
    }
  }

  async function loadDraftsOnly({ silent = false } = {}) {
    try {
      setDraftsLoading(true);
      const draftsRes = await withTimeout(api.get("/ai-content/drafts?limit=30"), 12000);
      setDrafts(Array.isArray(draftsRes.data?.items) ? draftsRes.data.items : []);
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

  async function loadBufferChannels() {
    try {
      const res = await api.get("/ai-content/buffer/channels");
      const channels = Array.isArray(res.data?.channels) ? res.data.channels : [];
      setBufferChannels(channels);
      setBufferConfigured(Boolean(res.data?.configured));
      const defaultChannelId = res.data?.defaultChannelId || channels[0]?.id || "";
      setBufferForm((current) => ({
        ...current,
        channelId: current.channelId || defaultChannelId
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
    loadDashboardCategories().catch(() => {});
    loadBufferChannels().catch(() => {});
  }, []);

  async function saveSettings() {
    try {
      setSettingsSaving(true);
      const payload = {
        ...defaultSettings,
        ...(settings || {}),
        maxDraftsPerRun: Math.max(1, Math.min(20, Number(settings?.maxDraftsPerRun || 3))),
        cronIntervalMinutes: Math.max(5, Math.min(1440, Number(settings?.cronIntervalMinutes || 60))),
        blockedWords: Array.isArray(settings?.blockedWords)
          ? settings.blockedWords
          : String(settings?.blockedWords || "").split(",").map((item) => item.trim()).filter(Boolean)
      };
      const res = await api.put("/ai-content/settings", payload);
      setSettings(res.data?.settings || null);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to save settings");
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
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) {
      alert("Category name is required");
      return;
    }

    try {
      if (editingId) {
        await api.patch(`/ai-content/categories/${editingId}`, categoryForm);
      } else {
        await api.post("/ai-content/categories", categoryForm);
      }
      resetCategoryForm();
      await loadAll();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to save category");
    }
  }

  async function deleteCategory(categoryId) {
    if (!window.confirm("Delete this category? Existing generated drafts will remain.")) return;
    try {
      await api.delete(`/ai-content/categories/${categoryId}`);
      await loadAll();
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

  async function setDraftStatus(draftId, status) {
    try {
      await api.patch(`/ai-content/drafts/${draftId}/status`, { status });
      await refreshDraftsQuietly();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to update draft");
    }
  }

  function selectedBufferChannel() {
    return bufferChannels.find((channel) => channel.id === bufferForm.channelId) || null;
  }

  function toggleDraftSelection(draftId) {
    setSelectedDraftIds((current) => (
      current.includes(draftId)
        ? current.filter((id) => id !== draftId)
        : [...current, draftId]
    ));
  }

  async function sendDraftToBuffer(draft) {
    if (!bufferForm.channelId) {
      alert("Select a Buffer channel first");
      return;
    }
    const channel = selectedBufferChannel();
    try {
      setPublishingId(draft._id);
      await api.post(`/ai-content/drafts/${draft._id}/buffer`, {
        channelId: bufferForm.channelId,
        channelName: channel?.name || "",
        channelService: channel?.service || "",
        mode: bufferForm.mode,
        dueAt: bufferForm.mode === "customScheduled" ? bufferForm.dueAt : "",
        text: postTextByDraftId[draft._id] || composePostText(draft)
      });
      await refreshDraftsQuietly();
      setSelectedDraftIds((current) => current.filter((id) => id !== draft._id));
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
    if (!bufferForm.channelId) {
      alert("Select a Buffer channel first");
      return;
    }
    const channel = selectedBufferChannel();
    try {
      setBulkPublishing(true);
      const textByDraftId = {};
      for (const draftId of selectedDraftIds) {
        if (postTextByDraftId[draftId]) textByDraftId[draftId] = postTextByDraftId[draftId];
      }
      const res = await api.post("/ai-content/drafts/buffer/bulk", {
        draftIds: selectedDraftIds,
        channelId: bufferForm.channelId,
        channelName: channel?.name || "",
        channelService: channel?.service || "",
        mode: bufferForm.mode,
        dueAt: bufferForm.mode === "customScheduled" ? bufferForm.dueAt : "",
        textByDraftId
      });
      const failed = Number(res.data?.failedCount || 0);
      alert(`Sent to Buffer: ${res.data?.successCount || 0}${failed ? `, failed: ${failed}` : ""}`);
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
      await refreshDraftsQuietly();
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
      await loadAll();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to save training note");
    }
  }

  async function setTrainingNoteStatus(noteId, status) {
    try {
      await api.patch(`/ai-content/training-notes/${noteId}/status`, { status });
      await loadAll();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to update training note");
    }
  }

  async function deleteTrainingNote(noteId) {
    if (!window.confirm("Delete this training note?")) return;
    try {
      await api.delete(`/ai-content/training-notes/${noteId}`);
      await loadAll();
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
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={settings.approvalRequired !== false}
                      onChange={(e) => setSettings({ ...settings, approvalRequired: e.target.checked })}
                    />
                    Require approval
                  </label>
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
                      Queue approved drafts to connected Buffer social channels.
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
                <label className="block text-[11px] font-medium text-gray-600">
                  Social channel
                  <select
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs"
                    value={bufferForm.channelId}
                    onChange={(e) => setBufferForm({ ...bufferForm, channelId: e.target.value })}
                  >
                    <option value="">Select channel</option>
                    {bufferChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name || channel.id} {channel.service ? `(${channel.service})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  disabled={bulkPublishing || !selectedDraftIds.length || !bufferForm.channelId}
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
                        onClick={() => setDraftStatus(draft._id, "approved")}
                        disabled={draft.status === "approved"}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setDraftStatus(draft._id, "rejected")}
                        disabled={draft.status === "rejected"}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => setDraftStatus(draft._id, "draft")}
                        disabled={draft.status === "draft"}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold disabled:opacity-50"
                      >
                        Draft
                      </button>
                      <button
                        onClick={() => setEditingPostId(editingPostId === draft._id ? "" : draft._id)}
                        className="px-3 py-1.5 rounded border text-[11px] font-semibold"
                      >
                        {editingPostId === draft._id ? "Hide Text" : "Edit Post"}
                      </button>
                      <button
                        onClick={() => sendDraftToBuffer(draft)}
                        disabled={publishingId === draft._id || !bufferForm.channelId || draft.status === "rejected"}
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
              <h2 className="font-semibold">Job Logs</h2>
              {logs.map((log) => (
                <div key={log._id} className="border rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold uppercase">{log.status}</span>
                    <span className="text-gray-500">{formatTime(log.createdAt)}</span>
                  </div>
                  <p>Picked: {log.picked || 0} | Drafts: {log.createdDrafts || 0}</p>
                  {log.message ? <p className="text-red-600">{log.message}</p> : null}
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
