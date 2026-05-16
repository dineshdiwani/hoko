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

export default function AdminAiContent() {
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [dashboardCategories, setDashboardCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [trainingNotes, setTrainingNotes] = useState([]);
  const [trainingText, setTrainingText] = useState("");
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(null);

  const activeCount = useMemo(
    () => categories.filter((item) => item.active !== false).length,
    [categories]
  );

  async function loadAll() {
    try {
      setLoading(true);
      const [settingsRes, categoriesRes, draftsRes, logsRes, trainingRes] = await Promise.all([
        api.get("/ai-content/settings"),
        api.get("/ai-content/categories"),
        api.get("/ai-content/drafts?limit=30"),
        api.get("/ai-content/logs?limit=10"),
        api.get("/ai-content/training-notes?limit=20")
      ]);
      setSettings(settingsRes.data?.settings || null);
      setCategories(Array.isArray(categoriesRes.data?.items) ? categoriesRes.data.items : []);
      setDrafts(Array.isArray(draftsRes.data?.items) ? draftsRes.data.items : []);
      setLogs(Array.isArray(logsRes.data?.items) ? logsRes.data.items : []);
      setTrainingNotes(Array.isArray(trainingRes.data?.items) ? trainingRes.data.items : []);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to load AI content data");
    } finally {
      setLoading(false);
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
  }, []);

  async function saveSettings() {
    try {
      setSettingsSaving(true);
      const res = await api.put("/ai-content/settings", settings || {});
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
      await loadAll();
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

  async function setDraftStatus(draftId, status) {
    try {
      await api.patch(`/ai-content/drafts/${draftId}/status`, { status });
      await loadAll();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to update draft");
    }
  }

  async function deleteDraft(draftId) {
    if (!window.confirm("Delete this generated draft?")) return;
    try {
      await api.delete(`/ai-content/drafts/${draftId}`);
      await loadAll();
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
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={settings.generationEnabled !== false}
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
                  onClick={loadAll}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
                >
                  {loading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div className="space-y-2 max-h-[44rem] overflow-auto pr-1">
                {drafts.map((draft) => (
                  <div key={draft._id} className="border rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm">{draft.topic || "Untitled draft"}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase">
                        {draft.status}
                      </span>
                    </div>
                    <p><span className="font-medium">Category:</span> {draft.categorySnapshot?.name || draft.categoryId?.name || "-"}</p>
                    <p><span className="font-medium">Hook:</span> {preview(draft.hook, 120)}</p>
                    <p><span className="font-medium">Caption:</span> {preview(draft.caption, 180)}</p>
                    <p><span className="font-medium">CTA:</span> {draft.cta || "-"}</p>
                    <p><span className="font-medium">Image prompt:</span> {preview(draft.imagePrompt, 160)}</p>
                    {draft.imageUrl ? (
                      <img src={draft.imageUrl} alt="" className="w-full aspect-square object-cover rounded-lg border" />
                    ) : null}
                    {Array.isArray(draft.hashtags) && draft.hashtags.length ? (
                      <p className="text-gray-600">{draft.hashtags.join(" ")}</p>
                    ) : null}
                    {draft.lastError ? <p className="text-red-600">Image note: {draft.lastError}</p> : null}
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
