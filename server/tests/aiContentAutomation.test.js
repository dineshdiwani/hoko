const assert = require("node:assert/strict");
const test = require("node:test");

const {
  wakeAiContentScheduler,
  _private: {
    getChannelCaption,
    getDuePlatformProfiles,
    getEnabledPlatformProfiles,
    getLastScheduledTriggerAt,
    getPlatformSettings,
    getSchedulerIntervalMs,
    getSuccessfulPlatformsFromResults,
    getTimeZoneParts,
    getTargetPlatforms,
    getWakeDelayMs,
    normalizeChannelService
  }
} = require("../services/aiContentScheduler");
const {
  _private: {
    mergeAutoPlatformLastRunAt
  }
} = require("../routes/aiContent");

function withMockedDate(isoDate, fn) {
  const RealDate = Date;
  const fixedTime = new RealDate(isoDate).getTime();

  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedTime);
        return;
      }
      super(...args);
    }

    static now() {
      return fixedTime;
    }
  }

  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;
  global.Date = MockDate;
  try {
    return fn();
  } finally {
    global.Date = RealDate;
  }
}

function settingsWithProfiles(profileOverrides = {}) {
  const baseProfile = {
    enabled: true,
    intervalMinutes: 1440,
    triggerTime: "23:35",
    triggerDay: 1,
    channelIds: [],
    mode: "addToQueue",
    delayMinutes: 30,
    postType: "post",
    lastRunAt: null
  };

  return {
    autoBufferEnabled: false,
    autoBufferChannelIds: ["legacy-channel"],
    autoBufferMode: "shareNext",
    autoBufferDelayMinutes: 45,
    autoBufferPostType: "post",
    cronIntervalMinutes: 60,
    autoPlatformSettings: {
      facebook: { ...baseProfile, channelIds: ["fb-1"], ...(profileOverrides.facebook || {}) },
      instagram: { ...baseProfile, channelIds: ["ig-1"], ...(profileOverrides.instagram || {}) },
      linkedin: { ...baseProfile, channelIds: ["li-1"], ...(profileOverrides.linkedin || {}) }
    }
  };
}

test("automation profile normalization preserves all three social channels", () => {
  const profiles = getPlatformSettings(settingsWithProfiles({
    facebook: { triggerTime: "99:99", intervalMinutes: 999, mode: "bad-mode" },
    instagram: { triggerTime: "11:35", intervalMinutes: 720, postType: "story" },
    linkedin: { intervalMinutes: 10080, triggerDay: 5, mode: "customScheduled", delayMinutes: 90 }
  }));

  assert.deepEqual(Object.keys(profiles), ["facebook", "instagram", "linkedin"]);
  assert.equal(profiles.facebook.triggerTime, "09:00");
  assert.equal(profiles.facebook.intervalMinutes, 1440);
  assert.equal(profiles.facebook.mode, "addToQueue");
  assert.equal(profiles.instagram.triggerTime, "11:35");
  assert.equal(profiles.instagram.intervalMinutes, 720);
  assert.equal(profiles.instagram.postType, "story");
  assert.equal(profiles.linkedin.intervalMinutes, 10080);
  assert.equal(profiles.linkedin.triggerDay, 5);
  assert.equal(profiles.linkedin.mode, "customScheduled");
});

test("scheduler polls every five minutes when any platform auto mode is enabled", () => {
  assert.equal(getSchedulerIntervalMs({ cronIntervalMinutes: 60, autoPlatformSettings: {} }), 60 * 60000);
  assert.equal(getSchedulerIntervalMs(settingsWithProfiles()), 5 * 60000);
  assert.equal(getSchedulerIntervalMs({ cronIntervalMinutes: 2, autoBufferEnabled: true }), 5 * 60000);
});

test("forced auto-post can use enabled platforms even when none are due", () => {
  const settings = settingsWithProfiles({
    facebook: { lastRunAt: "2026-05-19T23:36:00+05:30" },
    instagram: { lastRunAt: "2026-05-19T23:36:00+05:30" },
    linkedin: { enabled: false }
  });

  withMockedDate("2026-05-19T23:40:00+05:30", () => {
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), []);
    assert.deepEqual(getEnabledPlatformProfiles(settings).map((item) => item.platform), ["facebook", "instagram"]);
  });
});

test("scheduler wake function is safe before the background scheduler starts", () => {
  assert.doesNotThrow(() => wakeAiContentScheduler(settingsWithProfiles()));
  assert.equal(getWakeDelayMs(settingsWithProfiles(), 0), 0);
  assert.equal(getWakeDelayMs(settingsWithProfiles(), 120000), 120000);
  assert.equal(getWakeDelayMs(settingsWithProfiles(), 600000), 5 * 60000);
});

test("daily trigger at 11:35 PM becomes due after trigger and not before", () => {
  withMockedDate("2026-05-19T23:34:59+05:30", () => {
    const settings = settingsWithProfiles({
      facebook: { lastRunAt: "2026-05-19T23:34:00+05:30" },
      instagram: { lastRunAt: "2026-05-19T23:34:00+05:30" },
      linkedin: { lastRunAt: "2026-05-19T23:34:00+05:30" }
    });
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), []);
  });

  withMockedDate("2026-05-19T23:35:00+05:30", () => {
    const settings = settingsWithProfiles({
      facebook: { lastRunAt: "2026-05-19T23:34:00+05:30" },
      instagram: { lastRunAt: "2026-05-19T23:34:00+05:30" },
      linkedin: { lastRunAt: "2026-05-19T23:34:00+05:30" }
    });
    assert.deepEqual(
      getDuePlatformProfiles(settings).map((item) => item.platform),
      ["facebook", "instagram", "linkedin"]
    );
  });
});

