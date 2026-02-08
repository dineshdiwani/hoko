const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const helmet = require("helmet");
const ChatMessage = require("./models/ChatMessage");




dotenv.config();

const app = express();
const server = http.createServer(app);

/* -------------------- MIDDLEWARE (ORDER MATTERS) -------------------- */
app.use(cors());
app.use(express.json());
app.use(helmet());

/* -------------------- SOCKET.IO -------------------- */
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",  // Add .env var for prod
    methods: ["GET", "POST"],
    credentials: true  // If using auth cookies/JWT
  }
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(String(userId));
    console.log("👤 Joined room:", userId);

socket.on("buyer_viewed_offer", ({ sellerId, product }) => {
  console.log("👀 Buyer viewed offer:", sellerId, product);

socket.on(
  "reverse_auction_invite",
  ({ sellerId, product, lowestPrice }) => {
    io.to(String(sellerId)).emit(
      "seller_notification",
      {
        message: `⚡ Reverse auction started for ${product}. Current lowest price: ₹${lowestPrice}. Can you beat it?`,
        timestamp: Date.now(),
        type: "reverse_auction",
      }
    );
  }
);

  io.to(String(sellerId)).emit("seller_notification", {
    message: `👀 Buyer viewed your offer for ${product}`,
    timestamp: Date.now(),
  });
});
  });

  // 🔁 MESSAGE RELAY
  socket.on("send_message", async ({ to, message, from }) => {
    console.log("💬 Message:", { from, to, message });

    // 🔐 Save to DB (best effort)
    try {
      await ChatMessage.create({ from, to, message });
    } catch (err) {
      console.warn("⚠️ Chat save failed, continuing:", err.message);
    }

 io.to(String(to)).emit("receive_message", {
      from,
      message,
      time: new Date().toISOString(),
    });
  });

 socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
}); 
/* -------------------- DATABASE -------------------- */

mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })  // Add timeout for reliability
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));


/* -------------------- ROUTES -------------------- */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/buyer", require("./routes/buyer"));
app.use("/api/seller", require("./routes/seller"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin/analytics", require("./routes/adminAnalytics"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/chat-files", require("./routes/chatFiles"));
app.use("/uploads", express.static("uploads"));
app.use("/api/admin-auth", require("./routes/adminAuth"));
app.use("/api/admin", require("./routes/adminStats"));




/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
