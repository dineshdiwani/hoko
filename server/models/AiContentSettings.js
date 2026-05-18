const mongoose = require("mongoose");

const aiContentSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    fixedCta: { type: String, default: "Learn More" },
    ctaLink: { type: String, default: "" },
    aiProvider: {
      type: String,
      enum: ["gemini", "openai", "fallback"],
      default: "gemini"
    },
    imageProvider: {
      type: String,
      enum: ["gemini", "modelslab", "none"],
      default: "modelslab"
    },
    generationEnabled: { type: Boolean, default: false },
    approvalRequired: { type: Boolean, default: true },
    autoBufferEnabled: { type: Boolean, default: false },
    autoBufferChannelIds: [{ type: String }],
    autoBufferMode: {
      type: String,
      enum: ["shareNow", "shareNext", "customScheduled", "addToQueue"],
      default: "addToQueue"
    },
    autoBufferDelayMinutes: { type: Number, default: 30, min: 0, max: 10080 },
    autoBufferPostType: {
      type: String,
      enum: ["post", "story", "reel"],
      default: "post"
    },
    autoPlatformSettings: {
      facebook: {
        enabled: { type: Boolean, default: false },
        intervalMinutes: { type: Number, default: 1440, min: 5, max: 10080 },
        triggerTime: { type: String, default: "09:00" },
        channelIds: [{ type: String }],
        mode: {
          type: String,
          enum: ["shareNow", "shareNext", "customScheduled", "addToQueue"],
          default: "addToQueue"
        },
        delayMinutes: { type: Number, default: 30, min: 0, max: 10080 },
        postType: {
          type: String,
          enum: ["post", "story", "reel"],
          default: "post"
        },
        lastRunAt: { type: Date, default: null }
      },
      instagram: {
        enabled: { type: Boolean, default: false },
        intervalMinutes: { type: Number, default: 1440, min: 5, max: 10080 },
        triggerTime: { type: String, default: "09:00" },
        channelIds: [{ type: String }],
        mode: {
          type: String,
          enum: ["shareNow", "shareNext", "customScheduled", "addToQueue"],
          default: "addToQueue"
        },
        delayMinutes: { type: Number, default: 30, min: 0, max: 10080 },
        postType: {
          type: String,
          enum: ["post", "story", "reel"],
          default: "post"
        },
        lastRunAt: { type: Date, default: null }
      },
      linkedin: {
        enabled: { type: Boolean, default: false },
        intervalMinutes: { type: Number, default: 1440, min: 5, max: 10080 },
        triggerTime: { type: String, default: "09:00" },
        channelIds: [{ type: String }],
        mode: {
          type: String,
          enum: ["shareNow", "shareNext", "customScheduled", "addToQueue"],
          default: "addToQueue"
        },
        delayMinutes: { type: Number, default: 30, min: 0, max: 10080 },
        postType: {
          type: String,
          enum: ["post", "story", "reel"],
          default: "post"
        },
        lastRunAt: { type: Date, default: null }
      }
    },
    maxDraftsPerRun: { type: Number, default: 3, min: 1, max: 20 },
    cronIntervalMinutes: { type: Number, default: 60, min: 5, max: 1440 },
    brandInstructions: { type: String, default: "" },
    blockedWords: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiContentSettings", aiContentSettingsSchema);
