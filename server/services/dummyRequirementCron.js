const mongoose = require("mongoose");
const PlatformSettings = require("../models/PlatformSettings");
const DummyRequirement = require("../models/DummyRequirement");
const Requirement = require("../models/Requirement");
const OptedInSeller = require("../models/OptedInSeller");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const { sendWhatsAppMessage, sendViaWapiTemplate, sendViaGupshupTemplate } = require("../utils/sendWhatsApp");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function getCategories() {
  try {
    const settings = await PlatformSettings.findOne().lean();
    console.log("[DummyReq] getCategories - settings:", settings?._id, "categories:", settings?.categories?.slice(0,3));
    const cats = settings?.categories;
    if (Array.isArray(cats) && cats.length > 0) {
      console.log("[DummyReq] getCategories - found:", cats.length);
      return cats;
    }
  } catch (err) {
    console.log("[DummyReq] getCategories error:", err.message);
  }
  console.log("[DummyReq] getCategories - using fallback");
  return ["Electronics", "Furniture", "Electrical", "Industrial", "Plumbing", "Household", "Logistics", "General"];
}

async function getCities() {
  const fallback = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata"];
  console.log("[DummyReq] getCities called, returning fallback");
  return fallback;
}

async function getCategories() {
  try {
    const settings = await PlatformSettings.findOne().lean();
    const cats = settings?.categories;
    if (Array.isArray(cats) && cats.length > 0) {
      return cats;
    }
  } catch (err) {
    console.log("[DummyReq] getCategories error:", err.message);
  }
  return ["Electronics", "Furniture", "Electrical", "Industrial", "Plumbing", "Household", "Logistics", "General"];
}

function getRandomCategory(categories) {
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return "Electronics";
  }
  const idx = Math.floor(Math.random() * categories.length);
  const category = categories[idx];
  return String(category || "Electronics");
}

function getRandomCity(cities) {
  if (!cities || !Array.isArray(cities) || cities.length === 0) {
    return "Delhi";
  }
  const idx = Math.floor(Math.random() * cities.length);
  const city = cities[idx];
  // Ensure it's a string
  return String(city || "Delhi");
}

