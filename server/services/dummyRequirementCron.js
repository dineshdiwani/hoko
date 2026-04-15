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

const CATEGORY_TYPES = {
  domestic: ["electronics", "furniture", "household", "plumbing", "electrical", "grocery", "automotive", "textile"],
  industrial: ["industrial", "electrical", "mechanical", "plumbing", "construction", "printing", "packaging", "food"],
  bulk: ["industrial", "logistics", "construction", "raw materials", "general", "grocery", "agriculture", "textile"],
  service: ["logistics", "general", "services", "printing", "medical", "automotive"]
};

function getCategoryType(category) {
  const cat = String(category || "").trim().toLowerCase();
  
  for (const [type, categories] of Object.entries(CATEGORY_TYPES)) {
    if (categories.some(c => cat.includes(c) || c.includes(cat))) {
      return type;
    }
  }
  return randomItem(["domestic", "industrial", "bulk"]);
}

const PRODUCT_TEMPLATES = {
  Electronics: [
    "Samsung 55 inch LED Smart TV", "LG 260L Frost Free Refrigerator", "Voltas 1.5 Ton Split AC",
    "Whirlpool 7kg Fully Automatic Washing Machine", "Godrej 8kg Semi Automatic Washing Machine",
    "Sony Bravia 43 inch LED TV", "Mi 32 inch LED Smart TV", "Panasonic 1 Ton Split AC",
    "IFB 6kg Fully Automatic Front Load", "Haier 195L Single Door Refrigerator",
    "Dell Inspiron 15 Laptop", "HP 15s Laptop 12th Gen", "Lenovo IdeaPad 14 inch Laptop",
    "Apple MacBook Air M2", "Samsung Galaxy Tab S8", "JBL Flip 6 Bluetooth Speaker",
    "Sony WH-1000XM5 Headphones", "boAt Rockerz 450 Bluetooth Headphone",
    "Canon EOS 1500D DSLR Camera", "GoPro Hero 11 Action Camera",
    "ASUS ROG Strix G15 Gaming Laptop", "Acer Aspire 5 Laptop"
  ],
  Furniture: [
    "Wooden King Size Bed with Storage", "L-Shaped Sofa Set 6 Seater", "Dining Table Set 6 Chairs",
    "Office Executive Chair Set of 5", "Bookshelf 5 Layer Engineered Wood", "TV Unit Wall Mounted",
    "Wardrobe 4 Door Sliding", "Coffee Table Set Marble Top", "Computer Desk Study Table",
    "Recliner Chair Leather", "Folding Dining Table 4 Seater", "Mattress King Size 8 inch",
    "Pocket Spring Single Bed Mattress", "Folding Steel Almirah", "Plastic Storage Cabinet",
    "Metal Shoe Rack 5 Tier", "Garden Furniture Set 4 Pieces", "Bar Cabinet Wooden"
  ],
  Electrical: [
    "Havells 1.5sqmm Copper Wire 90mtr", "Polycab 2.5sqmm Electric Wire 90mtr",
    "Finolex 1sqmm Cable Wire 90mtr", "Syska LED Bulb 9W Pack of 10", "Philips 12W LED Panel Light Pack of 5",
    "Crompton 1HP Water Pump", "Kirloskar 2HP Monoblock Pump", "Havells MCB 32A Pack of 6",
    "Anchor Roma 6A Switch Board 8 Module", "Polycab PVC Conduit Pipe 25mm 3mtr",
    "Copper Earthing Rod 8ft", "Junction Box 4x4 GI", "Cable Tie 200mm Pack of 100",
    "DB Box 8 Way Surface Mount", "busbar 25A Copper", "Voltage Stabilizer 5kVA"
  ],
  Plumbing: [
    "Astral Pipe 1 inch 1MPa 30mtr", "Finolex PVC Pipe 3/4 inch 30mtr",
    "Ashirvad CPVC Pipe 1/2 inch 30mtr", "Jaquar Basin Mixer Chrome", "Parryware Wall Mounted Basin",
    "Hindware Wall Hung EWC", "Cera 2 in 1 Wall Hung", "Kohler Artize Bathtub 1.7mtr",
    "Toto One Piece Toilet", "Grohe Bauedge Basin Mixer", "PVC Ball Valve 1 inch",
    "GI Tee 3/4 inch", "CPVC Elbow 90deg 1/2 inch Pack of 10", "Water Tank 1500L Sintex",
    "Sump Tank 5000L RCC", "Submersible Pump 1HP", "Pressure Pump 0.5HP"
  ],
  Industrial: [
    "Industrial Air Compressor 50HP", "CNC Lathe Machine 6ft", "Heavy Duty Workbench 8ft",
    "Pallet Truck 3 Ton Capacity", "Overhead Crane 5 Ton", "Industrial Generator 25kVA",
    "Welding Machine 400A", "Forklift 2.5 Ton Diesel", "Power Press 100 Ton",
    "Shearing Machine 12mm", "Bending Machine 16mm", "Surface Grinder 6x12inch",
    "Drilling Machine Radial 40mm", "Milling Machine 6 inch", "Band Saw Machine 14inch",
    "Industrial Mixer 500L", "Conveyor Belt 10mtr", "Hydraulic Jack 50 Ton",
    "Gear Box Reducer 10:1", "Electric Motor 5HP 3 Phase", "Air Dryer 100CFM"
  ],
  Mechanical: [
    "Ball Bearing SKF 6205 Pack of 10", "V Belt B48 Industrial", "Timing Belt 5M450",
    "Hydraulic Cylinder 100mm Bore", "Pneumatic Cylinder 50mm Bore", "Shaft Bearing Block UCP205",
    "Coupling Spider GR28", "Sprocket 40B17 17 Teeth", "Chain Sprocket Set 40B",
    "Shaft Sleeve 50mm Bore", "Lead Screw 25mm ACME", "Linear Guide Rail 20mm 1mtr",
    "Solenoid Valve 24V DC", "Flow Control Valve 1/4inch", "Pressure Gauge 100PSI",
    "Pneumatic FRL Unit 1/4inch", "Oil seals 35x52x7 Pack of 5"
  ],
  Construction: [
    "TMT Bar 12mm Fe500 1000mtr", "Cement ACC 53 Grade 50 Bags", "River Sand 1000cft",
    "Ready Mix Concrete M25 100sqft", "AAC Blocks 600x200x200mm 1000pcs", "Crushed Aggregate 40mm 1000cft",
    "MS Structural Steel Angle 50x50x5", "H Beam 200x100 6mtr", "GI Pipe 2 inch Medium",
    "PVC Water Tank 1000L", "Bitumen 60/70 Grade 50kg Drum", "Plaster of Paris 25kg Bag",
    "Gypsum Board 12mm 8x4ft", "CPVC Pipe 1 inch 30mtr", "RCC Hume Pipe 600mm 3mtr"
  ],
  Household: [
    "Non Stick Cookware Set 7pcs", "Vacuum Cleaner 1400W", "Air Purifier HEPA",
    "Water Purifier RO+UV 8L", "Rice Cooker 1.8L Prestige", "Pressure Cooker 5L Hawkins",
    "Mixer Grinder 750W 3 Jar", "Induction Cooktop 2000W", "OTG Oven 28L",
    "Iron Box Steam 1200W", "Ceiling Fan 1200mm Pack of 3", "Wall Fan 16inch Pack of 2",
    "Exhaust Fan 10inch", "Room Heater 2000W Oil Filled", "Air Cooler 50L Desert",
    "Mop Set Spin Bucket", "Vacuum Cleaner Handheld", "Clothes Dryer 6kg"
  ],
  Logistics: [
    "10 Feet Container Storage Service", "Warehouse Space 500sqft Monthly", "Local Pickup Delivery Service",
    "Part Load Truck Booking Delhi-Mumbai", "Cold Storage Facility 100sqft", "Office Relocation Service",
    "Car Transport Service Pan India", "Packers and Movers 2BHK", "Bulk Parcel Service COD",
    "International Shipping Service", "Courier Service Same Day Delivery", "3PL Fulfillment Service",
    "Last Mile Delivery Service", "Fleet Management Service", "GPS Tracking Device Monthly"
  ],
  "Raw Materials": [
    "Aluminum Ingot 99.7% 1000kg", "Copper Wire Scrap 500kg", "MS Scrap 2000kg",
    "HDPE Granules 25kg Bag 100bags", "LDPE Film Grade 50kg", "PVC Resin 50kg Bag",
    "Polypropylene Granules 25kg", "Rubber Crumb 25kg Bag", "Steel Scrap 5mm 1000kg",
    "Brass Sheet 1.5mm 100kg", "Aluminum Sheet 2mm 50kg", "Copper Rod 8mm 100kg",
    "Iron Ore Fines 64% Fe 100MT", "Coal GCV 5500 50MT", "Limestone 40kg Bags 500bags",
    "Gypsum Powder 40kg Bag 200bags", "Fly Ash 50kg Bag 500bags", "Silica Sand 50kg 200bags"
  ],
  Services: [
    "Annual Maintenance Contract Electrical", "AMC for HVAC System 3Star", "Industrial Cleaning Service",
    "Pest Control Service 2BHK", "Security Guard Service Monthly", "CCTV Installation 8 Camera",
    "Fire Safety Audit Service", "Water Tank Cleaning Service", "Generator AMC Annual",
    "PLC Programming Service", "Industrial Painting Service sqft", "Welding Fabrication Job Work",
    "CNC Machining Job Work", "Heat Treatment Service", "NDT Testing Service"
  ],
  General: [
    "Office Stationery Kit 50pcs", "Safety Helmet Pack of 10", "Safety Shoe Size 8 Pack of 5",
    "Hand Sanitizer 5L Can", "Face Mask N95 Pack of 100", "Fire Extinguisher 5kg ABC",
    "Safety Gloves Leather Pack of 10", " Caution Tape 100mtr Roll", "Road Barrier Plastic 1.5mtr",
    "Reflective Jacket Pack of 5", "First Aid Kit Industrial", "Eye Wash Station",
    "PPE Kit Complete Set", "Safety Harness Double Lanyard", "Ear Plug Pack of 50pairs"
  ],
  Grocery: [
    "Basmati Rice 25kg Bag Premium", "Refined Sugar 50kg", "Tur Dal 25kg",
    "Chana Dal 25kg Wholesale", "Mustard Oil 15L Tin", "Besan 25kg",
    "Atta Whole Wheat 25kg", "Maida 25kg Fine Quality", "Sugar Free Sweetener 500g Pack 50",
    "Edible Oil 15L Tin", "Ragi Flour 5kg Organic", "Moong Dal 10kg"
  ],
  Agriculture: [
    "Tractor 45HP 4WD", "Agricultural Sprayer 16L", "HDPE Pipe 110mm 30mtr",
    "Drip Irrigation Kit 1 Acre", "Power Weeder 5HP", "Seed Drill 9 Row",
    "Harvesting Machine Combine", "Milking Machine 2 Lakh", "Solar Water Pump 2HP",
    "Mulching Film 2mtr 100mtr", "Polyhouse Structure 1000sqft", "Grain Storage Silo 10 Ton"
  ],
  Textile: [
    "Industrial Sewing Machine Heavy Duty", "Fabric Roll Cotton 50mtr", "Sewing Thread Cone 5kg",
    "Button Making Machine", "Embroidery Machine Multi Head", "Fabric Dyeing Machine",
    "Knitting Machine Circular", "Weaving Loom Automatic", "Garment Printing Machine",
    "Lamination Machine A3", "Cutting Machine Industrial", "Packaging Machine Shrink"
  ],
  Automotive: [
    "Car Battery 12V 75AH", "Motorcycle Tyre 90/90-17", "Brake Pad Set Universal",
    "Engine Oil 15W40 4L", "Car Alternator 90A", "Shock Absorber Set 4pcs",
    "Headlight Assembly LED", "Car Seat Cover Set", "GPS Tracker Device",
    "Jump Starter 12V", "Car Stereo System", "Vehicle Jack 3 Ton"
  ],
  Medical: [
    "Hospital Bed ICU Electric", "Oxygen Concentrator 5L", "Patient Monitor 12 inch",
    "Pulse Oximeter Fingertip", "Blood Pressure Monitor Digital", "Nebulizer Machine",
    "Wheelchair Foldable", "Steam Sterilizer 30L", "ECG Machine 12 Channel",
    "Infusion Pump Volumetric", "Suction Machine 2 Jar", "OT Table Hydraulic"
  ],
  Printing: [
    "Commercial Printing Service", "Flex Banner 10x20ft", "Visiting Card 500pcs",
    "Brochure Printing A4 1000", "Label Sticker Roll 1000", "Packaging Box Corrugated",
    "Business Cards Premium 500", "Magazine Printing 1000 copies", "Calendar Printing Custom",
    "Vinyl Sticker Sheet A4", "Paper Roll 80gsm 10kg", "Ink Cartridge HP 45"
  ],
  Packaging: [
    "Corrugated Box 12x12x12inch", "Stretch Film Roll 18inch", "Bubble Wrap Roll 24inch",
    "Packing Tape 2inch 100mtr", "Cardboard Sheet 4x4ft", "Wooden Pallet Euro",
    "Plastic Crate Stackable", "Air Pillow Bag 100pcs", "Foam Sheet 6mm 50mtr",
    "Paper Packaging 50kg", "Metal Strapping Kit", "Carton Box Heavy Duty"
  ],
  Food: [
    "Commercial Kitchen Equipment", "Rice Cooker Industrial 20L", "Deep Fryer 15L",
    "Food Processor Industrial", "Cold Storage Unit 500L", "Baking Oven 4 Tray",
    "Mixer Grinder Commercial", "Food Packaging Machine", "Water Dispenser Hot Cold",
    "Chapati Machine Automatic", "Dough Kneader 25kg", "Vacuum Packaging Machine"
  ]
};

