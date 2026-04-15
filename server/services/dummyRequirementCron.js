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

function randomBool(probability = 0.5) {
  return Math.random() < probability;
}

const REQ_TYPE_WEIGHTS = {
  domestic: 0.30,
  city_professional: 0.30,
  industrial: 0.30,
  bulk: 0.10
};

const PRODUCT_TEMPLATES = {
  domestic: [
    "Samsung 55 inch LED Smart TV", "LG 260L Frost Free Refrigerator", "Voltas 1.5 Ton Split AC",
    "Whirlpool 7kg Fully Automatic Washing Machine", "Godrej 8kg Semi Automatic Washing Machine",
    "Sony Bravia 43 inch LED TV", "Mi 32 inch LED Smart TV", "Panasonic 1 Ton Split AC",
    "IFB 6kg Fully Automatic Front Load", "Haier 195L Single Door Refrigerator",
    "iPhone 15 Pro 256GB", "Samsung Galaxy S24 Ultra", "OnePlus 12 256GB",
    "Dell Inspiron 15 Laptop", "HP 15s Laptop 12th Gen", "Lenovo IdeaPad 14 inch Laptop",
    "Apple MacBook Air M2", "Samsung Galaxy Tab S8", "ASUS ROG Strix G15 Gaming Laptop",
    "Sony WH-1000XM5 Headphones", "JBL Flip 6 Bluetooth Speaker",
    "Canon EOS 1500D DSLR Camera", "GoPro Hero 11 Action Camera",
    "Samsung Microwave 28L", "LG 7kg Dryer", "Bosch Dishwasher",
    "Samsung 657L Side by Side Refrigerator", "Daikin 1.5 Ton Inverter AC",
    "LG 8kg Front Load Washing Machine", "Sony PlayStation 5 Gaming Console"
  ],
  city_professional: [
    "Wedding Catering Service for 500 Guests", "Corporate Event Management for 200 People",
    "Birthday Party Decoration Service", "Engagement Ceremony Setup Complete",
    "Pre-Owned Maruti Swift Dzire 2022", "Used Toyota Innova Crysta 2021 Top Model",
    "Second Hand Honda City 2023 ZX", "Pre-Owned Kia Seltos 2022",
    "Brand New Maruti Swift LXI", "New Tata Nexon XZ Plus Dark Edition",
    "New Hyundai Creta SX Executive", "Brand New Mahindra XUV700 AX7",
    "Interior Design Package for 3BHK", "Modular Kitchen Installation Complete",
    "Living Room Renovation Service", "Office Interior Design 2000sqft",
    "False Ceiling Work for Home", "Professional Painting Service 1500sqft",
    "Professional Photography for Wedding", "Product Photography Studio Session",
    "Candid Wedding Photography Package", "Corporate Headshot Photography",
    "AC Repair Service for Split AC", "Plumbing Repair Service Home",
    "Electrician Service for Rewiring", "Deep Cleaning Service 2BHK",
    "Packer and Mover Service 2BHK Local", "Pest Control Treatment Service",
    "Car Decoration for Wedding", "Stage Setup for Conference 50ft"
  ],
  industrial: [
    "ABB 5HP Three Phase Induction Motor", "Siemens 7.5HP AC Motor",
    "Crompton 3HP Single Phase Motor", "Bharat Bijlee 10HP Geared Motor",
    "Havells 1.5sqmm Copper Wire 90mtr", "Polycab 2.5sqmm Electric Wire 90mtr",
    "Finolex 4sqmm Cable Wire 90mtr", "RR Kabel 6sqmm Armored Cable 90mtr",
    "SKF 6205 Ball Bearing Pack of 10", "NSK 6305 Deep Groove Bearing Pack of 5",
    "FAG 22212E Spherical Roller Bearing", "TIMKEN LM11949 Cone Bearing Set",
    "ARIEL Butterfly Valve 4 inch 10kg", "Leader Ball Valve 2 inch Brass",
    "Sunflow Control Valve 1 inch", "Honeywell Pressure Reducing Valve",
    "TATA Tiscon 12mm Fe500D TMT Bar", "Jindal Panther 16mm TMT Steel Bar",
    "SAIL MS Structural Channel 100x50", "APL Apollo Square Pipe 50x50",
    "Kirloskar 25kVA Diesel Generator", "Caterpillar 50kVA Generator Set",
    "Ebara 3HP Submersible Pump", "Grundfos 5HP Booster Pump",
    "Miller 400A MIG Welding Machine", "ESAB 300A Stick Welding Machine",
    "Lincoln Electric 350A TIG Welder", "Spot Welding Machine 25kVA",
    "Allen Bradley PLC Module 1756", "Siemens PLC S7-1200 CPU",
    "ABB VFD 10HP ACS550", "Danfoss FC102 Variable Frequency Drive",
    "Endress Hauser Flow Meter", "Siemens Pressure Transmitter 7MF",
    "ABB Low Voltage Switchgear", "Schneider MCB 63A 3 Pole"
  ],
  bulk: [
    "Aluminum Ingot 99.7% 1000kg", "Copper Wire Scrap 500kg", "MS Scrap 2000kg",
    "HDPE Granules 25kg Bag 100bags", "PVC Resin 50kg Bag", "Polypropylene Granules 25kg",
    "Steel Scrap 5mm 1000kg", "Brass Sheet 1.5mm 100kg", "Aluminum Sheet 2mm 50kg",
    "Iron Ore Fines 64% Fe 100MT", "Coal GCV 5500 50MT", "Limestone 40kg Bags 500bags",
    "TMT Bar 12mm Fe500 1000mtr", "Cement ACC 53 Grade 50 Bags", "River Sand 1000cft",
    "Ready Mix Concrete M25 100sqft", "AAC Blocks 600x200x200mm 1000pcs",
    "Havells MCB 32A Pack of 6", "Polycab PVC Conduit Pipe 25mm 3mtr",
    "Astral Pipe 1 inch 1MPa 30mtr", "CPVC Pipe 1 inch 30mtr"
  ]
};