async function generateDummyRequirements(count = 3, maxQty = 500) {
  const citiesFallback = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata", "Ahmedabad", "Surat", "Jaipur"];
  const categoriesFallback = ["Electronics", "Furniture", "Electrical", "Industrial", "Plumbing", "Household", "Logistics", "General"];
  
  const cities = await getCities();
  const categories = await getCategories();
  
  console.log("[DummyReq] cities type:", typeof cities, "isArray:", Array.isArray(cities));
  console.log("[DummyReq] categories type:", typeof categories, "isArray:", Array.isArray(categories));
  
  if (!Array.isArray(cities) || cities.length === 0 || !cities[0]) {
    console.log("[DummyReq] Using fallback cities");
    cities = citiesFallback;
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    console.log("[DummyReq] Using fallback categories");
    categories = categoriesFallback;
  }
  
  console.log("[DummyReq] cities[0]:", cities[0], "type:", typeof cities[0]);
  
  const generated = [];
  
  let dummyBuyer = await mongoose.model("User").findOne({ phone: "+919999999999" });
  if (!dummyBuyer) {
    dummyBuyer = await mongoose.model("User").create({
      phone: "+919999999999",
      roles: { buyer: true },
      buyerSettings: { name: "Demo Buyer" },
      verified: true
    });
  }
  
  for (let i = 0; i < count; i++) {
    const category = getRandomCategory(categories);
    const city = getRandomCity(cities);
    const quantity = randomInt(10, maxQty);
    
    console.log(`[DummyReq] Loop ${i}: city="${city}" (${typeof city}), category="${category}" (${typeof category})`);
    
    if (!city || typeof city !== 'string' || city.length === 0) {
      console.error("[DummyReq] Invalid city, using default");
      continue;
    }
    
    try {
      const dummy = await DummyRequirement.create({
        product: String(category),
        quantity: quantity,
        unit: randomItem(["pieces", "units", "pcs", "kg", "boxes"]),
        city: String(city),
        category: String(category),
        isDummy: true,
        status: "new"
      });
      console.log("[DummyReq] Dummy created:", dummy._id);
    
    const requirement = await Requirement.create({
      buyerId: dummyBuyer._id,
      city: String(city),
      category: String(category),
      productName: String(category),
      product: String(category),
      quantity: String(quantity),
      type: randomItem(["new", "used"]),
      details: `Demo requirement for ${category}`,
      status: "open",
      isAutoGenerated: true
    });
    
    dummy.realRequirementId = requirement._id;
    await dummy.save();
    
    generated.push(dummy);
  }
  
  console.log(`[DummyReq] Generated ${generated.length} dummy requirements`);
  return generated;
}

async function buildDummyRequirementMessage(dummies, sellerCity) {
  const baseUrl = await resolvePublicAppUrl();
  const lines = [
    "🛒 *New Buyer Requirements*",
    "",
    ...dummies.map((d, i) => 
      `${i + 1}. *${d.product}* - Qty: ${d.quantity} ${d.unit || 'pcs'} | ${d.city}`
    ),
    "",
    "To submit your best offer:",
    `${baseUrl}/seller/deeplink/auto-${Date.now()}`
  ];
  return lines.join("\n");
}

async function sendTemplateToSellers(sellers, dummies, city, provider) {
  const templateConfig = await WhatsAppTemplateRegistry.findOne({
    key: "seller_new_requirement_invite_v2",
    isActive: true
  }).lean();

  if (!templateConfig) {
    console.warn("[DummyReq] Template not found, falling back to text");
    const message = await buildDummyRequirementMessage(dummies, city);
    for (const seller of sellers) {
      try {
        await sendWhatsAppMessage({ to: seller.mobileE164, body: message });
      } catch (err) {
        console.log("[DummyReq] Failed:", err.message);
      }
    }
    return;
  }

  for (const dummy of dummies) {
    const requirementId = dummy.realRequirementId ? String(dummy.realRequirementId) : "demo";
    const deeplink = `${process.env.CLIENT_URL || "https://hoko.app"}/seller/deeplink/${requirementId}`;

    for (const seller of sellers) {
      try {
        const params = [
          String(dummy.product || ""),
          String(dummy.city || ""),
          String(dummy.quantity || ""),
          deeplink
        ];

        if (provider === "gupshup") {
          await sendViaGupshupTemplate({
            to: seller.mobileE164,
            templateId: templateConfig.templateId,
            templateName: templateConfig.templateName,
            languageCode: templateConfig.language || "en",
            parameters: params,
            buttonUrl: deeplink
          });
        } else {
          await sendViaWapiTemplate({
            to: seller.mobileE164,
            templateId: templateConfig.templateId,
            templateName: templateConfig.templateName,
            languageCode: templateConfig.language || "en",
            parameters: params,
            buttonUrl: deeplink
          });
        }
        console.log(`[DummyReq] Template sent to ${seller.mobileE164} for ${dummy.product}`);
      } catch (err) {
        console.log(`[DummyReq] Template failed for ${seller.mobileE164}:`, err.message);
      }
    }
  }
}

async function sendToSellers(dummies) {
  const provider = String(process.env.WHATSAPP_PROVIDER || "wapi").toLowerCase();
  const cityToDummies = {};
  
  for (const dummy of dummies) {
    const city = dummy.city;
    if (!cityToDummies[city]) cityToDummies[city] = [];
    cityToDummies[city].push(dummy);
  }
  
  for (const [city, cityDummies] of Object.entries(cityToDummies)) {
    const sellers = await WhatsAppContact.find({
      city: { $regex: new RegExp(city, "i") },
      optInStatus: "opted_in",
      active: { $ne: false },
      unsubscribedAt: { $exists: false }
    }).select("mobileE164").limit(50);
    
    if (!sellers.length) continue;
    
    await sendTemplateToSellers(sellers, cityDummies, city, provider);
    
    await DummyRequirement.updateMany(
      { _id: { $in: cityDummies.map(d => d._id) } },
      { $set: { status: "sent" } }
    );
  }
}

async function sendToNewSeller(mobileE164, city) {
  const dummies = await DummyRequirement.find({
    city: { $regex: new RegExp(city, "i") },
    status: "new"
  }).limit(3);
  
  if (!dummies.length) {
    const generated = await generateDummyRequirements(1);
    dummies.push(...generated);
  }
  
  const provider = String(process.env.WHATSAPP_PROVIDER || "wapi").toLowerCase();
  await sendTemplateToSellers([{ mobileE164 }], dummies, city, provider);
  
  await DummyRequirement.updateMany(
    { _id: { $in: dummies.map(d => d._id) } },
    { $set: { status: "sent" } }
  );
  
  console.log(`[DummyReq] Sent to new seller ${mobileE164} for city ${city}`);
}

async function runCron() {
  const settings = await PlatformSettings.findOne().lean();
  const quantity = settings?.dummyRequirementSettings?.quantity || 3;
  const maxQty = settings?.dummyRequirementSettings?.maxQuantity || 500;
  
  console.log(`[DummyReq Cron] Running... (qty: ${quantity}, maxQty: ${maxQty})`);
  
  await generateDummyRequirements(quantity, maxQty);
  
  const dummies = await DummyRequirement.find({ status: "new" }).limit(10);
  if (dummies.length > 0) {
    await sendToSellers(dummies);
  }
  
  console.log("[DummyReq Cron] Completed");
}

module.exports = {
  generateDummyRequirements,
  sendToSellers,
  sendToNewSeller,
  runCron
};