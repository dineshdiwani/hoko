import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Welcome() {
  const [text, setText] = useState("");
  const navigate = useNavigate();

  const startMic = () => {
    const recognition = new window.webkitSpeechRecognition();
    recognition.onresult = e => setText(e.results[0][0].transcript);
    recognition.start();
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-r from-indigo-500 to-blue-600">
      <div className="bg-white p-6 rounded-xl w-96">
        <h1 className="font-bold text-lg mb-3">
          What kind of product or service offer you wish to have on hand?
        </h1>

        <textarea
          maxLength={100}
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full border p-2 rounded"
        />

        <button onClick={startMic} className="mt-2 text-blue-600">
          🎤 Use Microphone
        </button>

        <button
          onClick={() => navigate("/requirement")}
          className="mt-4 bg-blue-600 text-white w-full py-2 rounded"
        >
          Continue
        </button>

        <button
          onClick={() => navigate("/seller/register")}
          className="mt-3 w-full border py-2 rounded"
        >
          Register as Seller
        </button>
      </div>
    </div>
  );
}