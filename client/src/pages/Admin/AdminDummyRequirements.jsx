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

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get("/dummy-requirements/status");
      setStatus(res.data);
      setIntervalHours(res.data.intervalHours || 12);
      setQuantity(res.data.quantity || 3);
    } catch {}
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.get("/dummy-requirements/logs");
      setLogs(res.data || []);
    } catch {}
  }, []);

  const loadRequirements = useCallback(async () => {
    try {
      const res = await api.get("/dummy-requirements/requirements?limit=50");
      setRequirements(res.data?.items || []);
    } catch {}
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
      await api.post("/dummy-requirements/toggle");
      await loadStatus();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed");
    }
  };

  const saveSettings = async () => {
    try {
      await api.post("/dummy-requirements/settings", {
        intervalHours: Number(intervalHours),
        quantity: Number(quantity)
      });
      await loadStatus();
      alert("Settings saved!");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed");
    }
  };

  const runNow = async () => {
    if (!confirm("Generate and send dummy requirements now?")) return;
    setRefreshing(true);
    try {
      await api.post("/dummy-requirements/run-now");
      await loadAll();
      alert("Done!");
    } catch (err) {
      alert(err?.response?.data?.message || "Failed");
    } finally {
      setRefreshing(false);
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
            <div className="grid grid-cols-2 gap-4">
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
                <label className="text-sm text-gray-600">Products/Services per message</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  min={1}
                  max={10}
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
            <p className="font-semibold mb-3">Generated Requirements</p>
            <div className="space-y-2 max-h-60 overflow-auto">
              {requirements.length === 0 ? (
                <p className="text-sm text-gray-500">No requirements</p>
              ) : (
                requirements.map((req) => (
                  <div key={req._id} className="text-sm border-b pb-2">
                    <span className="font-medium">{req.product}</span>
                    <span className="ml-2 text-gray-500">
                      | Qty: {req.quantity} | {req.city} | {req.status}
                    </span>
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