import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import socket from "../socket";




export default function Auth() {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("mobile");
  const navigate = useNavigate();

  async function sendOtp() {
  try {
    console.log("Sending OTP to:", mobile);
    const res = await api.post("/auth/send-otp", { mobile });
    console.log("OTP response:", res.data);
    setStep("otp");
  } catch (err) {
    console.error("OTP error:", err.response?.data || err.message);
    alert("Failed to send OTP. Check console.");
  }
}

  async function verifyOtp() {
  const res = await api.post("/auth/verify-otp", { mobile, otp });

  const { token, user } = res.data;

  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));

  // 🔌 CONNECT SOCKET AFTER LOGIN
  const userId = user._id || user.id || user.mobile;

  socket.connect();
  socket.emit("join", userId);

  navigate("/dashboard");
}

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white p-6 rounded shadow w-96">
        <h1 className="text-xl font-bold mb-4">Login</h1>

        {step === "mobile" && (
          <>
            <input
              className="input mb-3"
              placeholder="Mobile number"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
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
  );
}