const DETAIL_TEMPLATES = {
  domestic: [
    "Urgent requirement bhai, delivery chaheye {timeline}. Quality achhi honi chahiye, original brand ka. Pic bhejna zaroor.",
    "Home use ke liye chahiye, budget {budget}. Jaldi delivery possible hai toh best hai, warna within a week bhi chalega.",
    "Ghar pe installation hogi, electrician available hoga toh batao. Product ka catalog aur price list bhejna hai.",
    "Shifting ke liye chahiye, 15 din ke andar chaheye. Original bill with warranty aana chahiye.",
    "Gift ke liye dekh rahe hain, packaging achha hona chahiye. Dealer price mein mil sakta hai toh best hai.",
    "Repair ke liye chahiye, photo aur specifications bhejo with price. Old unit bhi exchange mein de sakte hain.",
    "Emergency hai bhai, same day delivery possible ho toh prefer karenge. WhatsApp pe pics aur price bhejo."
  ],
  industrial: [
    "Production requirement hai, quality guarantee chahiye. Technical specifications sheet with PDF bhejo.",
    "Weekly basis pe lena hai, agar quality achhi rahi toh regular order milega. Bulk discount banao.",
    "Plant maintenance ke liye chahiye, shutdown ke dauran lagana hai. Installation service include hai toh mention karo.",
    "Trial order hai, agar satisfied hue toh monthly 500+ ka order dedo. Technical datasheet zaroor bhejo.",
    "Government project ke liye chahiye, ISI mark ya relevant certification aana chahiye. GST invoice must hai.",
    "Job work ke liye use karenge, delivery on priority hai. Per unit price along with MOQ banao.",
    "Machinery upgrade ke liye dekh rahe hain, demo available hai toh schedule karo. Running video bhejo WhatsApp pe."
  ],
  bulk: [
    "Manufacturing unit ke liye regular requirement hai. Monthly {qty} {unit} needed. Best rate pe long term supply possible hai toh contact karo.",
    "Plant ke liye chahiye, daily consumption high hai. Supplier tie-up kar sakte hain yearly. Price per {unit} with delivery included banao.",
    "Stock replenishment hai, within 3 days delivery chahiye. GST invoice and quality certificate dono chahiye.",
    "Government tender ke liye requirement hai, all documentation proper honi chahiye. Test certificate bhejo with sample.",
    "Export order ke liye chahiye, quality international standards ke according honi chahiye. COA aur test reports ready rakho.",
    "Start-up production ke liye initial stock hai, budget tight hai but quality compromise nahi. Best rate pe bulk deal kar sakte ho.",
    "Warehouse ke liye stock hai, space constraint hai toh delivery organized honi chahiye. Staggered delivery schedule banao."
  ],
  service: [
    "Service provider dhundh rahe hain, previous work ka portfolio bhejo. Quote with timeline important hai.",
    "Urgent requirement hai, {timeline} ke andar service complete honi chahiye. Experienced team available ho toh prefer karenge.",
    "AMC ke liye dhundh rahe hain, quarterly visits include honi chahiye. SLA terms with response time mention karo.",
    "Project based kaam hai, timeline aur milestones clear hone chahiye. Previous project references zaroor bhejo.",
    "Contract basis pe dhundh rahe hain, 6 months minimum commitment de sakte hain. Per visit or per month rate banao."
  ]
};

