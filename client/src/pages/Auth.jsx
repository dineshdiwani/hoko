import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { refreshSocketAuth } from "../services/socket";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("login");
  const navigate = useNavigate();

  async function sendOtp() {
    try {
      const res = await api.post("/auth/login", {
        email,
        password,
        role: "buyer",
        city
      });
      console.log("OTP response:", res.data);
      setStep("otp");
    } catch (err) {
      console.error("OTP error:", err.response?.data || err.message);
      alert(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to send OTP. Check console."
      );
    }
  }

  async function verifyOtp() {
    const res = await api.post("/auth/verify-otp", {
      email,
      otp,
      role: "buyer",
      city
    });

    const { token, user } = res.data;

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    // Refresh authenticated socket after login
    refreshSocketAuth();

    navigate("/dashboard");
  }

  return (
    <div className="page">
      <div className="page-shell">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] items-center">
          <div>
            <h1 className="page-hero mb-4">Secure OTP Login</h1>
            <p className="page-subtitle leading-relaxed">
              Sign in with your email and password. We verify with a
              one-time password.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">Login</h1>

            {step === "login" && (
              <>
                <input
                  className="input mb-3"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <input
                  className="input mb-3"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <input
                  className="input mb-3"
                  placeholder="City"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                />
                <button className="btn-primary w-full" onClick={sendOtp}>
                  Send OTP
                </button>
              </>
            )}

            {step === "otp" && (
              <>
                <input
                  className="input mb-3"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                />
                <button className="btn-primary w-full" onClick={verifyOtp}>
                  Verify OTP
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
