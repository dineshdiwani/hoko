const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const ChatMessage = require("./models/ChatMessage");
const Notification = require("./models/Notification");
const Requirement = require("./models/Requirement");
const Offer = require("./models/Offer");
const User = require("./models/User");
const auth = require("./middleware/auth");
const { getModerationRules, checkTextForFlags } = require("./utils/moderation");

dotenv.config();

const app = express();
const server = http.createServer(app);
const isProduction = process.env.NODE_ENV === "production";
// Behind Nginx/PM2 in production, trust the first proxy hop so req.ip works
// correctly for express-rate-limit and auth logging.
app.set("trust proxy", isProduction ? 1 : false);
const localDevOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
];
const productionDefaultOrigins = [
  "https://hokoapp.in",
  "https://www.hokoapp.in"
];
const configuredClientOrigins = String(process.env.CLIENT_URL || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const configuredCorsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(
  new Set(
    isProduction
      ? [
          ...productionDefaultOrigins,
          ...configuredClientOrigins,
          ...configuredCorsOrigins
        ]
      : [
          ...localDevOrigins,
          ...productionDefaultOrigins,
          ...configuredClientOrigins,
          ...configuredCorsOrigins
        ]
  )
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https:\/\/(www\.)?hokoapp\.in$/i.test(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
};

/* -------------------- MIDDLEWARE (ORDER MATTERS) -------------------- */
app.use(cors(corsOptions));
app.use(express.json());
app.use(helmet());

/* -------------------- SOCKET.IO -------------------- */
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Join user-specific room
  socket.on("join", (userId) => {
    if (userId) {
      socket.join(String(userId));
      console.log("Joined room:", userId);
    }
  });

  // Buyer viewed offer -> notify seller
  socket.on("buyer_viewed_offer", ({ sellerId, product }) => {
    if (sellerId && product) {
      const message = `Buyer viewed your offer for ${product}`;
      Notification.create({
        userId: sellerId,
        message,
        type: "offer_viewed"
      }).then((notif) => {
        io.to(String(sellerId)).emit("notification", notif);
      });
    }
  });

  // Reverse auction invite -> notify seller
  socket.on("reverse_auction_invite", ({ sellerId, product, lowestPrice }) => {
    if (sellerId && product && lowestPrice) {
      const message = `Reverse auction started for ${product}. Current lowest price: Rs ${lowestPrice}. Can you beat it?`;
      Notification.create({
        userId: sellerId,
        message,
        type: "reverse_auction"
      }).then((notif) => {
        io.to(String(sellerId)).emit("notification", notif);
      });
    }
  });

  // Message relay + DB save
  socket.on("send_message", async ({ toUserId, message, fromUserId, requirementId, to, from, tempId }, ack) => {
    const effectiveFrom = fromUserId || from;
    const effectiveTo = toUserId || to;
    const ackFn = typeof ack === "function" ? ack : null;
    console.log("Message:", { from: effectiveFrom, to: effectiveTo, message });
    let allowedToSend = true;
    let savedMessage = null;
    let toUserDoc = null;

    // Save to DB (best effort)
    try {
      if (requirementId && effectiveFrom && effectiveTo) {
        const [fromUser, toUser, requirement, rules] = await Promise.all([
          User.findById(effectiveFrom),
          User.findById(effectiveTo),
          Requirement.findById(requirementId),
          getModerationRules()
        ]);
        toUserDoc = toUser;

        if (fromUser?.chatDisabled || toUser?.chatDisabled) {
          allowedToSend = false;
        }
        if (requirement?.chatDisabled) {
          allowedToSend = false;
        }

        if (!requirement) {
          allowedToSend = false;
        }

        if (allowedToSend && requirement) {
          const buyerId = String(requirement.buyerId || "");
          const fromId = String(effectiveFrom);
          const toId = String(effectiveTo);
          const involvesBuyer = fromId === buyerId || toId === buyerId;

          if (!involvesBuyer) {
            allowedToSend = false;
          } else {
            const sellerId = fromId === buyerId ? toId : fromId;
            const offer = await Offer.findOne({
              requirementId,
              sellerId,
              "moderation.removed": { $ne: true }
            }).select("contactEnabledByBuyer");

            if (!offer || offer.contactEnabledByBuyer !== true) {
              allowedToSend = false;
            }
          }
        }

        if (!allowedToSend) {
          if (ackFn) {
            ackFn({ ok: false, error: "Buyer has not enabled chat for this post yet" });
          }
          return;
        }

        const flaggedReason = checkTextForFlags(message || "", rules);
        savedMessage = await ChatMessage.create({
          requirementId,
          fromUserId: effectiveFrom,
          toUserId: effectiveTo,
          message,
          moderation: flaggedReason
            ? {
                flagged: true,
                flaggedAt: new Date(),
                flaggedReason
              }
            : undefined
        });
      }
    } catch (err) {
      console.warn("Chat save failed, continuing:", err.message);
      if (ackFn) {
        ackFn({ ok: false, error: "Failed to save message" });
      }
      return;
    }

    // Emit to recipient
    if (allowedToSend) {
      const payload = {
        _id: savedMessage?._id,
        requirementId,
        fromUserId: effectiveFrom,
        toUserId: effectiveTo,
        message,
        isRead: false,
        readAt: null,
        createdAt: savedMessage?.createdAt || new Date().toISOString(),
        tempId: tempId || null
      };

      try {
        const messagePreview = String(message || "").trim();
        const shortened =
          messagePreview.length > 120
            ? `${messagePreview.slice(0, 117)}...`
            : messagePreview;
        const chatNotificationsEnabled =
          !toUserDoc?.roles?.buyer ||
          toUserDoc?.buyerSettings?.notificationToggles?.chat !== false;

        if (chatNotificationsEnabled) {
          const notif = await Notification.create({
            userId: effectiveTo,
            fromUserId: effectiveFrom,
            requirementId: requirementId || null,
            type: "new_message",
            message: `New message: ${shortened || "Open chat to view message"}`
          });
          io.to(String(effectiveTo)).emit("notification", notif);
        }
      } catch (err) {
        console.warn("Notification create failed:", err.message);
      }

      io.to(String(effectiveTo)).emit("receive_message", payload);

      if (ackFn) {
        ackFn({ ok: true, message: payload });
      }
    }
  });

  socket.on("mark_messages_read", async ({ requirementId, readerUserId, peerUserId }, ack) => {
    const ackFn = typeof ack === "function" ? ack : null;
    if (!requirementId || !readerUserId || !peerUserId) {
      if (ackFn) {
        ackFn({ ok: false, error: "Missing data" });
      }
      return;
    }

    try {
      const now = new Date();
      const result = await ChatMessage.updateMany(
        {
          requirementId,
          fromUserId: peerUserId,
          toUserId: readerUserId,
          isRead: false,
          "moderation.removed": { $ne: true }
        },
        {
          $set: {
            isRead: true,
            readAt: now
          }
        }
      );

      io.to(String(peerUserId)).emit("messages_read", {
        requirementId,
        byUserId: readerUserId,
        peerUserId,
        readAt: now.toISOString()
      });

      if (ackFn) {
        ackFn({ ok: true, updated: result.modifiedCount || 0, readAt: now.toISOString() });
      }
    } catch (err) {
      if (ackFn) {
        ackFn({ ok: false, error: "Failed to mark messages as read" });
      }
    }
  });

  // Disconnect logging with reason
  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", socket.id, "Reason:", reason);
  });

  // Optional: heartbeat logging (for debugging ping/pong issues)
  socket.on("ping", () => {
    socket.emit("pong");
  });
});

