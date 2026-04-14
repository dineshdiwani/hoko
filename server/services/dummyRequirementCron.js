const mongoose = require("mongoose");
const PlatformSettings = require("../models/PlatformSettings");
const DummyRequirement = require("../models/DummyRequirement");
const OptedInSeller = require("../models/OptedInSeller");
const WhatsAppContact = require("../models/WhatsAppContact");
const { sendWhatsAppMessage, sendViaWapiTemplate } = require("../utils/sendWhatsApp");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");

const productsByCategory = {
  electronics: ["LED Lights", "AC", "Fan", "Refrigerator", "Washing Machine", "Microwave", "Geyser", "Air Cooler"],
  furniture: ["Chairs", "Tables", "Sofa", "Beds", "Almirah", "Mattress", "Pillows"],
  electrical: ["Cables", "Switches", "Wires", "MCB", "DB Box", "LED Bulbs"],
  industrial: ["Motor", "Pump", "Compressor", "Generator", "Hydraulic Pump"],
  plumbing: ["Pipes", "Fittings", "Valves", "Taps", "Shower"],
  household: ["2BHK Rental", "3BHK Rental", "PG", "Hostel", "Flat for Rent"],
  logistics: ["House Shifting", "Office Relocation", "Vehicle Transport", "Local Moving"],
  general: ["Raw Materials", "Office Supplies", "Packaging Material", "Tools"]
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomCategory() {
  const keys = Object.keys(productsByCategory);
  return randomItem(keys);
}

function getRandomProduct(category) {
  const products = productsByCategory[category] || productsByCategory.general;
  return randomItem(products);
}

async function getCities() {
  const settings = await PlatformSettings.findOne({ key: "cities" }).lean();
  return Array.isArray(settings?.value) ? settings.value : ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata"];
}

async function generateDummyRequirements(count = 3) {
  const cities = await getCities();
  const generated = [];
  
  for (let i = 0; i < count; i++) {
    const category = getRandomCategory();
    const product = getRandomProduct(category);
    const city = randomItem(cities);
    const quantity = randomInt(10, 500);
    
    const dummy = await DummyRequirement.create({
      product,
      quantity,
      unit: randomItem(["pieces", "units", "pcs", "kg", "boxes"]),
      city,
      category,
      isDummy: true,
      status: "new"
    });
    
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

async function sendToSellers(dummies) {
  const cities = await getCities();
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
    
    const message = await buildDummyRequirementMessage(cityDummies, city);
    
    for (const seller of sellers) {
      try {
        await sendWhatsAppMessage({
          to: seller.mobileE164,
          body: message
        });
        console.log(`[DummyReq] Sent to ${seller.mobileE164} for ${city}`);
      } catch (err) {
        console.log(`[DummyReq] Failed for ${seller.mobileE164}:`, err.message);
      }
    }
    
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
    dummies.push(...await generateDummyRequirements(1));
  }
  
  const message = await buildDummyRequirementMessage(dummies, city);
  
  await sendWhatsAppMessage({
    to: mobileE164,
    body: message
  });
  
  await DummyRequirement.updateMany(
    { _id: { $in: dummies.map(d => d._id) } },
    { $set: { status: "sent" } }
  );
  
  console.log(`[DummyReq] Sent to new seller ${mobileE164} for city ${city}`);
}

async function runCron() {
  console.log("[DummyReq Cron] Running...");
  
  await generateDummyRequirements(randomInt(1, 3));
  
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