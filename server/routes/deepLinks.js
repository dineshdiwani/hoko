const express = require("express");
const auth = require("../middleware/auth");
const DeepLinkContext = require("../models/DeepLinkContext");

const router = express.Router();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeInternalPath(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  return raw.startsWith("/") ? raw : "";
}

function normalizeQuery(query) {
  if (!query || typeof query !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(query)) {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(value);
    if (normalizedKey && normalizedValue) {
      out[normalizedKey] = normalizedValue;
    }
  }
  return out;
}

function normalizeActionType(value) {
  return normalizeText(value || "generic").toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "generic";
}

function normalizeExpiresAt(expiresInMs) {
  const ttl = Math.max(60 * 1000, Number(expiresInMs) || 7 * 24 * 60 * 60 * 1000);
  return new Date(Date.now() + ttl);
}

router.get("/context/active", auth, async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "No user" });
    }

    const now = new Date();
    const contexts = await DeepLinkContext.find({
      userId,
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    res.json({
      contexts: contexts.map((ctx) => ({
        _id: ctx._id,
        actionType: ctx.actionType,
        role: ctx.role,
        source: ctx.source,
        path: ctx.path,
        query: ctx.query || {},
        metadata: ctx.metadata || {},
        createdAt: ctx.createdAt,
        updatedAt: ctx.updatedAt,
        expiresAt: ctx.expiresAt
      }))
    });
  } catch (err) {
    console.error("[DeepLink] active fetch failed:", err?.message || err);
    res.status(500).json({ message: "Failed to load deep link context" });
  }
});

router.post("/context", auth, async (req, res) => {
  try {
    const {
      path,
      source = "",
      role = "",
      query = {},
      metadata = {},
      actionType = "generic",
      identityKey = "",
      expiresInMs
    } = req.body || {};

    const normalizedPath = normalizeInternalPath(path);
    if (!normalizedPath) {
      return res.status(400).json({ message: "path required" });
    }

    const normalizedActionType = normalizeActionType(actionType);
    const normalizedIdentityKey = normalizeText(identityKey).toLowerCase();
    const update = {
      userId: req.user._id,
      identityKey: normalizedIdentityKey,
      actionType: normalizedActionType,
      role: normalizeText(role),
      source: normalizeText(source),
      path: normalizedPath,
      query: normalizeQuery(query),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      status: "active",
      consumedAt: null,
      expiresAt: normalizeExpiresAt(expiresInMs)
    };

    const context = await DeepLinkContext.findOneAndUpdate(
      {
        userId: req.user._id,
        actionType: normalizedActionType,
        path: normalizedPath
      },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      ok: true,
      context: {
        _id: context._id,
        actionType: context.actionType,
        role: context.role,
        source: context.source,
        path: context.path,
        query: context.query || {},
        metadata: context.metadata || {},
        expiresAt: context.expiresAt
      }
    });
  } catch (err) {
    console.error("[DeepLink] save failed:", err?.message || err);
    res.status(500).json({ message: "Failed to save deep link context" });
  }
});

router.post("/context/consume", auth, async (req, res) => {
  try {
    const { path = "", actionType = "" } = req.body || {};
    const normalizedPath = normalizeInternalPath(path);
    const normalizedActionType = normalizeActionType(actionType || "generic");

    const update = {
      status: "consumed",
      consumedAt: new Date()
    };

    const query = {
      userId: req.user._id,
      status: "active"
    };
    if (normalizedPath) query.path = normalizedPath;
    if (normalizedActionType) query.actionType = normalizedActionType;

    const result = await DeepLinkContext.updateMany(query, { $set: update });
    res.json({ ok: true, matched: result.matchedCount || result.n || 0 });
  } catch (err) {
    console.error("[DeepLink] consume failed:", err?.message || err);
    res.status(500).json({ message: "Failed to consume deep link context" });
  }
});

module.exports = router;