const DETAIL_TEMPLATES = {
  domestic: [
    "Required for home use. Delivery needed by {timeline}. Looking for brand new product with full warranty. Please share photos and best price.",
    "Home requirement with budget of {budget}. Prompt delivery preferred. Need genuine product with official warranty card.",
    "Looking for this product for new home setup. Installation service available please confirm. Share complete price with GST.",
    "Required urgently for home. Same day or next day delivery needed. Please share available stock and price.",
    "Replacement requirement for old unit. Exchange of old unit possible. Share dealer price with specifications.",
    "Gift purchase requirement. Need branded product with premium packaging. Please share catalog and delivery options."
  ],
  city_professional: [
    "Corporate event requirement. Service needed for {timeline}. Please share complete package details with pricing.",
    "Wedding season requirement. Looking for reliable vendor with good reviews. Budget flexible for quality service.",
    "Business expansion requirement. Need quotation for multiple units. Please share bulk pricing and availability.",
    "Pre-owned vehicle requirement. Looking for well-maintained unit with service history. Budget: {budget}.",
    "Interior project requirement. Need experienced team for execution. Timeline: {timeline}. Share portfolio and quote.",
    "Professional service requirement for ongoing project. Looking for established vendor. Quality work essential.",
    "Regular business requirement. If satisfied, can become recurring order. Competitive pricing invited.",
    "Event management requirement. Need complete setup including staff. Guest capacity: mentioned quantity. Share package details."
  ],
  industrial: [
    "Production requirement - quality guarantee essential. Please submit technical specifications sheet with detailed PDF.",
    "Weekly recurring requirement. If quality is maintained, this can become a regular monthly order. Bulk pricing requested.",
    "Required for plant maintenance during scheduled shutdown. Installation service available please specify.",
    "Trial order to assess quality. If satisfied, expecting monthly orders. Technical datasheet and test certificates required.",
    "Required for project execution. ISI certification or relevant quality certifications mandatory. GST invoice must.",
    "Priority delivery requirement. Please quote per unit price with minimum order quantity and delivery timeline.",
    "Machinery upgrade consideration. Demo unit available please schedule. Running operation video can be shared on WhatsApp.",
    "Maintenance stock replenishment. Looking for reliable supplier with consistent quality. Competitive rates required."
  ],
  bulk: [
    "Regular manufacturing requirement. Monthly need of approximately {qty} {unit}. Competitive rates for long-term supply partnership invited.",
    "High volume requirement. Interested in yearly supplier agreement. Price per {unit} with delivery included. GST invoice mandatory.",
    "Stock replenishment needed urgently. Delivery required within 3 days. Quality certificate mandatory.",
    "Required for production line. Consistent quality essential. Interested in annual rate contract with quarterly price revision.",
    "Government or institutional requirement. All documentation must be complete. Test certificate required with sample.",
    "Export order preparation. Quality must meet specifications. Certificate of Analysis and test reports ready. FOB pricing requested."
  ]
};