test("daily trigger uses India time instead of server UTC time", () => {
  const settings = settingsWithProfiles({
    facebook: { triggerTime: "13:21", lastRunAt: "2026-05-19T13:20:00+05:30" },
    instagram: { enabled: false },
    linkedin: { enabled: false }
  });

  withMockedDate("2026-05-19T07:50:59.000Z", () => {
    assert.equal(getTimeZoneParts(new Date()).hour, 13);
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), []);
  });

  withMockedDate("2026-05-19T07:51:00.000Z", () => {
    assert.equal(getTimeZoneParts(new Date()).hour, 13);
    assert.equal(getTimeZoneParts(new Date()).minute, 21);
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), ["facebook"]);
  });
});


test("lastRunAt prevents duplicate posts for the same scheduled trigger", () => {
  withMockedDate("2026-05-19T23:40:00+05:30", () => {
    const triggerAt = getLastScheduledTriggerAt({ triggerTime: "23:35", intervalMinutes: 1440 }).toISOString();
    const settings = settingsWithProfiles({
      facebook: { lastRunAt: triggerAt },
      instagram: { lastRunAt: "2026-05-19T23:34:59+05:30" },
      linkedin: { lastRunAt: null }
    });

    assert.deepEqual(
      getDuePlatformProfiles(settings).map((item) => item.platform),
      ["instagram", "linkedin"]
    );
  });
});

test("twelve-hour frequency uses first trigger and second trigger correctly", () => {
  withMockedDate("2026-05-19T11:36:00+05:30", () => {
    const settings = settingsWithProfiles({
      facebook: { intervalMinutes: 720, triggerTime: "11:35" },
      instagram: { enabled: false },
      linkedin: { enabled: false }
    });
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), ["facebook"]);
  });

  withMockedDate("2026-05-19T23:36:00+05:30", () => {
    const settings = settingsWithProfiles({
      facebook: { intervalMinutes: 720, triggerTime: "11:35", lastRunAt: "2026-05-19T11:35:01+05:30" },
      instagram: { enabled: false },
      linkedin: { enabled: false }
    });
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), ["facebook"]);
  });
});

test("weekly frequency only fires on or after the configured weekday trigger", () => {
  withMockedDate("2026-05-19T23:36:00+05:30", () => {
    const settings = settingsWithProfiles({
      facebook: { intervalMinutes: 10080, triggerDay: 2, triggerTime: "23:35" },
      instagram: { intervalMinutes: 10080, triggerDay: 3, triggerTime: "23:35", lastRunAt: "2026-05-19T23:35:00+05:30" },
      linkedin: { enabled: false }
    });
    assert.deepEqual(getDuePlatformProfiles(settings).map((item) => item.platform), ["facebook"]);
  });
});

test("saving changed automation settings marks lastRunAt at save time so future triggers wait", () => {
  const saveTime = new Date("2026-05-19T23:34:00+05:30");
  const existing = settingsWithProfiles({
    facebook: { triggerTime: "09:00", lastRunAt: "2026-05-19T09:00:02+05:30" },
    instagram: { triggerTime: "23:35", lastRunAt: "2026-05-18T23:35:00+05:30" },
    linkedin: { triggerTime: "23:35", lastRunAt: "2026-05-18T23:35:00+05:30" }
  }).autoPlatformSettings;
  const next = settingsWithProfiles().autoPlatformSettings;

  const merged = mergeAutoPlatformLastRunAt(next, existing, saveTime);

  assert.equal(new Date(merged.facebook.lastRunAt).toISOString(), saveTime.toISOString());
  assert.equal(new Date(merged.instagram.lastRunAt).toISOString(), new Date("2026-05-18T23:35:00+05:30").toISOString());
  assert.equal(new Date(merged.linkedin.lastRunAt).toISOString(), new Date("2026-05-18T23:35:00+05:30").toISOString());
});

test("target platform and caption helpers route drafts to matching social channels", () => {
  const draft = {
    targetPlatforms: ["facebook", "instagram", "linkedin", "twitter", "facebook"],
    channelCaptions: {
      facebook: "Facebook caption",
      instagram: "Instagram caption",
      linkedin: "LinkedIn caption"
    }
  };

  assert.deepEqual(getTargetPlatforms(draft), ["facebook", "instagram", "linkedin"]);
  assert.equal(normalizeChannelService("facebook_page"), "facebook");
  assert.equal(normalizeChannelService("instagram_business"), "instagram");
  assert.equal(normalizeChannelService("linkedin_profile"), "linkedin");
  assert.equal(getChannelCaption(draft, "facebook_page"), "Facebook caption");
  assert.equal(getChannelCaption(draft, "instagram_business"), "Instagram caption");
  assert.equal(getChannelCaption(draft, "linkedin_profile"), "LinkedIn caption");
});

test("auto-post run markers advance only platforms with successful Buffer posts", () => {
  assert.deepEqual(
    getSuccessfulPlatformsFromResults([
      { success: true, channelService: "facebook_page" },
      { success: false, channelService: "instagram_business", message: "image missing" },
      { success: true, channelService: "linkedin_profile" },
      { success: true, channelService: "facebook_group" }
    ]),
    ["facebook", "linkedin"]
  );
});

test("zero picked auto-post result should report no ready posts", () => {
  const result = {
    picked: 0,
    sent: 0,
    duePlatforms: ["facebook", "instagram", "linkedin"],
    markedPlatforms: [],
    reason: "no_ready_unsent_posts"
  };

  assert.equal(result.reason, "no_ready_unsent_posts");
});
