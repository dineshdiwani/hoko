const assert = require("node:assert/strict");
const test = require("node:test");

const {
  composeDraftText,
  _private: {
    buildBufferAssets,
    getPostMetadata,
    normalizeUrl
  }
} = require("../utils/bufferPublisher");

test("composeDraftText builds Buffer text from caption, hashtags, and CTA link", () => {
  assert.equal(
    composeDraftText({
      caption: "Buyers need verified suppliers now.",
      hashtags: ["#HOKO", "#ReverseAuction"],
      ctaLink: "https://hokoapp.in"
    }),
    "Buyers need verified suppliers now.\n\n#HOKO #ReverseAuction\n\nhttps://hokoapp.in"
  );
});

test("facebook metadata uses post type and link attachment when there is no image", () => {
  assert.deepEqual(
    getPostMetadata("facebook_page", "post", "hokoapp.in", false),
    {
      facebook: {
        type: "post",
        linkAttachment: { url: "https://hokoapp.in" }
      }
    }
  );
});

test("facebook metadata omits link attachment when image is attached", () => {
  assert.deepEqual(
    getPostMetadata("facebook", "story", "https://hokoapp.in", true),
    {
      facebook: {
        type: "story"
      }
    }
  );
});

test("instagram metadata maps post, story, and reel types", () => {
  assert.deepEqual(
    getPostMetadata("instagram_business", "post", "https://hokoapp.in", false),
    {
      instagram: {
        type: "post",
        shouldShareToFeed: true,
        link: "https://hokoapp.in"
      }
    }
  );

  assert.deepEqual(
    getPostMetadata("instagram", "story", "https://hokoapp.in", true),
    {
      instagram: {
        type: "story",
        shouldShareToFeed: false
      }
    }
  );

  assert.deepEqual(
    getPostMetadata("instagram", "reel", "", true),
    {
      instagram: {
        type: "reel",
        shouldShareToFeed: false
      }
    }
  );
});

test("linkedin metadata uses link attachment only when there is no image", () => {
  assert.deepEqual(
    getPostMetadata("linkedin_profile", "post", "hokoapp.in", false),
    {
      linkedin: {
        linkAttachment: { url: "https://hokoapp.in" }
      }
    }
  );

  assert.equal(getPostMetadata("linkedin", "post", "https://hokoapp.in", true), null);
});

test("metadata rejects unknown social services and normalizes URLs", () => {
  assert.equal(getPostMetadata("twitter", "post", "hokoapp.in", false), null);
  assert.equal(normalizeUrl("hokoapp.in/path"), "https://hokoapp.in/path");
  assert.equal(normalizeUrl("https://hokoapp.in/path"), "https://hokoapp.in/path");
});

test("buffer assets prefer video with optional thumbnail", () => {
  assert.deepEqual(
    buildBufferAssets({
      videoUrl: "https://cdn.example.com/reel.mp4",
      imageUrl: "https://cdn.example.com/thumb.jpg"
    }),
    [{
      video: {
        url: "https://cdn.example.com/reel.mp4",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg"
      }
    }]
  );

  assert.deepEqual(
    buildBufferAssets({ imageUrl: "https://cdn.example.com/image.jpg" }),
    [{
      image: {
        url: "https://cdn.example.com/image.jpg"
      }
    }]
  );
});