/* -------------------- DATABASE -------------------- */
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    family: 4, // Prefer IPv4 (helps on some networks)
  })
  .then(async () => {
    console.log("MongoDB connected");
    // Drop legacy unique index on mobile to avoid duplicate-null signup failures.
    try {
      const indexes = await mongoose.connection
        .db
        .collection("users")
        .indexes();
      const hasMobileIndex = indexes.some((i) => i.name === "mobile_1");
      if (hasMobileIndex) {
        await mongoose.connection
          .db
          .collection("users")
          .dropIndex("mobile_1");
        console.log("Dropped legacy users.mobile_1 index");
      }
    } catch (err) {
      console.warn("Legacy index cleanup skipped:", err.message);
    }
  })
  .catch((err) => console.error("MongoDB error:", err));

/* -------------------- ROUTES -------------------- */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/buyer", require("./routes/buyer"));
app.use("/api/seller", require("./routes/seller"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin/analytics", require("./routes/adminAnalytics"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/chat-files", require("./routes/chatFiles"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/meta", require("./routes/meta"));
app.use("/api/admin-auth", require("./routes/adminAuth"));
app.use("/api/admin", require("./routes/adminStats"));

app.get("/uploads/requirements/:filename", auth, async (req, res) => {
  const safeName = path.basename(String(req.params.filename || ""));
  const relativeUrl = `/uploads/requirements/${safeName}`;
  const escapedName = safeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const requirement = await Requirement.findOne({
    $or: [
      { attachments: relativeUrl },
      { attachments: safeName },
      { attachments: { $regex: `${escapedName}$`, $options: "i" } },
      { "attachments.url": relativeUrl },
      { "attachments.url": { $regex: `${escapedName}$`, $options: "i" } },
      { "attachments.path": relativeUrl },
      { "attachments.path": { $regex: `${escapedName}$`, $options: "i" } },
      { "attachments.filename": safeName },
      { "attachments.filename": { $regex: `${escapedName}$`, $options: "i" } }
    ],
    "moderation.removed": { $ne: true }
  }).select("_id buyerId");

  if (!requirement) {
    return res.status(404).json({ message: "File not found" });
  }

  const requesterId = String(req.user?._id || "");
  const buyerId = String(requirement.buyerId || "");
  if (requesterId !== buyerId && !req.user?.roles?.seller && !req.user?.roles?.admin) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const filePath = path.join(__dirname, "uploads", "requirements", safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  return res.sendFile(filePath);
});

app.get("/uploads/buyer-documents/:filename", auth, async (req, res) => {
  const safeName = path.basename(String(req.params.filename || ""));
  const owner = await User.findOne({
    "buyerSettings.documents.filename": safeName
  }).select("_id buyerSettings.documents");

  if (!owner) {
    return res.status(404).json({ message: "File not found" });
  }

  const doc = (owner.buyerSettings?.documents || []).find(
    (item) => String(item.filename || "") === safeName
  );
  if (!doc) {
    return res.status(404).json({ message: "File not found" });
  }

  const requesterId = String(req.user?._id || "");
  const ownerId = String(owner._id || "");
  const visibleToSellerId = doc.visibleToSellerId ? String(doc.visibleToSellerId) : "";
  const visibleSellerAllowed =
    requesterId === visibleToSellerId && req.user?.roles?.seller === true;

  if (
    requesterId !== ownerId &&
    !visibleSellerAllowed &&
    !req.user?.roles?.admin
  ) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const filePath = path.join(__dirname, "uploads", "buyer-documents", safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  return res.sendFile(filePath);
});

/* -------------------- GLOBAL ERROR HANDLER -------------------- */
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ message: "Internal server error" });
});

/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
