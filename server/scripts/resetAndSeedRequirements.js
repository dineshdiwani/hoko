const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const ChatMessage = require("../models/ChatMessage");
const Notification = require("../models/Notification");
const User = require("../models/User");
const PlatformSettings = require("../models/PlatformSettings");
const {
  DEFAULT_CITIES,
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS
} = require("../config/platformDefaults");

const ROOT_ENV = path.resolve(__dirname, "../../.env");
dotenv.config({ path: ROOT_ENV });

const POSTS_PER_CITY = Number(process.argv[2] || 50);

function uniqueList(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function pick(arr, index) {
  if (!arr.length) return "";
  return arr[index % arr.length];
}

function buildTemplate(rowIndex) {
  const domestic = [
    {
      product: "Stainless Steel Kitchen Utensil Set",
      makeBrand: "Any Reputed",
      typeModel: "24 pcs household pack",
      quantity: "120",
      unit: "pcs",
      details:
        "Need durable household utensil sets for apartment handover kits. Prefer food-grade steel, rust-resistant finish, and packed in cartons."
    },
    {
      product: "Ceiling Fans (Domestic)",
      makeBrand: "Any ISI",
      typeModel: "1200mm standard",
      quantity: "80",
      unit: "pcs",
      details:
        "Requirement for residential project. Low-noise, energy-efficient fans with warranty and installation support."
    },
    {
      product: "Water Purifier Cartridges",
      makeBrand: "Compatible Multi-brand",
      typeModel: "RO + Sediment filter",
      quantity: "300",
      unit: "pcs",
      details:
        "Bulk supply needed for annual maintenance contracts. Share filter life, lead time, and replacement schedule."
    }
  ];

  const industrial = [
    {
      product: "Industrial Safety Gloves",
      makeBrand: "Any Certified",
      typeModel: "Nitrile coated, cut-resistant",
      quantity: "500",
      unit: "pcs",
      details:
        "Need gloves for fabrication unit. Must meet industrial safety standards and be available in mixed sizes."
    },
    {
      product: "Mild Steel Round Bar",
      makeBrand: "Primary Mills",
      typeModel: "12mm to 25mm",
      quantity: "5",
      unit: "kg",
      details:
        "Monthly procurement for machine part manufacturing. Quote grade, test certificate, and dispatch schedule."
    },
    {
      product: "Hydraulic Hose Assembly",
      makeBrand: "Any Industrial",
      typeModel: "High pressure braided",
      quantity: "150",
      unit: "pcs",
      details:
        "Require hose assemblies for maintenance shutdown. Please include crimping spec and on-site support availability."
    }
  ];

  const consultancy = [
    {
      product: "Engineering Consultancy for Plant Layout",
      makeBrand: "N/A",
      typeModel: "Process + utility planning",
      quantity: "1",
      unit: "service",
      details:
        "Need consultancy for production floor redesign, workflow optimization, and utility routing with documentation."
    },
    {
      product: "Electrical Load Audit Service",
      makeBrand: "N/A",
      typeModel: "Factory audit and optimization",
      quantity: "1",
      unit: "service",
      details:
        "Looking for certified consultant to perform load analysis, harmonics study, and savings recommendations."
    },
    {
      product: "Structural Assessment Consultancy",
      makeBrand: "N/A",
      typeModel: "Commercial building safety review",
      quantity: "1",
      unit: "service",
      details:
        "Need structural review for expansion works. Include site visit, report, and compliance checklist."
    }
  ];

  const electronics = [
    {
      product: "LED Smart TVs",
      makeBrand: "Any Reputed",
      typeModel: "43 inch 4K",
      quantity: "40",
      unit: "pcs",
      details:
        "Procurement for hospitality setup. Need GST invoice, warranty details, and installation timeline."
    },
    {
      product: "Business Laptops",
      makeBrand: "Any Reputed",
      typeModel: "16GB RAM, 512GB SSD",
      quantity: "25",
      unit: "pcs",
      details:
        "Need laptops for office rollout with pre-installed OS and onsite warranty support."
    },
    {
      product: "CCTV Surveillance Kit",
      makeBrand: "Any Reputed",
      typeModel: "8 channel NVR + 8 cameras",
      quantity: "12",
      unit: "pcs",
      details:
        "Need complete kit with cabling and remote monitoring support for multi-site retail locations."
    }
  ];

  const pools = [domestic, industrial, consultancy, electronics];
  const chosenPool = pools[rowIndex % pools.length];
  return chosenPool[rowIndex % chosenPool.length];
}

async function ensureBuyerForCity(city, cache) {
  if (cache.has(city)) return cache.get(city);

  const existing = await User.findOne({
    "roles.buyer": true,
    city: new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
  })
    .select("_id email city roles")
    .lean();

  if (existing?._id) {
    const id = String(existing._id);
    cache.set(city, id);
    return id;
  }

  const stamp = Date.now();
  const email = `demo.buyer.${slugify(city)}.${stamp}@hoko.local`;
  const created = await User.create({
    email,
    city,
    roles: { buyer: true, seller: false, admin: false },
    name: `Demo Buyer ${city}`,
    termsAccepted: { at: new Date() }
  });
  const id = String(created._id);
  cache.set(city, id);
  return id;
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI in environment");
  }
  if (!Number.isFinite(POSTS_PER_CITY) || POSTS_PER_CITY < 1) {
    throw new Error("Invalid posts-per-city value");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    family: 4
  });

  const settings = await PlatformSettings.findOne().lean();
  const cities = uniqueList(settings?.cities).length
    ? uniqueList(settings.cities)
    : DEFAULT_CITIES;
  const categories = uniqueList(settings?.categories).length
    ? uniqueList(settings.categories)
    : DEFAULT_CATEGORIES;
  const units = uniqueList(settings?.units).length
    ? uniqueList(settings.units)
    : DEFAULT_UNITS;

  const startedAt = new Date();
  const oldRequirementIds = await Requirement.distinct("_id");
  const oldRequirementsCount = oldRequirementIds.length;
  const oldOffersCount = oldRequirementIds.length
    ? await Offer.countDocuments({ requirementId: { $in: oldRequirementIds } })
    : 0;
  const oldChatsCount = oldRequirementIds.length
    ? await ChatMessage.countDocuments({
        requirementId: { $in: oldRequirementIds }
      })
    : 0;
  const oldNotificationsCount = oldRequirementIds.length
    ? await Notification.countDocuments({
        requirementId: { $in: oldRequirementIds }
      })
    : 0;

  const backupDir = path.resolve(__dirname, "../../scripts/backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `requirements-backup-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: startedAt.toISOString(),
        postsPerCity: POSTS_PER_CITY,
        cityCount: cities.length,
        categoryCount: categories.length,
        oldCounts: {
          requirements: oldRequirementsCount,
          offers: oldOffersCount,
          chats: oldChatsCount,
          notifications: oldNotificationsCount
        },
        oldRequirementIds: oldRequirementIds.map((id) => String(id))
      },
      null,
      2
    ),
    "utf8"
  );

  if (oldRequirementIds.length) {
    await Promise.all([
      Offer.deleteMany({ requirementId: { $in: oldRequirementIds } }),
      ChatMessage.deleteMany({ requirementId: { $in: oldRequirementIds } }),
      Notification.deleteMany({ requirementId: { $in: oldRequirementIds } }),
      Requirement.deleteMany({ _id: { $in: oldRequirementIds } })
    ]);
  }

  const buyerByCity = new Map();
  const docs = [];
  let globalIndex = 0;

  for (const city of cities) {
    const buyerId = await ensureBuyerForCity(city, buyerByCity);
    for (let i = 0; i < POSTS_PER_CITY; i += 1) {
      const t = buildTemplate(globalIndex);
      const category = pick(categories, globalIndex + i);
      const unit = t.unit || pick(units, globalIndex + i) || "pcs";
      docs.push({
        buyerId,
        city,
        category,
        productName: t.product,
        product: t.product,
        brand: t.makeBrand,
        makeBrand: t.makeBrand,
        typeModel: t.typeModel,
        quantity: String(t.quantity),
        type: unit,
        details: t.details,
        offerInvitedFrom: "city",
        attachments: [],
        reverseAuction: {
          active: false,
          lowestPrice: null,
          targetPrice: null,
          startedAt: null,
          updatedAt: null,
          closedAt: null
        },
        reverseAuctionActive: false,
        currentLowestPrice: null
      });
      globalIndex += 1;
    }
  }

  if (docs.length) {
    await Requirement.insertMany(docs, { ordered: false });
  }

  const [newReqCount, cityCoverage, categoryCoverage] = await Promise.all([
    Requirement.countDocuments({}),
    Requirement.aggregate([
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    Requirement.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);

  const result = {
    ok: true,
    backupPath,
    postsPerCity: POSTS_PER_CITY,
    cityCount: cities.length,
    categoryCount: categories.length,
    oldCounts: {
      requirements: oldRequirementsCount,
      offers: oldOffersCount,
      chats: oldChatsCount,
      notifications: oldNotificationsCount
    },
    newCounts: {
      requirements: newReqCount
    },
    coverage: {
      cities: cityCoverage,
      categories: categoryCoverage
    }
  };

  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[resetAndSeedRequirements] failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