const TIMELINES = ["same day", "within 2 days", "within 3 days", "within a week", "within 10 days", "this month", "asap"];
const BUDGETS = ["20-30k", "30-50k", "50-80k", "80k-1L", "1-2L", "2-3L", "within 15k", "within 25k", "within 40k", "competitive rate pe lo"];

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

function getSmartQuantity(categoryType, category) {
  switch (categoryType) {
    case "domestic":
      return randomInt(1, 2);
    case "industrial":
      return randomInt(10, 15);
    case "bulk":
      return randomInt(50, 100);
    case "service":
      return 1;
    default:
      return randomInt(1, 5);
  }
}

function getSmartUnit(categoryType, category) {
  if (categoryType === "bulk") {
    return randomItem(["kg", "quintal", "ton", "liter", "sqft", "cubic meter"]);
  }
  if (categoryType === "service") {
    return randomItem(["job", "service", "visit", "month", "sqft", "unit"]);
  }
  if (category?.toLowerCase().includes("raw material")) {
    return randomItem(["kg", "ton", "quintal", "bags"]);
  }
  if (category?.toLowerCase().includes("electrical")) {
    return randomItem(["roll", "mtr", "pcs", "units", "set", "box"]);
  }
  if (category?.toLowerCase().includes("plumbing")) {
    return randomItem(["pcs", "roll", "mtr", "boxes", "set"]);
  }
  return randomItem(["pcs", "units", "set", "box", "nos"]);
}