const TIMELINES = ["ASAP", "within 24 hours", "within 2 days", "within 3 days", "within a week", "within 10 days", "by month end"];
const BUDGETS = ["Budget: INR 20,000-30,000", "Budget: INR 30,000-50,000", "Budget: INR 50,000-80,000", "Budget: INR 1-2 Lakhs", "Budget: INR 2-5 Lakhs", "Budget: INR 5+ Lakhs", "Competitive pricing required"];

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

async function getCities() {
  const fallback = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata", "Ahmedabad", "Surat", "Jaipur"];
  try {
    const settings = await PlatformSettings.findOne().lean();
    const cities = settings?.cities;
    if (Array.isArray(cities) && cities.length > 0) {
      return cities;
    }
  } catch (err) {
    console.log("[DummyReq] getCities error:", err.message);
  }
  return fallback;
}

function getRandomCity(cities) {
  if (!cities || !Array.isArray(cities) || cities.length === 0) {
    return "Delhi";
  }
  const idx = Math.floor(Math.random() * cities.length);
  return String(cities[idx] || "Delhi");
}

function selectReqType() {
  const rand = Math.random();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(REQ_TYPE_WEIGHTS)) {
    cumulative += weight;
    if (rand < cumulative) return type;
  }
  return "industrial";
}

function getSmartQuantity(reqType) {
  switch (reqType) {
    case "domestic":
      return randomInt(1, 3);
    case "city_professional":
      return randomItem([1, 2, 3, 5, 10, 20, 50, 100, 500]);
    case "industrial":
      return randomInt(5, 15);
    case "bulk":
      return randomInt(100, 500);
    default:
      return randomInt(1, 10);
  }
}

function getSmartUnit(reqType, product) {
  const productLower = String(product || "").toLowerCase();
  
  if (reqType === "bulk") {
    return randomItem(["kg", "quintal", "ton", "liter", "sqft", "mtr", "bags", "units"]);
  }
  if (reqType === "city_professional") {
    if (productLower.includes("catering") || productLower.includes("guest") || productLower.includes("people")) {
      return randomItem(["people", "guests", "persons", "plates"]);
    }
    if (productLower.includes("vehicle") || productLower.includes("car") || productLower.includes("innova") || productLower.includes("swift") || productLower.includes("creta") || productLower.includes("nexon") || productLower.includes("kia") || productLower.includes("honda")) {
      return randomItem(["units", "nos", "vehicles"]);
    }
    if (productLower.includes("sqft") || productLower.includes("interior") || productLower.includes("painting") || productLower.includes("ceiling")) {
      return randomItem(["sqft", "sq.ft", "area"]);
    }
    return randomItem(["service", "job", "unit", "set", "package"]);
  }
  if (productLower.includes("motor") || productLower.includes("pump")) {
    return randomItem(["units", "nos", "pcs"]);
  }
  if (productLower.includes("wire") || productLower.includes("cable")) {
    return randomItem(["roll", "mtr", "coils", "units"]);
  }
  if (productLower.includes("bearing")) {
    return randomItem(["pcs", "nos", "packs", "sets"]);
  }
  if (productLower.includes("valve") || productLower.includes("meter")) {
    return randomItem(["pcs", "nos", "units"]);
  }
  if (productLower.includes("bar") || productLower.includes("steel") || productLower.includes("pipe")) {
    return randomItem(["pcs", "nos", "mtr", "lengths"]);
  }
  if (productLower.includes("generator") || productLower.includes("machine") || productLower.includes("welder") || productLower.includes("pump")) {
    return randomItem(["units", "nos", "sets"]);
  }
  if (productLower.includes("PLC") || productLower.includes("VFD") || productLower.includes("drive") || productLower.includes("transmitter")) {
    return randomItem(["units", "pcs", "nos", "modules"]);
  }
  if (productLower.includes("switchgear") || productLower.includes("MCB")) {
    return randomItem(["sets", "units", "pcs"]);
  }
  return randomItem(["pcs", "units", "nos"]);
}

