import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, setSession } from "../../services/storage";
import api from "../../services/api";
import NotificationCenter from "../../components/NotificationCenter";

export default function BuyerWelcome() {
  const logoSrc = "/logo.png";
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("");
  const navigate = useNavigate();
  const session = getSession();
  const isLoggedIn = Boolean(session?.token);
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  function submitRequirement() {
    if (!text.trim()) {
      alert("Please type in your requirement");
      return;
    }
    localStorage.setItem("draft_requirement_text", text.trim());
    const session = getSession();
    if (session?.role === "buyer" && session?.token) {
      navigate("/buyer/requirement/new");
      return;
    }
    navigate("/buyer/login");
  }

  const startVoiceInput = () => {
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setListening(true);
      setSpeechStatus("Listening...");
    };
    recognition.onerror = () => {
      setListening(false);
      setSpeechStatus("Voice input failed. Try again.");
    };
    recognition.onend = () => {
      setListening(false);
      setTimeout(() => setSpeechStatus(""), 1500);
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) {
        setText((prev) => `${prev}${prev ? " " : ""}${transcript}`.trim());
        setSpeechStatus("Voice captured");
      }
    };

    recognition.start();
  };

  return (
    <div className="mf-theme">
      <header className="mf-header">
        <div className="mf-shell flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
            <img
              src={logoSrc}
              alt="hoko"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = `${import.meta.env.BASE_URL}logo.png`;
              }}
              className="w-[4.2rem] h-[4.2rem] rounded-full object-contain mf-logo-enter"
            />
            <div>
              <p className="mf-wordmark mf-wordmark-enter">
                <span className="text-slate-900">h</span>oko
              </p>
              <p className="mf-tagline">Buyer-first marketplace</p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-8 text-sm text-slate-500">
            <a className="mf-link" href="#how">
              How it works
            </a>
            <a className="mf-link" href="#roles">
              Roles
            </a>
            <a className="mf-link" href="#stories">
              Insights
            </a>
            <a className="mf-link" href="#faq">
              FAQ
            </a>
            <a className="mf-link" href="#contact">
              Contact
            </a>
          </nav>

          <div className="flex w-full lg:w-auto flex-wrap items-center justify-start lg:justify-end gap-2">
            {isLoggedIn && (
              <NotificationCenter
                onNotificationClick={() =>
                  navigate(session?.role === "seller" ? "/seller/dashboard" : "/buyer/dashboard")
                }
              />
            )}

            <button
              onClick={async () => {
                localStorage.removeItem("draft_requirement_text");
                if (isLoggedIn) {
                  if (session?.role === "buyer") {
                    navigate("/buyer/dashboard");
                    return;
                  }
                  if (session?.roles?.buyer) {
                    try {
                      const res = await api.post("/auth/switch-role", {
                        role: "buyer"
                      });
                      setSession({
                        _id: res.data.user._id,
                        role: res.data.user.role,
                        roles: res.data.user.roles,
                        email: res.data.user.email,
                        city: res.data.user.city,
                        name: "Buyer",
                        preferredCurrency: res.data.user.preferredCurrency,
                        token: res.data.token
                      });
                      navigate("/buyer/dashboard");
                      return;
                    } catch {
                      alert("Unable to switch to buyer role");
                    }
                  }
                }
                navigate("/buyer/login");
              }}
              className="mf-btn text-xs sm:text-sm px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap"
            >
              {isLoggedIn ? "My Post" : "I am a Buyer"}
            </button>

            <button
              onClick={async () => {
                if (!isLoggedIn) {
                  localStorage.setItem("login_intent_role", "seller");
                  navigate("/buyer/login");
                  return;
                }
                try {
                  const res = await api.post("/auth/switch-role", {
                    role: "seller"
                  });
                  setSession({
                    _id: res.data.user._id,
                    role: res.data.user.role,
                    roles: res.data.user.roles,
                    email: res.data.user.email,
                    city: res.data.user.city,
                    name: "Seller",
                    preferredCurrency: res.data.user.preferredCurrency,
                    token: res.data.token
                  });
                  navigate("/seller/dashboard");
                } catch (err) {
                  const message = err?.response?.data?.message || "";
                  if (
                    message === "Seller onboarding required" ||
                    message === "Role not enabled"
                  ) {
                    navigate("/seller/register");
                    return;
                  }
                  alert(message || "Unable to switch role");
                }
              }}
              className="mf-btn-ghost text-xs sm:text-sm px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap"
            >
              {isLoggedIn ? "Seller's Dashboard" : "I am a Seller"}
            </button>
          </div>
        </div>
      </header>

      <main className="mf-shell pt-6 md:pt-10 pb-14 md:pb-20">
        <section className="grid gap-6 md:gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div className="space-y-4 md:space-y-6">
            <div className="mf-chip">Market-driven pricing, instantly</div>
            <h1 className="mf-title text-[1.8rem] md:text-[3rem]">
              Get the best price for what you need.
              <span className="mf-title-accent text-hoko-brand"> Let sellers compete.</span>
            </h1>
            <p className="text-slate-600 text-lg leading-relaxed">
              With{" "}
              <span className="text-slate-900 font-semibold">h</span>
              <span className="text-hoko-brand font-semibold">oko</span>, you flip the buying process. Post your exact requirement,
              receive verified offers, and pick the best value without endless
              calls or comparisons.
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              <div className="mf-pill">Fast quotes</div>
              <div className="mf-pill">Verified sellers</div>
              <div className="mf-pill">Zero spam</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="mf-stat">
                <p className="mf-stat-value">2x</p>
                <p className="mf-stat-label">Faster sourcing</p>
              </div>
              <div className="mf-stat">
                <p className="mf-stat-value">100%</p>
                <p className="mf-stat-label">Buyer free</p>
              </div>
              <div className="mf-stat">
                <p className="mf-stat-value">24/7</p>
                <p className="mf-stat-label">Active offers</p>
              </div>
            </div>
          </div>

          <div className="mf-card">
            <div className="mf-card-header">
              <h2 className="text-xl md:text-2xl font-semibold">
                What are you looking for today?
              </h2>
              <p className="text-sm text-slate-500">
                Describe quantity, location, delivery, and timeline.
              </p>
            </div>

            <textarea
              className="mf-textarea"
              rows={6}
              placeholder="Example: Need 100 cement bags in Mumbai, urgent delivery"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
            />

            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-slate-400">{text.length}/200</span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={startVoiceInput}
                  className={`w-11 h-11 rounded-full border flex items-center justify-center transition ${
                    listening
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  aria-label="Start voice input"
                  title="Start voice input"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.1A5 5 0 0 0 17 11Z" />
                  </svg>
                </button>

                <div className="text-xs text-slate-500 min-w-[120px]">
                  {listening ? "Listening..." : speechStatus || "Voice input"}
                </div>

                <button
                  onClick={submitRequirement}
                  disabled={!text.trim()}
                  className={
                    text.trim() ? "mf-btn" : "mf-btn mf-btn-disabled"
                  }
                >
                  Continue -&gt;
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              No spam. No obligation. 100% free for buyers.
            </p>
          </div>
        </section>

        <section id="how" className="mt-20">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <p className="mf-section-eyebrow">How it works</p>
              <h2 className="mf-section-title">Three steps to better pricing</h2>
            </div>
            <div className="mf-pill">Trusted sellers only</div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="mf-card-soft">
              <p className="mf-card-number">01</p>
              <h3 className="mf-card-title">Post requirement</h3>
              <p className="mf-card-body">
                Tell us what you need, quantity, and city. We broadcast to
                verified sellers.
              </p>
            </div>
            <div className="mf-card-soft">
              <p className="mf-card-number">02</p>
              <h3 className="mf-card-title">Compare offers</h3>
              <p className="mf-card-body">
                Receive multiple price and delivery options without chasing
                vendors.
              </p>
            </div>
            <div className="mf-card-soft">
              <p className="mf-card-number">03</p>
              <h3 className="mf-card-title">Choose best</h3>
              <p className="mf-card-body">
                Pick the right offer and move the deal forward with confidence.
              </p>
            </div>
          </div>
        </section>

        <section id="roles" className="mt-20">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <p className="mf-section-eyebrow">Marketplace roles</p>
              <h2 className="mf-section-title">Built for every side of trade</h2>
            </div>
            <div className="mf-pill">Switch roles instantly</div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="mf-card-soft">
              <h3 className="mf-card-title">Buyers</h3>
              <p className="mf-card-body">
                Post once, get multiple quotes, and choose the best value without
                noise.
              </p>
              <p className="mf-card-meta">Free to post requirements</p>
            </div>
            <div className="mf-card-soft">
              <h3 className="mf-card-title">Sellers</h3>
              <p className="mf-card-body">
                Respond to qualified demand, manage offers, and win more orders
                faster.
              </p>
              <p className="mf-card-meta">Verified onboarding only</p>
            </div>
            <div className="mf-card-soft">
              <h3 className="mf-card-title">Admins</h3>
              <p className="mf-card-body">
                Monitor activity, validate sellers, and keep the marketplace
                trustworthy.
              </p>
              <p className="mf-card-meta">Real-time oversight</p>
            </div>
          </div>
        </section>

        <section id="stories" className="mt-20">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <p className="mf-section-eyebrow">Insights</p>
              <h2 className="mf-section-title">Smarter sourcing stories</h2>
            </div>
            <div className="mf-pill">Weekly marketplace intel</div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="mf-card-soft">
              <p className="mf-card-meta">Playbook</p>
              <h3 className="mf-card-title">Price discovery without burnout</h3>
              <p className="mf-card-body">
                Learn how to set clear requirements that attract the best offers.
              </p>
            </div>
            <div className="mf-card-soft">
              <p className="mf-card-meta">Operations</p>
              <h3 className="mf-card-title">Vendor vetting at scale</h3>
              <p className="mf-card-body">
                Keep quality high with structured screening and response scoring.
              </p>
            </div>
            <div className="mf-card-soft">
              <p className="mf-card-meta">Growth</p>
              <h3 className="mf-card-title">Winning repeat suppliers</h3>
              <p className="mf-card-body">
                Build long-term partnerships from a single successful request.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="mt-20">
          <div>
            <p className="mf-section-eyebrow">FAQ</p>
            <h2 className="mf-section-title">Answers for new buyers</h2>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="mf-card-soft">
              <h3 className="mf-card-title">Is hoko free for buyers?</h3>
              <p className="mf-card-body">Yes, posting requirements is free.</p>
            </div>
            <div className="mf-card-soft">
              <h3 className="mf-card-title">How are sellers verified?</h3>
              <p className="mf-card-body">
                We review seller profiles and documents before approval.
              </p>
            </div>
            <div className="mf-card-soft">
              <h3 className="mf-card-title">Can I edit or delete a post?</h3>
              <p className="mf-card-body">
                Yes, you can edit or remove posts from your dashboard.
              </p>
            </div>
            <div className="mf-card-soft">
              <h3 className="mf-card-title">What if I need urgent delivery?</h3>
              <p className="mf-card-body">
                Add your timeline to the requirement so sellers can respond
                faster.
              </p>
            </div>
          </div>
        </section>

        <section id="contact" className="mt-20">
          <div className="mf-cta">
            <div>
              <p className="mf-section-eyebrow">Contact</p>
              <h2 className="mf-section-title">Need help right away?</h2>
            <p className="text-slate-600 mt-2">
                Email support@hoko.app or call +91-90000-00000.
              </p>
            </div>
            <button className="mf-btn">Talk to support</button>
          </div>
        </section>
      </main>
    </div>
  );
}
