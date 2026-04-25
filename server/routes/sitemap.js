const express = require("express");
const router = express.Router();
const Requirement = require("../models/Requirement");

router.get("/", async (req, res) => {
  try {
    const baseUrl = process.env.CLIENT_URL || "https://hokoapp.in";
    
    const staticPages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/post-requirement", priority: "0.9", changefreq: "weekly" },
      { url: "/buyer/login", priority: "0.8", changefreq: "monthly" },
      { url: "/seller/login", priority: "0.8", changefreq: "monthly" },
      { url: "/buyer/requirement/new", priority: "0.9", changefreq: "weekly" }
    ];

    const recentRequirements = await Requirement.find({})
      .select("_id createdAt")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    const dynamicPages = recentRequirements.map((req) => ({
      url: `/requirement/${req._id}`,
      lastmod: req.updatedAt || req.createdAt,
      priority: "0.7",
      changefreq: "weekly"
    }));

    const allPages = [...staticPages, ...dynamicPages];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>${
      page.lastmod ? `\n    <lastmod>${new Date(page.lastmod).toISOString().split("T")[0]}</lastmod>` : ""
    }
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    console.error("Sitemap error:", err);
    res.status(500).send("Error generating sitemap");
  }
});

module.exports = router;