function getProduct(category) {
  const cat = String(category || "").trim();
  const catLower = cat.toLowerCase();
  
  const normalizedKey = Object.keys(PRODUCT_TEMPLATES).find(
    key => key.toLowerCase() === catLower
  );
  
  if (normalizedKey && PRODUCT_TEMPLATES[normalizedKey]?.length > 0) {
    return randomItem(PRODUCT_TEMPLATES[normalizedKey]);
  }
  
  const productPrefixes = {
    electronics: "Smart LED TV 55 inch", furniture: "Executive Office Chair", 
    electrical: "3 Phase Motor 5HP", plumbing: "CPVC Pipe 1 inch 30mtr",
    industrial: "Heavy Duty Workbench", mechanical: "Industrial Ball Bearing",
    construction: "TMT Bar 12mm Fe500", household: "Non Stick Cookware Set",
    logistics: "Warehouse Storage Space", "raw materials": "Industrial Raw Material",
    services: "AMC Service Contract", general: "Industrial Safety Equipment",
    grocery: "Wholesale Grocery Supply", agriculture: "Agricultural Equipment",
    textile: "Industrial Sewing Machine", automotive: "Vehicle Spare Parts",
    medical: "Medical Equipment", printing: "Commercial Printing Service",
    packaging: "Industrial Packaging Material", food: "Food Processing Equipment",
    agriculture: "Farm Equipment Tractor"
  };
  
  const prefix = productPrefixes[catLower] || `${cat} Product`;
  const variants = [
    `Standard Grade ${prefix}`, `Premium Quality ${prefix}`,
    `Industrial ${prefix}`, `Commercial ${prefix}`,
    `Bulk ${prefix}`, `${prefix} with Warranty`
  ];
  
  return randomItem(variants);
}

