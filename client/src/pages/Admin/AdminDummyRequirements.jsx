import { useCallback, useEffect, useState } from "react";
import api from "../../utils/adminApi";
import AdminNav from "../../components/AdminNav";

export default function AdminDummyRequirements() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [intervalHours, setIntervalHours] = useState(12);
  const [quantity, setQuantity] = useState(3);
  const [maxQuantity, setMaxQuantity] = useState(10);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadStatus = useCallback(async () => {
    try {
      console.log("[DummyReq] loading status from:", api.defaults.baseURL + "/dummy-requirements/status");
      const res = await api.get("/dummy-requirements/status");
      console.log("[DummyReq] status response:", res.data);
      setStatus(res.data);
      setIntervalHours(res.data.intervalHours || 12);
      setQuantity(res.data.quantity || 3);
      setMaxQuantity(res.data.maxQuantity || 500);
    } catch (err) {
      console.log("[DummyReq] loadStatus error:", err.response?.data || err.message);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.get("/dummy-requirements/logs");
      setLogs(res.data || []);
    } catch (err) {
      console.log("[DummyReq] loadLogs error:", err.response?.data || err.message);
    }
  }, []);

  const loadRequirements = useCallback(async () => {
    try {
      const res = await api.get("/dummy-requirements/requirements?limit=50");
      setRequirements(res.data?.items || []);
    } catch (err) {
      console.log("[DummyReq] loadRequirements error:", err.response?.data || err.message);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStatus(), loadLogs(), loadRequirements()]);
    setLoading(false);
  }, [loadStatus, loadLogs, loadRequirements]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleCron = async () => {
    try {
      console.log("[DummyReq] toggling cron...");
      const res = await api.post("/dummy-requirements/toggle");
      console.log("[DummyReq] toggle response:", res.data);
      await loadStatus();
    } catch (err) {
      console.log("[DummyReq] toggle error:", err.response?.data || err.message);
      const msg = err?.response?.data?.message || err?.message || "Failed";
      alert(`Error: ${msg}\nStatus: ${err?.response?.status}`);
    }
  };

  const saveSettings = async () => {
    try {
      console.log("[DummyReq] saving settings...");
      const res = await api.post("/dummy-requirements/settings", {
        intervalHours: Number(intervalHours),
        quantity: Number(quantity),
        maxQuantity: Number(maxQuantity)
      });
      console.log("[DummyReq] settings response:", res.data);
      await loadStatus();
      alert("Settings saved!");
    } catch (err) {
      console.log("[DummyReq] settings error:", err.response?.data || err.message);
      const msg = err?.response?.data?.message || err?.message || "Failed";
      alert(`Error: ${msg}\nStatus: ${err?.response?.status}`);
    }
  };

  const runNow = async () => {
    if (!confirm("Generate and send dummy requirements now?")) return;
    setRefreshing(true);
    try {
      console.log("[DummyReq] running cron now...");
      const res = await api.post("/dummy-requirements/run-now");
      console.log("[DummyReq] run-now response:", res.data);
      await loadAll();
      alert("Done!");
    } catch (err) {
      console.log("[DummyReq] run-now error:", err.response?.data || err.message);
      const msg = err?.response?.data?.message || err?.message || "Failed";
      alert(`Error: ${msg}\nStatus: ${err?.response?.status}`);
    } finally {
      setRefreshing(false);
    }
  };

  const resetRequirements = async (keepReal) => {
    if (!confirm(keepReal ? "Delete only with real requirements?" : "Delete ALL dummy requirements?")) return;
    try {
      await api.post("/dummy-requirements/reset", { keepRealRequirement: keepReal });
      await loadAll();
      alert("Deleted!");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed");
    }
  };

  const deleteRequirement = async (id) => {
    if (!confirm("Delete this dummy requirement?")) return;
    try {
      await api.delete(`/dummy-requirements/${id}`);
      await loadRequirements();
      alert("Deleted!");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete");
    }
  };

  const startEdit = (req) => {
    setEditingId(req._id);
    setEditForm({
      product: req.product || "",
      quantity: req.quantity || "",
      unit: req.unit || "",
      city: req.city || "",
      category: req.category || "",
      details: req.details || "",
      status: req.status || "new"
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/dummy-requirements/${id}`, editForm);
      setEditingId(null);
      setEditForm({});
      await loadRequirements();
      alert("Updated!");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update");
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("en-IN");
  };

  return (
    <div className="page">
      <div className="page-shell pt-20 md:pt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h1 className="page-hero">Dummy Requirements</h1>
          <AdminNav />
        </div>

        <div className="space-y-4">
          <div className="bg-white border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold">Cron Settings</p>
                <p className="text-sm text-gray-500">Frequency and quantity</p>
              </div>
              <button
                onClick={toggleCron}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  status?.cronRunning
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {status?.cronRunning ? "Running" : "Stopped"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-gray-600">Frequency (hours)</label>
                <input
                  type="number"
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  min={1}
                  max={72}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Quantity per run</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  min={1}
                  max={50}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Max product qty</label>
                <input
                  type="number"
                  value={maxQuantity}
                  onChange={(e) => setMaxQuantity(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  min={1}
                  max={10000}
                />
              </div>
            </div>
            <button
              onClick={saveSettings}
              className="mt-3 btn-primary px-4 py-2 rounded-lg text-sm"
            >
              Save Settings
            </button>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold">Statistics</p>
                <p className="text-sm text-gray-500">
                  Total: {status?.totalDummyRequirements || 0} | Sent:{" "}
                  {status?.sentCount || 0} | Pending: {status?.newCount || 0}
                </p>
              </div>
              <button
                onClick={runNow}
                disabled={refreshing}
                className="btn-primary px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {refreshing ? "Running..." : "Run Now"}
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <p className="font-semibold mb-3">Activity Logs</p>
            <div className="space-y-2 max-h-60 overflow-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-sm border-b pb-2">
                    <span className="text-gray-500">{formatDate(log.at)}</span>
                    <span className="ml-2 font-medium">{log.action}</span>
                    <span className="ml-2 text-gray-600">{log.details}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">Generated Requirements</p>
              <div className="flex gap-2">
                <button
                  onClick={() => resetRequirements(false)}
                  className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm"
                >
                  Reset All
                </button>
                <button
                  onClick={() => resetRequirements(true)}
                  className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm"
                >
                  Keep & Reset
                </button>
              </div>
            </div>
            <div className="space-y-3 max-h-96 overflow-auto">
              {requirements.length === 0 ? (
                <p className="text-sm text-gray-500">No requirements</p>
              ) : (
                requirements.map((req) => (
                  <div key={req._id} className="border rounded-lg p-3">
                    {editingId === req._id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.product}
                          onChange={(e) => setEditForm({ ...editForm, product: e.target.value })}
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder="Product"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="number"
                            value={editForm.quantity}
                            onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                            className="border rounded px-2 py-1 text-sm"
                            placeholder="Qty"
                          />
                          <input
                            type="text"
                            value={editForm.unit}
                            onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                            className="border rounded px-2 py-1 text-sm"
                            placeholder="Unit"
                          />
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            className="border rounded px-2 py-1 text-sm"
                          >
                            <option value="new">New</option>
                            <option value="sent">Sent</option>
                            <option value="expired">Expired</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editForm.city}
                          onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder="City"
                        />
                        <textarea
                          value={editForm.details}
                          onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                          className="w-full border rounded px-2 py-1 text-sm"
                          rows={2}
                          placeholder="Details"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(req._id)}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{req.product}</p>
                            <p className="text-sm text-gray-500">
                              Qty: {req.quantity} {req.unit} | {req.city} | {req.category}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{req.details}</p>
                            <p className="text-xs text-gray-400">
                              Status: <span className={`font-medium ${req.status === 'sent' ? 'text-green-600' : req.status === 'new' ? 'text-blue-600' : 'text-gray-600'}`}>{req.status}</span> | {formatDate(req.createdAt)}
                            </p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => startEdit(req)}
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRequirement(req._id)}
                              className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}