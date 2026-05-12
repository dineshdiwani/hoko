import { useEffect, useRef, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

function toDateTimeLocalValue(date) {
  const source = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(source.getTime())) return "";
  const offsetMs = source.getTimezoneOffset() * 60000;
  return new Date(source.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatCampaignTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function previewText(value, limit = 120) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function buildMediaLabel(media = {}) {
  const mode = String(media?.mode || "none").trim().toLowerCase();
  if (mode === "url") return "Media URL";
  if (mode === "file") return "Uploaded file";
  return "No media";
}

export default function AdminSocialMedia() {
  const [configStatus, setConfigStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [posting, setPosting] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const [pageId, setPageId] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [mediaMode, setMediaMode] = useState("url");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [scheduleAt, setScheduleAt] = useState("");

  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetDefaultScheduleAt, setSheetDefaultScheduleAt] = useState("");
  const [sheetImporting, setSheetImporting] = useState(false);
  const [sheetResult, setSheetResult] = useState(null);

  const [aiBrief, setAiBrief] = useState("");
  const [aiAudience, setAiAudience] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiMediaStyle, setAiMediaStyle] = useState("");
  const [aiIncludeHashtags, setAiIncludeHashtags] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const fileInputRef = useRef(null);

  const loadStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await api.get("/social-media/meta/status");
      setConfigStatus(res.data || null);
    } catch (err) {
      setConfigStatus({
        configured: false,
        error: err?.response?.data?.message || err.message || "Failed to load Instagram status"
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadCampaigns = async () => {
    try {
      setCampaignsLoading(true);
      const res = await api.get("/social-media/meta/campaigns?limit=20");
      setCampaigns(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to load campaigns");
    } finally {
      setCampaignsLoading(false);
    }
  };

  const runCampaignNow = async (campaignId) => {
    if (!campaignId) return;

    try {
      await api.post(`/social-media/meta/campaigns/${campaignId}/run-now`);
      await loadCampaigns();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to publish campaign");
    }
  };

  useEffect(() => {
    loadStatus().catch(() => {});
    loadCampaigns().catch(() => {});
  }, []);

  const resetComposer = () => {
    setMessage("");
    setLink("");
    setMediaMode("url");
    setMediaUrl("");
    setMediaFile(null);
    setScheduleAt("");
    setPublishResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setMediaFile(file);
  };

  const submitCampaign = async ({ queue = false } = {}) => {
    if (mediaMode === "url" && !mediaUrl.trim()) {
      alert("Enter a public image URL");
      return;
    }
    if (mediaMode === "file" && !mediaFile) {
      alert("Select an image file first");
      return;
    }
    if (!message.trim() && !link.trim() && !mediaUrl.trim() && !mediaFile) {
      alert("Enter a caption or media");
      return;
    }
    if (queue && !scheduleAt.trim()) {
      alert("Select a schedule time before queueing");
      return;
    }

    try {
      setPosting(true);
      setPublishResult(null);

      const payloadScheduleAt = queue && scheduleAt.trim() ? new Date(scheduleAt).toISOString() : "";
      const shouldUseFormData = mediaMode === "file";

      if (shouldUseFormData) {
        if (!mediaFile) {
          alert("Select a media file first");
          return;
        }
        const formData = new FormData();
        formData.append("message", message);
        formData.append("link", link);
        formData.append("mediaMode", "file");
        formData.append("mediaFile", mediaFile);
        if (queue) formData.append("queueAction", "queue");
        if (pageId.trim()) formData.append("pageId", pageId.trim());
        if (payloadScheduleAt) formData.append("scheduleAt", payloadScheduleAt);

        const res = await api.post("/social-media/meta/post", formData);
        setPublishResult(res.data || null);
      } else {
        const payload = {
          message: message.trim(),
          link: link.trim(),
          pageId: pageId.trim(),
          mediaMode,
          mediaUrl: mediaMode === "url" ? mediaUrl.trim() : ""
        };
        if (queue) {
          payload.queueAction = "queue";
        }
        if (payloadScheduleAt) {
          payload.scheduleAt = payloadScheduleAt;
        }
        const res = await api.post("/social-media/meta/post", payload);
        setPublishResult(res.data || null);
      }

      await loadCampaigns();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to publish Instagram campaign");
    } finally {
      setPosting(false);
    }
  };

  const importGoogleSheet = async () => {
    if (!sheetUrl.trim()) {
      alert("Paste a Google Sheet URL first");
      return;
    }

    try {
      setSheetImporting(true);
      setSheetResult(null);
      const payload = {
        sheetUrl: sheetUrl.trim(),
        pageId: pageId.trim()
      };
      if (sheetDefaultScheduleAt.trim()) {
        payload.defaultScheduleAt = new Date(sheetDefaultScheduleAt).toISOString();
      }
      const res = await api.post("/social-media/meta/import/google-sheet", payload);
      setSheetResult(res.data || null);
      await loadCampaigns();
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to import Google Sheet");
    } finally {
      setSheetImporting(false);
    }
  };

  const generateDraft = async () => {
    if (!aiBrief.trim()) {
      alert("Enter a campaign brief first");
      return;
    }

    try {
      setAiGenerating(true);
      setAiResult(null);
      const res = await api.post("/social-media/meta/ai/generate", {
        brief: aiBrief.trim(),
        audience: aiAudience.trim(),
        tone: aiTone,
        mediaStyle: aiMediaStyle.trim(),
        includeHashtags: aiIncludeHashtags
      });
      setAiResult(res.data?.draft || null);
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to generate draft");
    } finally {
      setAiGenerating(false);
    }
  };

  const applyDraft = () => {
    if (!aiResult?.caption) return;
    setMessage(aiResult.caption);
    setAiResult((current) => current ? { ...current, applied: true } : current);
  };

  const configLine = configStatus
    ? configStatus.error
      ? configStatus.error
    : `Configured: ${configStatus.configured ? "Yes" : "No"} | IG User ID: ${configStatus.instagramUserIdConfigured ? "Yes" : "No"} | Token: ${configStatus.accessTokenConfigured ? "Yes" : "No"} | API: ${configStatus.apiVersion || "-"}`
    : "Loading Instagram status...";

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h1 className="page-hero">Instagram</h1>
            <p className="text-sm text-gray-600">
              Instagram scheduler, Google Sheet imports, and AI draft generation.
            </p>
          </div>
          <AdminNav />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white border rounded-2xl p-4 space-y-4">
            <div className="rounded-xl border bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-semibold mb-1">Instagram config</p>
              <p>{loadingStatus ? "Loading..." : configLine}</p>
              <p className="text-gray-500 mt-1">
                Queue jobs here for Instagram posts now or later. LinkedIn can reuse the same job model later.
              </p>
            </div>

            <div className="border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Compose Instagram post</h3>
                  <p className="text-xs text-gray-500">
                    Publish immediately or queue it for the worker to send later.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadStatus}
                  disabled={loadingStatus}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
                >
                  {loadingStatus ? "Refreshing..." : "Refresh Status"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Instagram account ID override (optional)</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="17841400000000000"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Media mode</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={mediaMode}
                    onChange={(e) => {
                      setMediaMode(e.target.value);
                      setPublishResult(null);
                    }}
                  >
                    <option value="url">Image URL</option>
                    <option value="file">Upload image</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Caption</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm min-h-32 bg-white"
                  placeholder="Write the Instagram caption here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Link reference (optional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  placeholder="https://example.com/campaign"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </div>

              {mediaMode === "url" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Public image URL</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="https://example.com/image.jpg"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                </div>
              ) : null}

              {mediaMode === "file" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Upload image</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {mediaFile?.name || "None"}
                  </p>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Schedule at (optional)</label>
                <input
                  type="datetime-local"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to publish now. If set and you click Queue Post, the worker will publish it later.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => submitCampaign({ queue: false })}
                  disabled={posting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
                >
                  {posting ? "Publishing..." : "Publish Now"}
                </button>
                <button
                  type="button"
                  onClick={() => submitCampaign({ queue: true })}
                  disabled={posting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
                >
                  Queue Post
                </button>
                <button
                  type="button"
                  onClick={resetComposer}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="border rounded-xl p-4 space-y-4">
              <div>
                <h3 className="font-semibold">Google Sheet import</h3>
                <p className="text-xs text-gray-500">
                  Paste a public or published Google Sheet URL. Expected columns: message/caption, link, media_url, media_mode, schedule_at, page_id, title.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Google Sheet URL</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Default schedule time (optional)</label>
                <input
                  type="datetime-local"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  value={sheetDefaultScheduleAt}
                  onChange={(e) => setSheetDefaultScheduleAt(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={importGoogleSheet}
                  disabled={sheetImporting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
                >
                  {sheetImporting ? "Importing..." : "Import & Queue"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetUrl("");
                    setSheetDefaultScheduleAt("");
                    setSheetResult(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300"
                >
                  Clear
                </button>
              </div>

              {sheetResult ? (
                <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-1">
                  <p className="font-semibold">Import result</p>
                  <p>Imported: {sheetResult.imported || 0}</p>
                  <p>Skipped: {sheetResult.skipped || 0}</p>
                  {Array.isArray(sheetResult.skippedRows) && sheetResult.skippedRows.length > 0 ? (
                    <p className="text-xs text-gray-500">
                      Skipped rows: {sheetResult.skippedRows.slice(0, 5).map((row) => `#${row.row}`).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border rounded-2xl p-4 space-y-3">
              <div>
                <h3 className="font-semibold">AI draft helper</h3>
                <p className="text-xs text-gray-500">
                  Use OpenAI if `OPENAI_API_KEY` is set. Otherwise a local fallback draft is generated.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Campaign brief</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm min-h-28 bg-white"
                  placeholder="Describe the offer, event, or update..."
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Audience</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  placeholder="buyers, sellers, founders, dealers..."
                  value={aiAudience}
                  onChange={(e) => setAiAudience(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tone</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="urgent">Urgent</option>
                    <option value="sales">Sales-focused</option>
                    <option value="informative">Informative</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Media style / visual brief</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="banner, carousel, product shot, announcement poster..."
                    value={aiMediaStyle}
                    onChange={(e) => setAiMediaStyle(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={aiIncludeHashtags}
                  onChange={(e) => setAiIncludeHashtags(e.target.checked)}
                />
                Include hashtags
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={generateDraft}
                  disabled={aiGenerating}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
                >
                  {aiGenerating ? "Generating..." : "Generate Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAiBrief("");
                    setAiAudience("");
                    setAiTone("professional");
                    setAiMediaStyle("");
                    setAiIncludeHashtags(true);
                    setAiResult(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300"
                >
                  Clear
                </button>
              </div>

              {aiResult ? (
                <div className="rounded-lg border bg-gray-50 p-3 text-xs space-y-2">
                  <p className="font-semibold">Draft result</p>
                  <p><span className="font-medium">Caption:</span> {aiResult.caption || "-"}</p>
                  <p><span className="font-medium">Media prompt:</span> {aiResult.mediaPrompt || "-"}</p>
                  {Array.isArray(aiResult.hashtags) && aiResult.hashtags.length > 0 ? (
                    <p><span className="font-medium">Hashtags:</span> {aiResult.hashtags.join(" ")}</p>
                  ) : null}
                  {aiResult.cta ? <p><span className="font-medium">CTA:</span> {aiResult.cta}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={applyDraft}
                      className="px-3 py-1.5 rounded border border-gray-300 text-xs font-semibold"
                    >
                      Use caption
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Queue history</h3>
                  <p className="text-xs text-gray-500">
                    Shows recent scheduled and published Instagram jobs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadCampaigns}
                  disabled={campaignsLoading}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
                >
                  {campaignsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div className="space-y-2 max-h-[28rem] overflow-auto pr-1">
                {campaigns.length === 0 ? (
                  <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-500">
                    No campaigns yet.
                  </div>
                ) : (
                  campaigns.map((campaign) => {
                    const media = campaign?.media || {};
                    return (
                      <div key={campaign._id} className="rounded-lg border p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">{campaign.title || previewText(campaign.message, 60)}</p>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase">
                            {campaign.status || "draft"}
                          </span>
                        </div>
                        <p>Message: {previewText(campaign.message, 90)}</p>
                        <p>Media: {buildMediaLabel(media)}</p>
                        <p>Schedule: {formatCampaignTime(campaign.scheduleAt)}</p>
                        <p>Published: {formatCampaignTime(campaign.publishedAt)}</p>
                        <p>Source: {campaign.source || "-"}</p>
                        <p>Post ID: {campaign.providerPostId || "-"}</p>
                        {campaign.lastError ? (
                          <p className="text-red-600">Error: {campaign.lastError}</p>
                        ) : null}
                        {campaign.status !== "published" && campaign.status !== "cancelled" ? (
                          <button
                            type="button"
                            onClick={() => runCampaignNow(campaign._id)}
                            className="mt-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] font-semibold"
                          >
                            Run now
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {publishResult ? (
          <div className="mt-4 bg-white border rounded-2xl p-4 space-y-2 max-w-5xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Publish result</h3>
              <span className="text-xs text-gray-500">{publishResult.mode || "published"}</span>
            </div>
            <p>Campaign ID: {publishResult?.campaign?._id || "-"}</p>
            <p>IG User ID: {publishResult?.pageId || publishResult?.campaign?.instagramUserId || publishResult?.campaign?.pageId || "-"}</p>
            <p>Post ID: {publishResult?.postId || publishResult?.campaign?.providerPostId || "-"}</p>
            <p>State: {publishResult?.campaign?.status || publishResult?.mode || "-"}</p>
            <pre className="text-xs whitespace-pre-wrap break-words bg-gray-50 border rounded-lg p-3">
              {JSON.stringify(publishResult?.raw || publishResult?.campaign || {}, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