function generateDetail(categoryType, quantity, unit) {
  const templates = DETAIL_TEMPLATES[categoryType] || DETAIL_TEMPLATES.domestic;
  let detail = randomItem(templates);
  
  detail = detail.replace("{timeline}", randomItem(TIMELINES));
  detail = detail.replace("{budget}", randomItem(BUDGETS));
  detail = detail.replace("{qty}", quantity);
  detail = detail.replace("{unit}", unit);
  
  if (randomBool(0.3)) {
    detail += " Catalog aur PDF bhejo WhatsApp pe.";
  }
  if (randomBool(0.2)) {
    detail += " Sample deneke layak hai toh best hai.";
  }
  if (randomBool(0.15)) {
    detail += " Dealer price mein mil sakta hai toh quote karo.";
  }
  if (randomBool(0.1)) {
    detail += " Old stock clearance bhi consider kar sakte hain.";
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

async function getRecentCityCategories(days = 30) {
  const thirtyDaysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recent = await DummyRequirement.find({
    createdAt: { $gte: thirtyDaysAgo }
  }).select("city category").lean();
  return new Set(recent.map(r => `${r.city}|${r.category}`));
}

async function generateDummyRequirements(count = 3) {
  const citiesFallback = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata", "Ahmedabad", "Surat", "Jaipur"];
  const categoriesFallback = ["Electronics", "Furniture", "Electrical", "Industrial", "Plumbing", "Household", "Logistics", "General"];
  
  const cities = await getCities();
  const categories = await getCategories();
  
  if (!Array.isArray(cities) || cities.length === 0) {
    cities = citiesFallback;
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    categories = categoriesFallback;
  }
  
  const recentCombos = await getRecentCityCategories(30);
  const allCombos = [];
  for (const city of cities) {
    for (const category of categories) {
      allCombos.push({ city, category });
    }
  }
  
  const availableCombos = allCombos.filter(
    combo => !recentCombos.has(`${combo.city}|${combo.category}`)
  );
  
  const shuffledCombos = shuffleArray(
    availableCombos.length >= count 
      ? availableCombos 
      : [...availableCombos, ...shuffleArray(allCombos)]
  );
  
  const selectedCombos = shuffledCombos.slice(0, count);
  
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
  
  for (let i = 0; i < selectedCombos.length; i++) {
    const { city, category } = selectedCombos[i];
    const categoryType = getCategoryType(category);
    const quantity = getSmartQuantity(categoryType, category);
    const unit = getSmartUnit(categoryType, category);
    const product = getProduct(category);
    const details = generateDetail(categoryType, quantity, unit);
    
    try {
      const dummy = await DummyRequirement.create({
        product: product,
        quantity: quantity,
        unit: unit,
        city: String(city),
        category: String(category),
        isDummy: true,
        status: "new",
        details: details
      });
      
      const offerInvitedFrom = ["industrial", "bulk"].includes(categoryType) ? "anywhere" : "city";
      
      const requirement = await Requirement.create({
        buyerId: dummyBuyer._id,
        city: String(city),
        category: String(category),
        productName: product,
        product: product,
        quantity: String(quantity),
        type: categoryType === "bulk" ? randomItem(["new", "used"]) : randomItem(["new", "used"]),
        details: details,
        status: "open",
        isAutoGenerated: true,
        offerInvitedFrom: offerInvitedFrom
      });
      
      dummy.realRequirementId = requirement._id;
      await dummy.save();
      
      generated.push(dummy);
      console.log(`[DummyReq] Generated: ${city} - ${category} | ${product} (${categoryType})`);
    } catch (err) {
      console.log("[DummyReq] Error creating dummy:", err.message);
    }
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
  runCron
};
