import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function BuyerWelcome() {
  const [text, setText] = useState("");
  const navigate = useNavigate();

  function submitRequirement() {
    if (!text.trim()) return;
    localStorage.setItem("buyer_requirement_text", text);
    navigate("/buyer/requirement");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 flex flex-col items-center justify-center px-4 animate-fade-in">
      
      {/* Logo / Brand */}
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
        Welcome to <span className="text-yellow-300">hoko</span>
      </h1>
      <p className="text-white/80 mb-8 text-center">
        Your marketplace for products & services
      </p>

      {/* Glass Card */}
      + <div className="w-full max-w-xl bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 transition hover:-translate-y-1 hover:shadow-3xl">
        <h2 className="text-lg font-semibold mb-3 text-gray-800">
          What do you need today?
        </h2>

        <textarea
          className="w-full border border-gray-300 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={4}
          placeholder="Type your requirement here… (e.g. Need 500kg rice for hotel)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-500">
            {text.length}/200
          </span>

          <button
            onClick={submitRequirement}
            className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold transition-all shadow-md"
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
