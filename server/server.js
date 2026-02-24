const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const ChatMessage = require("./models/ChatMessage");
const Notification = require("./models/Notification");
const Requirement = require("./models/Requirement");
const Offer = require("./models/Offer");
const User = require("./models/User");
const auth = require("./middleware/auth");
const { getModerationRules, checkTextForFlags } = require("./utils/moderation");
const {
  extractStoredRequirementFilename,
  extractAttachmentAliases,
  displayNameFromStoredFilename,
  resolveAttachmentFilenameOnDisk
} = require("./utils/attachments");

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

const SOCKET_AUTH_TELEMETRY_MAX_RECENT = 50;
const SOCKET_AUTH_SUMMARY_INTERVAL_MS = Number(
  process.env.SOCKET_AUTH_SUMMARY_INTERVAL_MS || 300000
);
const socketAuthTelemetry = {
  totalFailures: 0,
  reasons: {},
  recent: [],
  lastFailureAt: null
};

function getSocketClientIp(socket) {
  const forwarded = String(
    socket?.handshake?.headers?.["x-forwarded-for"] || ""
  ).split(",")[0].trim();
  const ip = forwarded || socket?.handshake?.address || "unknown-ip";
  return String(ip || "unknown-ip");
}

function recordSocketAuthFailure(reason, socket) {
  const failureReason = String(reason || "unknown_reason");
  const ip = getSocketClientIp(socket);
  const userAgent = String(
    socket?.handshake?.headers?.["user-agent"] || "unknown"
  ).slice(0, 180);
  const at = new Date().toISOString();

  socketAuthTelemetry.totalFailures += 1;
  socketAuthTelemetry.lastFailureAt = at;
  socketAuthTelemetry.reasons[failureReason] =
    Number(socketAuthTelemetry.reasons[failureReason] || 0) + 1;

  socketAuthTelemetry.recent.push({
    at,
    reason: failureReason,
    ip,
    userAgent
  });
  if (socketAuthTelemetry.recent.length > SOCKET_AUTH_TELEMETRY_MAX_RECENT) {
    socketAuthTelemetry.recent.shift();
  }

  console.warn("[socket_auth_failure]", {
    at,
    reason: failureReason,
    ip,
    userAgent
  });
}

function extractSocketToken(socket) {
  const authToken = String(socket?.handshake?.auth?.token || "").trim();
  if (authToken) return authToken;

  const authHeader = String(
    socket?.handshake?.headers?.authorization ||
      socket?.handshake?.auth?.authorization ||
      ""
  ).trim();
  if (/^bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^bearer\s+/i, "").trim();
  }

  const queryToken = String(socket?.handshake?.query?.token || "").trim();
  if (queryToken) return queryToken;

  return "";
}

