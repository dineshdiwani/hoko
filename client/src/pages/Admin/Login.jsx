import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/adminApi";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault(); // 🔴 REQUIRED

    try {
      setLoading(true);
      const res = await api.post("/admin/login", {
        email,
        password,
      });

      if (res.data?.token) {
        localStorage.setItem("admin_token", res.data.token);
      }
      navigate("/admin/dashboard");
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || "Invalid admin credentials";
      alert(message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-shell">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] items-center">
          <div>
            <h1 className="page-hero mb-4">Admin Console</h1>
            <p className="page-subtitle leading-relaxed">
              Secure access to platform analytics, approvals, and
              operations.
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md mx-auto"
          >
            <h1 className="text-2xl font-bold mb-4">Admin Login</h1>

        <input
          className="input mb-3"
          placeholder="Admin email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="input mb-3"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Login"}
        </button>
          </form>
        </div>
      </div>
    </div>
  );
}
