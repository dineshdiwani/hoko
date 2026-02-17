import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/adminApi";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState("REQUEST");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.post("/admin/login", {
        email,
        password
      });
      if (res.data?.token) {
        localStorage.setItem("admin_token", res.data.token);
      }
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Invalid admin credentials";
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequest() {
    if (!String(forgotEmail || "").trim()) {
      alert("Please enter admin email");
      return;
    }
    try {
      setForgotLoading(true);
      await api.post("/admin/forgot-password", { email: forgotEmail });
      setForgotStep("VERIFY");
      alert("OTP sent to email");
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          "Failed to send OTP"
      );
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleForgotReset() {
    if (String(forgotOtp).trim().length !== 6) {
      alert("Please enter a valid 6-digit OTP");
      return;
    }
    if (!forgotPassword || String(forgotPassword).length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    try {
      setForgotLoading(true);
      await api.post("/admin/reset-password", {
        email: forgotEmail,
        otp: forgotOtp,
        newPassword: forgotPassword
      });
      alert("Password reset successful");
      setShowForgot(false);
      setForgotStep("REQUEST");
      setForgotEmail("");
      setForgotOtp("");
      setForgotPassword("");
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          "Failed to reset password"
      );
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-shell pt-[calc(5rem-5mm)] md:pt-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] items-center">
          <div className="min-w-0">
            <h1 className="page-hero mb-4">Admin Console</h1>
            <p className="page-subtitle leading-relaxed">
              Secure access to platform analytics, approvals, and operations.
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md max-w-[calc(100vw-2rem)] mx-auto"
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

            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="mt-3 text-sm text-amber-700 hover:underline"
            >
              Forgot password?
            </button>
          </form>
        </div>
      </div>

      {showForgot && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Reset Admin Password</h2>
              <button
                onClick={() => setShowForgot(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            {forgotStep === "REQUEST" && (
              <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Admin email
                </label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />
                <button
                  onClick={handleForgotRequest}
                  disabled={forgotLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {forgotLoading ? "Sending..." : "Send OTP"}
                </button>
              </>
            )}

            {forgotStep === "VERIFY" && (
              <>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />

                <label className="block text-sm font-medium mb-1 text-gray-700">
                  New password
                </label>
                <input
                  type="password"
                  value={forgotPassword}
                  onChange={(e) => setForgotPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4"
                />

                <button
                  onClick={handleForgotReset}
                  disabled={forgotLoading}
                  className="w-full py-3 rounded-xl btn-brand font-semibold"
                >
                  {forgotLoading ? "Resetting..." : "Reset Password"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