io.use(async (socket, next) => {
  try {
    const token = extractSocketToken(socket);
    if (!token) {
      recordSocketAuthFailure("missing_token", socket);
      return next(new Error("Socket auth required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      "_id roles blocked tokenVersion"
    );
    if (!user) {
      recordSocketAuthFailure("invalid_user", socket);
      return next(new Error("Socket auth invalid user"));
    }
    if (user.blocked) {
      recordSocketAuthFailure("blocked_user", socket);
      return next(new Error("Socket auth blocked user"));
    }

    const decodedVersion =
      typeof decoded?.tokenVersion === "number"
        ? decoded.tokenVersion
        : Number(decoded?.tokenVersion || 0);
    const userVersion = Number(user.tokenVersion || 0);
    if (decodedVersion !== userVersion) {
      recordSocketAuthFailure("token_version_mismatch", socket);
      return next(new Error("Socket auth token expired"));
    }

    socket.data.userId = String(user._id);
    socket.data.userRoles = user.roles || {};
    return next();
  } catch {
    recordSocketAuthFailure("jwt_verify_failed", socket);
    return next(new Error("Socket auth failed"));
  }
});

setInterval(() => {
  if (socketAuthTelemetry.totalFailures === 0) return;
  console.warn("[socket_auth_failure_summary]", {
    totalFailures: socketAuthTelemetry.totalFailures,
    reasons: socketAuthTelemetry.reasons,
    lastFailureAt: socketAuthTelemetry.lastFailureAt
  });
}, SOCKET_AUTH_SUMMARY_INTERVAL_MS).unref();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  const currentUserId = String(socket.data?.userId || "");
  if (currentUserId) {
    socket.join(currentUserId);
  }

  // Join user-specific room
  socket.on("join", () => {
    if (currentUserId) {
      socket.join(currentUserId);
      console.log("Joined room:", currentUserId);
    }
  });

  // Buyer viewed offer -> notify seller
  socket.on("buyer_viewed_offer", ({ sellerId, product }) => {
    if (socket.data?.userRoles?.buyer && currentUserId && sellerId && product) {
      const message = `Buyer viewed your offer for ${product}`;
      Notification.create({
        userId: sellerId,
        fromUserId: currentUserId,
        message,
        type: "offer_viewed"
      }).then((notif) => {
        io.to(String(sellerId)).emit("notification", notif);
      });
    }
  });

  // Reverse auction invite -> notify seller
  socket.on("reverse_auction_invite", ({ sellerId, product, lowestPrice }) => {
    if (socket.data?.userRoles?.buyer && currentUserId && sellerId && product && lowestPrice) {
      const message = `Reverse auction started for ${product}. Current lowest price: Rs ${lowestPrice}. Can you beat it?`;
      Notification.create({
        userId: sellerId,
        fromUserId: currentUserId,
        message,
        type: "reverse_auction"
      }).then((notif) => {
        io.to(String(sellerId)).emit("notification", notif);
      });
    }
  });

  // Message relay + DB save
  socket.on("send_message", async ({ toUserId, message, requirementId, to, tempId }, ack) => {
    const effectiveFrom = currentUserId;
    const effectiveTo = toUserId || to;
    const ackFn = typeof ack === "function" ? ack : null;
    if (!effectiveFrom) {
      if (ackFn) {
        ackFn({ ok: false, error: "Socket not authenticated" });
      }
      return;
    }
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
          messageType: "text",
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
        messageType: savedMessage?.messageType || "text",
        attachment: savedMessage?.attachment || null,
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

  socket.on("mark_messages_read", async ({ requirementId, peerUserId }, ack) => {
    const ackFn = typeof ack === "function" ? ack : null;
    const readerId = currentUserId;
    if (!requirementId || !readerId || !peerUserId) {
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
          toUserId: readerId,
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
        byUserId: readerId,
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
  }).select("_id buyerId attachments");

  if (!requirement) {
    return res.status(404).json({ message: "File not found" });
  }

  const requesterId = String(req.user?._id || "");
  const buyerId = String(requirement.buyerId || "");
  if (requesterId !== buyerId && !req.user?.roles?.seller && !req.user?.roles?.admin) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const requested = safeName.toLowerCase();
  const attachments = Array.isArray(requirement.attachments) ? requirement.attachments : [];
  let resolvedFilename = safeName;

  const matchedAttachment = attachments.find((attachment) => {
    const aliases = extractAttachmentAliases(attachment);
    return aliases.has(requested);
  });

  if (matchedAttachment) {
    const storedName = extractStoredRequirementFilename(matchedAttachment);
    if (storedName) {
      resolvedFilename = storedName;
    }
  }

  if (!matchedAttachment && attachments.length > 0) {
    const suffixMatch = attachments
      .map((attachment) => extractStoredRequirementFilename(attachment))
      .find((stored) => {
        const lower = String(stored || "").toLowerCase();
        return lower === requested || lower.endsWith(`_${requested}`);
      });
    if (suffixMatch) {
      resolvedFilename = suffixMatch;
    } else if (attachments.length === 1) {
      const single = extractStoredRequirementFilename(attachments[0]);
      if (single) {
        const singleDisplay = displayNameFromStoredFilename(single).toLowerCase();
        if (singleDisplay && singleDisplay === requested) {
          resolvedFilename = single;
        }
      }
    }
  }

  const diskFilename =
    resolveAttachmentFilenameOnDisk(path.join(__dirname, "uploads", "requirements"), {
      preferredFilename: resolvedFilename,
      requestedFilename: safeName,
      buyerId
    }) || path.basename(resolvedFilename);
  const filePath = path.join(__dirname, "uploads", "requirements", diskFilename);
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
