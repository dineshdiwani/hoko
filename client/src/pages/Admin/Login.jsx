import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/api";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault(); // 🔴 REQUIRED

    try {
      const res = await api.post("/admin/login", {
        email,
        password,
      });

      localStorage.setItem("admin", JSON.stringify(res.data.admin));
      navigate("/admin/dashboard");
    } catch (err) {
      alert("Invalid admin credentials");
      console.error(err);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleLogin}
        className="bg-white p-6 rounded shadow w-96"
      >
        <h1 className="text-xl font-bold mb-4">Admin Login</h1>

        <input
          className="input mb-3"
          placeholder="Email"
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
        >
          Login
        </button>
      </form>
    </div>
  );
}
