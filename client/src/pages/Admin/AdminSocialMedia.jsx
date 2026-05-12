import { useEffect, useRef, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

export default function AdminSocialMedia() {
  const [configStatus, setConfigStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState(null);
  const [pageId, setPageId] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [mediaMode, setMediaMode] = useState("none");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const fileInputRef = useRef(null);

  const loadStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await api.get("/social-media/meta/status");
      setConfigStatus(res.data || null);
    } catch (err) {
      setConfigStatus({
        configured: false,
        error: err?.response?.data?.message || err.message || "Failed to load Meta status"
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus().catch(() => {});
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setMediaFile(file);
  };

  const resetForm = () => {
    setMessage("");
    setLink("");
    setMediaMode("none");
    setMediaUrl("");
    setMediaFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const submitPost = async () => {
    if (!message.trim() && !link.trim() && !mediaUrl.trim() && !mediaFile) {
      alert("Enter a message, link, or media");
      return;
    }

    try {
      setPosting(true);
      setResult(null);

      if (mediaMode === "file") {
        if (!mediaFile) {
          alert("Select a media file first");
          return;
        }
        const formData = new FormData();
        formData.append("message", message);
        formData.append("link", link);
        formData.append("mediaMode", "file");
        formData.append("mediaFile", mediaFile);
        if (pageId.trim()) formData.append("pageId", pageId.trim());

        const res = await api.post("/social-media/meta/post", formData);
        setResult(res.data || null);
      } else {
        const payload = {
          message: message.trim(),
          link: link.trim(),
          pageId: pageId.trim(),
          mediaMode: mediaMode,
          mediaUrl: mediaMode === "url" ? mediaUrl.trim() : ""
        };
        const res = await api.post("/social-media/meta/post", payload);
        setResult(res.data || null);
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Failed to publish Meta post");
    } finally {
      setPosting(false);
    }
  };

  const configLine = configStatus
    ? configStatus.error
      ? configStatus.error
      : `Configured: ${configStatus.configured ? "Yes" : "No"} | Page ID: ${configStatus.pageIdConfigured ? "Yes" : "No"} | Token: ${configStatus.accessTokenConfigured ? "Yes" : "No"} | API: ${configStatus.apiVersion || "-"}`
    : "Loading Meta status...";

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h1 className="page-hero">Social Media</h1>
            <p className="text-sm text-gray-600">Publish Meta/Facebook Page posts with or without media.</p>
          </div>
          <AdminNav />
        </div>

        <div className="bg-white border rounded-2xl p-4 space-y-4 max-w-3xl">
          <div className="rounded-xl border bg-gray-50 p-3 text-xs text-gray-700">
            <p className="font-semibold mb-1">Meta config</p>
            <p>{loadingStatus ? "Loading..." : configLine}</p>
            <p className="text-gray-500 mt-1">
              This first version posts to a Facebook Page via the Meta Graph API. Instagram and LinkedIn can reuse the same UI pattern later.
            </p>
          </div>

          <div className="border rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Page ID override (optional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  placeholder="123456789012345"
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
                    setResult(null);
                  }}
                >
                  <option value="none">Text only</option>
                  <option value="url">Image URL</option>
                  <option value="file">Upload image</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message / caption</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-32 bg-white"
                placeholder="Write the post text here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Link (optional)</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="https://example.com/campaign"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>

            {mediaMode === "url" ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
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

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submitPost}
                disabled={posting}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white disabled:opacity-60"
              >
                {posting ? "Publishing..." : "Publish Meta Post"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={loadStatus}
                disabled={loadingStatus}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-60"
              >
                {loadingStatus ? "Refreshing..." : "Refresh Status"}
              </button>
            </div>
          </div>

          {result ? (
            <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-2">
              <p className="font-semibold">Publish result</p>
              <p>Platform: {result.platform || "meta"}</p>
              <p>Page ID: {result.pageId || "-"}</p>
              <p>Post ID: {result.postId || "-"}</p>
              <pre className="text-xs whitespace-pre-wrap break-words bg-white border rounded-lg p-3">
                {JSON.stringify(result.raw || {}, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