function getProduct(reqType) {
  const products = PRODUCT_TEMPLATES[reqType];
  if (!products || products.length === 0) {
    return `${reqType} Equipment`;
  }
  return randomItem(products);
}

function generateDetail(reqType, quantity, unit) {
  const templates = DETAIL_TEMPLATES[reqType] || DETAIL_TEMPLATES.domestic;
  let detail = randomItem(templates);
  
  detail = detail.replace("{timeline}", randomItem(TIMELINES));
  detail = detail.replace("{budget}", randomItem(BUDGETS));
  detail = detail.replace("{qty}", quantity);
  detail = detail.replace("{unit}", unit);
  
  if (randomBool(0.2)) {
    detail += " Please share product details and pricing via WhatsApp.";
  }
  if (randomBool(0.15)) {
    detail += " GST invoice and quality certificate required.";
  }
  if (randomBool(0.1)) {
    detail += " Bulk discount pricing invited.";
  }
  
  return detail;
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function getRecentCityReqTypes(days = 30) {
  const thirtyDaysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recent = await DummyRequirement.find({
    createdAt: { $gte: thirtyDaysAgo }
  }).select("city reqType").lean();
  return new Set(recent.map(r => `${r.city}|${r.reqType}`));
}

async function generateDummyRequirements(count = 3) {
  const citiesFallback = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata", "Ahmedabad", "Surat", "Jaipur"];
  
  const cities = await getCities();
  if (!Array.isArray(cities) || cities.length === 0) {
    cities = citiesFallback;
  }
  
  const recentCombos = await getRecentCityReqTypes(30);
  
  const typeDistribution = {};
  for (let i = 0; i < count; i++) {
    const reqType = selectReqType();
    typeDistribution[reqType] = (typeDistribution[reqType] || 0) + 1;
  }
  
  console.log(`[DummyReq] Type distribution:`, typeDistribution);
  
  const generated = [];
  
  let dummyBuyer = await mongoose.model("User").findOne({ phone: "+919999999999" });
  if (!dummyBuyer) {
    const randomCity = getRandomCity(cities);
    dummyBuyer = await mongoose.model("User").create({
      phone: "+919999999999",
      city: randomCity,
      roles: { buyer: true },
      buyerSettings: { name: "Demo Buyer" },
      verified: true
    });
  }
  
  for (const [reqType, typeCount] of Object.entries(typeDistribution)) {
    const shuffledCities = shuffleArray([...cities]);
    
    for (let i = 0; i < typeCount; i++) {
      const city = shuffledCities[i % shuffledCities.length];
      const comboKey = `${city}|${reqType}`;
      
      if (recentCombos.has(comboKey) && generated.length < count * 2) {
        continue;
      }
      
      const product = getProduct(reqType);
      const quantity = getSmartQuantity(reqType);
      const unit = getSmartUnit(reqType, product);
      const details = generateDetail(reqType, quantity, unit);
      
      try {
        const dummy = await DummyRequirement.create({
          product: product,
          quantity: quantity,
          unit: unit,
          city: String(city),
          category: reqType,
          isDummy: true,
          status: "new",
          details: details,
          reqType: reqType
        });
        
        const offerInvitedFrom = ["industrial", "bulk"].includes(reqType) ? "anywhere" : "city";
        
        const requirement = await Requirement.create({
          buyerId: dummyBuyer._id,
          city: String(city),
          category: reqType,
          productName: product,
          product: product,
          quantity: String(quantity),
          type: randomItem(["new", "used"]),
          details: details,
          status: "open",
          isAutoGenerated: true,
          offerInvitedFrom: offerInvitedFrom
        });
        
        dummy.realRequirementId = requirement._id;
        await dummy.save();
        
        generated.push(dummy);
        console.log(`[DummyReq] Generated: ${city} | ${reqType} | ${product}`);
        
        if (generated.length >= count) break;
      } catch (err) {
        console.log("[DummyReq] Error creating dummy:", err.message);
      }
    }
    
    if (generated.length >= count) break;
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
          String(`${dummy.quantity} ${dummy.unit}` || ""),
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
  const provider = "gupshup";
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
  
  const provider = "gupshup";
  await sendTemplateToSellers([{ mobileE164 }], dummies, city, provider);
  
  await DummyRequirement.updateMany(
    { _id: { $in: dummies.map(d => d._id) } },
    { $set: { status: "sent" } }
  );
  
  console.log(`[DummyReq] Sent to new seller ${mobileE164} for city ${city}`);
}

async function sendToNewSellerWithCategories(mobileE164, city, categoryData) {
  const { whatsappCategories, platformCategories, hasOfferAnywhere } = categoryData;
  
  let dummies = [];
  
  if (hasOfferAnywhere) {
    dummies = await DummyRequirement.find({
      status: "new",
      category: { $in: platformCategories }
    }).limit(2);
    
    if (dummies.length < 2) {
      const extraNeeded = 2 - dummies.length;
      const allDummies = await DummyRequirement.find({
        status: "new",
        category: { $nin: dummies.map(d => d.category) }
      }).limit(extraNeeded);
      dummies.push(...allDummies);
    }
  } else {
    dummies = await DummyRequirement.find({
      city: { $regex: new RegExp(city, "i") },
      status: "new",
      category: { $in: platformCategories }
    }).limit(2);
    
    if (dummies.length < 2) {
      const extraNeeded = 2 - dummies.length;
      const extraDummies = await DummyRequirement.find({
        city: { $regex: new RegExp(city, "i") },
        status: "new",
        category: { $nin: dummies.map(d => d.category) }
      }).limit(extraNeeded);
      dummies.push(...extraDummies);
    }
  }
  
  if (!dummies.length) {
    console.log(`[DummyReq] No matching requirements for ${mobileE164}`);
    return;
  }
  
  const provider = "gupshup";
  
  for (const dummy of dummies) {
    const requirementLink = `${process.env.CLIENT_URL || "https://hoko.app"}/seller/deeplink/${dummy.realRequirementId || "demo"}`;
    
    let message;
    if (hasOfferAnywhere && dummy.category) {
      message = [
        "🆕 New Buyer Requirement (India):",
        "",
        `📦 Product: ${dummy.product}`,
        `📍 Qty: ${dummy.quantity} ${dummy.unit || "pcs"}`,
        `🏙️ Category: ${dummy.category}`,
        "🌍 Offer invited from anywhere",
        "",
        "💰 Submit your best offer:",
        `👉 https://hokoapp.in/seller/login`
      ].join("\n");
    } else {
      message = [
        "🆕 New Buyer Requirement in " + dummy.city + ":",
        "",
        `📦 Product: ${dummy.product}`,
        `📍 Qty: ${dummy.quantity} ${dummy.unit || "pcs"}`,
        "",
        "💰 Submit your best offer:",
        `👉 https://hokoapp.in/seller/login`
      ].join("\n");
    }
    
    try {
      await sendWhatsAppMessage({ to: mobileE164, body: message });
      await DummyRequirement.updateOne({ _id: dummy._id }, { $set: { status: "sent" } });
      console.log(`[DummyReq] Sent requirement ${dummy.product} to ${mobileE164}`);
    } catch (err) {
      console.log(`[DummyReq] Failed to send to ${mobileE164}:`, err.message);
    }
  }
  
  console.log(`[DummyReq] Sent ${dummies.length} requirements to new seller ${mobileE164}`);
}

async function runCron(params = {}) {
  const settings = await PlatformSettings.findOne().lean();
  const quantity = params?.quantity || settings?.dummyRequirementSettings?.quantity || 3;
  
  console.log(`[DummyReq Cron] Running... (qty: ${quantity})`);
  
  await generateDummyRequirements(quantity);
  
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
  sendToNewSellerWithCategories,
  runCron
};
