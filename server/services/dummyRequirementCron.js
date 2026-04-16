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

function normalizeMobileE164(mobile) {
  if (!mobile) return null;
  let num = String(mobile).replace(/[^\d]/g, "");
  if (num.startsWith("91") && num.length === 12) {
    return `+${num}`;
  }
  if (num.length === 10) {
    return `+91${num}`;
  }
  if (num.startsWith("+")) {
    return num;
  }
  return mobile;
}

const PLATFORM_CATEGORY_TEMPLATES = {
  "Electronics & Appliances": [
    "LED Smart TV", "Frost Free Refrigerator", "Split AC",
    "Fully Automatic Washing Machine", "Smartphone", "Laptop",
    "Headphones", "DSLR Camera", "Gaming Console"
  ],
  "Furniture & Home": [
    "King Size Bed with Storage", "L-Shaped Sofa Set 6 Seater", "Dining Table Set 6 Chairs",
    "Office Executive Chair Set", "Modular Kitchen Complete", "TV Unit Wall Mounted"
  ],
  "Vehicles & Parts": [
    "Pre-Owned Sedan Car", "Used SUV Vehicle",
    "Second Hand Hatchback Car", "Pre-Owned Compact SUV",
    "Brand New Hatchback Car", "New Compact SUV"
  ],
  "Industrial Machinery": [
    "Three Phase Induction Motor", "AC Motor",
    "Diesel Generator", "MIG Welding Machine",
    "PLC Module", "CNC Lathe Machine"
  ],
  "Electrical Parts": [
    "Copper Wire", "Electric Wire",
    "Ball Bearing", "Variable Frequency Drive",
    "MCB Circuit Breaker", "Low Voltage Switchgear"
  ],
  "Construction Materials": [
    "TMT Bar", "Cement Bags",
    "Steel Structural Beams", "Aluminum Composite Panels"
  ],
  "Services & Maintenance": [
    "Wedding Catering Service", "Corporate Event Management",
    "Birthday Party Decoration Service", "Interior Design Package"
  ],
  "Raw Materials": [
    "Aluminum Ingot", "Copper Wire Scrap", "MS Scrap",
    "Steel Scrap", "Iron Ore Fines"
  ],
  "Chemicals & Plastics": [
    "HDPE Granules", "PVC Resin", "Polypropylene Granules",
    "Polyethylene Film Roll", "ABS Granules"
  ],
  "Packaging": [
    "Corrugated Box", "Stretch Film Roll",
    "Bubble Wrap Roll", "Packing Tape"
  ],
  "Textiles & Apparel": [
    "Cotton Fabric Roll", "Polyester Blend Fabric", "Readymade Shirts",
    "Industrial Workwear Set"
  ],
  "Food & Agriculture": [
    "Basmati Rice", "Wheat Grain", "Organic Fertilizer",
    "Agricultural Sprayer Pump"
  ],
  "Health & Safety": [
    "N95 Mask Box", "Safety Helmet", "Industrial Gloves Box",
    "First Aid Kit Complete"
  ],
  "Logistics & Transport": [
    "Packer and Mover Service", "Open Truck",
    "Container Storage", "Warehouse Rental"
  ],
  "Business Services": [
    "Consulting Service", "Digital Marketing Package",
    "Website Development", "Legal Documentation Service"
  ]
};

const BRAND_MODEL_TEMPLATES = {
  "Electronics & Appliances": [
    { brand: "Samsung", model: "55 inch LED Smart TV", type: "LED TV" },
    { brand: "LG", model: "260L Frost Free Refrigerator", type: "Refrigerator" },
    { brand: "Voltas", model: "1.5 Ton Split AC", type: "Split AC" },
    { brand: "Whirlpool", model: "7kg Fully Automatic", type: "Washing Machine" },
    { brand: "Samsung", model: "Galaxy S24 Ultra 256GB", type: "Smartphone" },
    { brand: "Apple", model: "iPhone 15 Pro 256GB", type: "Smartphone" },
    { brand: "Dell", model: "Inspiron 15 12th Gen", type: "Laptop" },
    { brand: "HP", model: "15s Laptop 12th Gen", type: "Laptop" },
    { brand: "Lenovo", model: "IdeaPad 14 inch", type: "Laptop" },
    { brand: "Apple", model: "MacBook Air M2", type: "Laptop" },
    { brand: "Sony", model: "WH-1000XM5", type: "Headphones" },
    { brand: "Canon", model: "EOS 1500D DSLR", type: "Camera" },
    { brand: "Sony", model: "PlayStation 5", type: "Gaming Console" },
    { brand: "LG", model: "8kg Front Load", type: "Washing Machine" }
  ],
  "Vehicles & Parts": [
    { brand: "Maruti", model: "Swift Dzire 2022", type: "Sedan", condition: "Pre-Owned" },
    { brand: "Toyota", model: "Innova Crysta 2021", type: "SUV", condition: "Used" },
    { brand: "Honda", model: "City 2023 ZX", type: "Sedan", condition: "Second Hand" },
    { brand: "Kia", model: "Seltos 2022", type: "Compact SUV", condition: "Pre-Owned" },
    { brand: "Maruti", model: "Swift LXI", type: "Hatchback", condition: "Brand New" },
    { brand: "Tata", model: "Nexon XZ Plus", type: "Compact SUV", condition: "New" },
    { brand: "Hyundai", model: "Creta 2023", type: "SUV", condition: "Pre-Owned" },
    { brand: "Mahindra", model: "XUV500 2022", type: "SUV", condition: "Used" }
  ],
  "Industrial Machinery": [
    { brand: "ABB", model: "5HP Three Phase Motor", type: "Induction Motor" },
    { brand: "Siemens", model: "7.5HP AC Motor", type: "AC Motor" },
    { brand: "Kirloskar", model: "25kVA Silent", type: "Diesel Generator" },
    { brand: "Miller", model: "400A MIG", type: "Welding Machine" },
    { brand: "Allen Bradley", model: "1756 PLC Module", type: "PLC Controller" },
    { brand: "ACE", model: "CNC 200", type: "CNC Lathe" },
    { brand: "Larsen & Toubro", model: "10HP Industrial", type: "Motor" }
  ],
  "Electrical Parts": [
    { brand: "Havells", model: "1.5sqmm 90mtr", type: "Copper Wire" },
    { brand: "Polycab", model: "2.5sqmm 90mtr", type: "Electric Wire" },
    { brand: "SKF", model: "6205 Pack of 10", type: "Ball Bearing" },
    { brand: "ABB", model: "VFD ACS550 10HP", type: "Variable Frequency Drive" },
    { brand: "Schneider", model: "MCB 63A 3 Pole", type: "Circuit Breaker" },
    { brand: "ABB", model: "Low Voltage", type: "Switchgear" },
    { brand: "Siemens", model: "32A MCB", type: "Circuit Breaker" }
  ],
  "Construction Materials": [
    { brand: "Tata", model: "12mm Fe500", type: "TMT Bar" },
    { brand: "ACC", model: "53 Grade", type: "Cement" },
    { brand: "JSW", model: "Structural Beams", type: "Steel Beam" },
    { brand: "Alstrong", model: "4mm ACP Sheet", type: "Aluminum Panel" }
  ],
  "Chemicals & Plastics": [
    { brand: "Reliance", model: "HDPE Injection Grade", type: "Granules" },
    { brand: "Finolex", model: "PVC SG5", type: "Resin" },
    { brand: "Borouge", model: "PP H110MA", type: "Granules" },
    { brand: "Standard", model: "LDPE Film Grade", type: "Film Roll" },
    { brand: "LG Chem", model: "HF-6560", type: "ABS Granules" }
  ],
  "Textiles & Apparel": [
    { brand: "Raymond", model: "Cotton Blend 60 inch", type: "Fabric" },
    { brand: "Arvind", model: "Polyester 58 inch", type: "Fabric" },
    { brand: "Lifestyle", model: "Formal Shirts", type: "Readymade" },
    { brand: "达姆", model: "Industrial Grade", type: "Workwear" }
  ],
  "Food & Agriculture": [
    { brand: "India Gate", model: "Basmati 5kg", type: "Rice" },
    { brand: "Aashirvaad", model: "Sharbati Wheat", type: "Wheat" },
    { brand: "Godrej", model: "Pro-Gard 25kg", type: "Fertilizer" },
    { brand: "MAP", model: "16L Sprayer", type: "Sprayer Pump" }
  ],
  "Health & Safety": [
    { brand: "3M", model: "N95 VFM 100pcs", type: "Mask" },
    { brand: "Ultimate", model: "ISI Marked", type: "Safety Helmet" },
    { brand: "Midas", model: "Heavy Duty Box", type: "Gloves" },
    { brand: "Dukal", model: "OSHA Compliant", type: "First Aid Kit" }
  ]
};

function getBrandModel(platformCategory) {
  const templates = BRAND_MODEL_TEMPLATES[platformCategory];
  if (!templates || templates.length === 0) {
    return { brand: null, model: null, type: null, condition: null };
  }
  return randomItem(templates);
}

const DETAIL_STYLES = {
  short: [
    "Price please?",
    "Needed urgently. WhatsApp me the best price.",
    "Share your lowest price",
    "Looking for best deal. Contact me.",
    "Your price?",
    "Interested. Quote me your best price.",
    "Quick quote needed",
    "Available? Share price",
    "Need this. Best price?",
    "Urgent requirement. Price?",
    "Looking for {product}. Best price?"
  ],
  casual: [
    "Hi, we need {qty} {unit}. Can you send your best price?",
    "Hey, looking for {product}. What's your rate for {qty} {unit}?",
    "Do you have {product} in stock? Need about {qty} {unit}.",
    "Hi, interested in {product}. Pls share price for {qty} {unit}.",
    "We need this urgently. Can you supply {qty} {unit}?",
    "Looking for supplier. Your best price for {qty} {unit}?",
    "Hi, can you arrange {qty} {unit}? What's the cost?",
    "Need {product} for our factory. {qty} {unit}. WhatsApp price?",
    "Requirement for our plant. Can you supply {product}? Share price.",
    "We are interested in {product}. {qty} {unit} needed. Your rate?"
  ],
  detailed: [
    "Required for our {industry}. Need {qty} {unit}. Please share:\n- Best unit price\n- Delivery timeline\n- Payment terms\n- GST extra?",
    "We have a requirement for {product} ({qty} {unit}). Please quote your best price including:\n- Product specifications\n- Delivery schedule\n- Warranty details\n- GST invoice available?",
    "Business requirement - need {qty} {unit}. Please provide:\n- Complete pricing breakdown\n- Availability status\n- Expected delivery date\n- Payment options",
    "Procurement requirement for {product}. Qty: {qty} {unit}. Kindly share:\n- Per unit price\n- Bulk discount if applicable\n- Delivery timeline\n- Tax invoice mandatory"
  ],
  formal: [
    "We have a requirement for {product}. Quantity: {qty} {unit}. Please submit your quotation with complete product details, pricing, and delivery timeline.",
    "Our organization requires {qty} {unit} of {product} for ongoing operations. Kindly provide your best offer with technical specifications.",
    "Please quote for {product} ({qty} {unit}) with details on pricing, availability, and delivery schedule.",
    "We require {product} for our upcoming project. Quantity: {qty} {unit}. Please share your competitive rates along with product specifications."
  ],
  urgent: [
    "URGENT - Need {product} ({qty} {unit}) within {timeline}. Please confirm availability and best price immediately.",
    "Urgent requirement! Need {product} ASAP. Qty: {qty} {unit}. Please whatsapp your best price right away.",
    "Time-sensitive order. {product} ({qty} {unit}) needed by {timeline}. Share your lowest price immediately.",
    "Urgent procurement - {product} ({qty} {unit}) required by {timeline}. Please confirm if you can supply and your best rate."
  ],
  negotiation: [
    "Looking for best price on {product}. We are serious buyers. Share your lowest quote for {qty} {unit}.",
    "Ready to place order if price is competitive. Need {qty} {unit} of {product}. Your best price?",
    "Multiple suppliers being contacted for {product}. Qty: {qty} {unit}. Lowest price wins. What can you offer?",
    "Comparing quotes for {product}. Need {qty} {unit}. Share your best price to get our business."
  ]
};

const CATEGORY_DETAIL_TEMPLATES = {
  "Electronics & Appliances": [
    "Required for home use. Delivery needed by {timeline}. Looking for brand new product with full warranty.",
    "Home requirement with budget of {budget}. Prompt delivery preferred. Need genuine product with official warranty card.",
    "Looking for this product for new home setup. Installation service available please confirm. Share complete price with GST."
  ],
  "Furniture & Home": [
    "Home furnishing requirement. Delivery by {timeline}. Looking for quality product with easy returns policy.",
    "Required for new home. Budget flexible for quality. Please share photos and dimensions.",
    "Replacement for old furniture. Exchange available. Share best dealer price with specifications."
  ],
  "Vehicles & Parts": [
    "Pre-owned vehicle requirement. Looking for well-maintained unit with service history. Budget: {budget}.",
    "Looking for certified pre-owned vehicle. Complete service records mandatory. Share best price.",
    "New vehicle requirement. Interested in {timeline} delivery. Share on-road price with all charges."
  ],
  "Industrial Machinery": [
    "Production requirement - quality guarantee essential. Please submit technical specifications sheet with detailed PDF.",
    "Required for plant maintenance during scheduled shutdown. Installation service available please specify.",
    "Machinery requirement. Demo unit available please schedule. Technical datasheet and test certificates required."
  ],
  "Electrical Parts": [
    "Maintenance stock replenishment. Looking for reliable supplier with consistent quality. ISI certification mandatory.",
    "Required for project execution. GST invoice must. Please quote per unit price with MOQ and delivery timeline.",
    "Trial order to assess quality. If satisfied, expecting monthly orders. Technical datasheet and test certificates required."
  ],
  "Construction Materials": [
    "Construction project requirement. Delivery needed by {timeline}. Quality certificate mandatory.",
    "Bulk requirement for ongoing project. Interested in yearly supplier agreement. GST invoice required.",
    "Required for new construction. Budget: {budget}. Share price per {unit} with delivery included."
  ],
  "Services & Maintenance": [
    "Corporate event requirement. Service needed for {timeline}. Please share complete package details with pricing.",
    "Wedding season requirement. Looking for reliable vendor with good reviews. Budget flexible for quality service.",
    "Interior project requirement. Need experienced team for execution. Timeline: {timeline}. Share portfolio and quote."
  ],
  "Raw Materials": [
    "Regular manufacturing requirement. Monthly need of approximately {qty} {unit}. Competitive rates for long-term supply invited.",
    "High volume requirement. Interested in yearly supplier agreement. Price per {unit} with delivery included. GST invoice mandatory.",
    "Stock replenishment needed urgently. Delivery required within 3 days. Quality certificate mandatory."
  ],
  "Chemicals & Plastics": [
    "Production requirement. Consistent quality essential. Interested in annual rate contract with quarterly price revision.",
    "Required for manufacturing line. Test certificate required with sample. Price per {unit} with delivery included.",
    "Regular requirement. Looking for established supplier. Competitive pricing required for long-term partnership."
  ],
  "Packaging": [
    "Packaging requirement for our products. Monthly need of {qty} {unit}. Quality and timely delivery essential.",
    "Urgent packaging need. Delivery required by {timeline}. Share best price per {unit}.",
    "Regular supplier needed for packaging materials. Interested in monthly orders. Competitive pricing required."
  ],
  "Textiles & Apparel": [
    "Textile requirement for manufacturing. Monthly need of {qty} {unit}. Quality consistency essential.",
    "Bulk apparel requirement. Budget: {budget}. Delivery by {timeline}. Share catalog and pricing.",
    "Fabric requirement for production. Interested in long-term supplier. Share sample and price."
  ],
  "Food & Agriculture": [
    "Foodgrains requirement for distribution. Monthly need of {qty} {unit}. FSSAI certification mandatory.",
    "Agricultural equipment requirement. Budget flexible for quality. Share specifications and price.",
    "Organic produce requirement. Regular monthly orders. Quality and timely delivery essential."
  ],
  "Health & Safety": [
    "Safety equipment requirement for factory. ISI marked products mandatory. Budget: {budget}.",
    "Health supplies for workplace. Delivery needed by {timeline}. Share catalog and pricing.",
    "PPE requirement for employees. Regular monthly orders. Competitive pricing required."
  ],
  "Logistics & Transport": [
    "Logistics requirement for factory shift. Regular monthly contract. Share quotes for all-in service.",
    "Transportation requirement for {timeline}. Capacity: mentioned quantity. Reliable service essential.",
    "Warehouse storage needed. Space requirement: {qty} sqft. Share rental terms and availability."
  ],
  "Business Services": [
    "Professional service requirement. Looking for experienced vendor. Budget: {budget}. Share portfolio.",
    "Consulting requirement for business expansion. Timeline: {timeline}. Share previous work references.",
    "Digital services requirement. Monthly retainer preferred. Share service details and pricing."
  ]
};

const PLATFORM_CATEGORY_WEIGHTS = {
  "Electronics & Appliances": 0.12,
  "Furniture & Home": 0.08,
  "Vehicles & Parts": 0.08,
  "Industrial Machinery": 0.10,
  "Electrical Parts": 0.10,
  "Construction Materials": 0.08,
  "Services & Maintenance": 0.08,
  "Raw Materials": 0.10,
  "Chemicals & Plastics": 0.08,
  "Packaging": 0.05,
  "Textiles & Apparel": 0.05,
  "Food & Agriculture": 0.05,
  "Health & Safety": 0.04,
  "Logistics & Transport": 0.05,
  "Business Services": 0.04
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

function selectPlatformCategory() {
  const categories = Object.keys(PLATFORM_CATEGORY_WEIGHTS);
  const weights = Object.values(PLATFORM_CATEGORY_WEIGHTS);
  
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const rand = Math.random() * totalWeight;
  
  let cumulative = 0;
  for (let i = 0; i < categories.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      return categories[i];
    }
  }
  
  return categories[0];
}

function getSmartQuantity(platformCategory) {
  if (platformCategory.includes("Electronics") || platformCategory.includes("Furniture")) {
    return randomInt(1, 5);
  }
  if (platformCategory.includes("Vehicles")) {
    return randomItem([1, 2, 3, 5, 10]);
  }
  if (platformCategory.includes("Services") || platformCategory.includes("Logistics") || platformCategory.includes("Business")) {
    return randomItem([1, 2, 3, 5, 10, 20, 50, 100, 500]);
  }
  if (platformCategory.includes("Industrial") || platformCategory.includes("Electrical") || platformCategory.includes("Construction") || platformCategory.includes("Textiles") || platformCategory.includes("Health") || platformCategory.includes("Packaging")) {
    return randomInt(2, 50);
  }
  if (platformCategory.includes("Raw Materials") || platformCategory.includes("Chemicals") || platformCategory.includes("Food")) {
    return randomInt(100, 500);
  }
  return randomInt(1, 10);
}

function getSmartUnit(platformCategory, product) {
  const productLower = String(product || "").toLowerCase();
  
  if (platformCategory.includes("Raw Materials") || platformCategory.includes("Chemicals") || platformCategory.includes("Food")) {
    return randomItem(["kg", "quintal", "ton", "liter", "bags", "units"]);
  }
  if (platformCategory.includes("Services") || platformCategory.includes("Business")) {
    if (productLower.includes("catering") || productLower.includes("guest") || productLower.includes("people")) {
      return randomItem(["people", "guests", "persons", "plates"]);
    }
    if (productLower.includes("consulting") || productLower.includes("service") || productLower.includes("hour")) {
      return randomItem(["hours", "sessions", "package"]);
    }
    return randomItem(["service", "job", "unit", "set", "package"]);
  }
  if (platformCategory.includes("Logistics")) {
    if (productLower.includes("packer") || productLower.includes("mover") || productLower.includes("2bhk") || productLower.includes("3bhk")) {
      return randomItem(["service", "job", "house"]);
    }
    if (productLower.includes("truck") || productLower.includes("container") || productLower.includes("ton")) {
      return randomItem(["trips", "units", "capacity"]);
    }
    if (productLower.includes("sqft") || productLower.includes("warehouse")) {
      return randomItem(["sqft", "sq.ft", "area"]);
    }
    return randomItem(["service", "units"]);
  }
  if (platformCategory.includes("Vehicles")) {
    return randomItem(["units", "nos", "vehicles"]);
  }
  if (platformCategory.includes("Industrial") || platformCategory.includes("Electrical")) {
    if (productLower.includes("motor") || productLower.includes("generator") || productLower.includes("machine") || productLower.includes("welder") || productLower.includes("lathe") || productLower.includes("cnc") || productLower.includes("pump")) {
      return randomItem(["units", "nos", "sets"]);
    }
    if (productLower.includes("wire") || productLower.includes("cable")) {
      return randomItem(["roll", "mtr", "coils", "units"]);
    }
    if (productLower.includes("bearing")) {
      return randomItem(["pcs", "nos", "packs", "sets"]);
    }
    if (productLower.includes("valve") || productLower.includes("meter") || productLower.includes("switchgear") || productLower.includes("MCB") || productLower.includes("VFD") || productLower.includes("PLC") || productLower.includes("drive") || productLower.includes("transmitter")) {
      return randomItem(["pcs", "nos", "units", "modules"]);
    }
    return randomItem(["pcs", "units", "nos"]);
  }
  if (platformCategory.includes("Construction")) {
    if (productLower.includes("bar") || productLower.includes("steel") || productLower.includes("beam") || productLower.includes("panel")) {
      return randomItem(["pcs", "nos", "mtr", "lengths"]);
    }
    if (productLower.includes("cement") || productLower.includes("bag")) {
      return randomItem(["bags", "units", "tons"]);
    }
    return randomItem(["pcs", "units", "nos"]);
  }
  if (platformCategory.includes("Packaging")) {
    if (productLower.includes("box") || productLower.includes("roll") || productLower.includes("film") || productLower.includes("wrap")) {
      return randomItem(["pcs", "rolls", "units"]);
    }
    return randomItem(["pcs", "units", "boxes"]);
  }
  if (platformCategory.includes("Textiles")) {
    if (productLower.includes("fabric") || productLower.includes("roll")) {
      return randomItem(["meters", "rolls", "pcs"]);
    }
    if (productLower.includes("shirt") || productLower.includes("wear") || productLower.includes("garment")) {
      return randomItem(["pcs", "units", "dozens"]);
    }
    return randomItem(["pcs", "units"]);
  }
  if (platformCategory.includes("Health")) {
    if (productLower.includes("mask") || productLower.includes("glove") || productLower.includes("kit")) {
      return randomItem(["pcs", "boxes", "units"]);
    }
    if (productLower.includes("helmet")) {
      return randomItem(["pcs", "units"]);
    }
    return randomItem(["pcs", "units"]);
  }
  if (platformCategory.includes("Electronics") || platformCategory.includes("Furniture")) {
    return randomItem(["pcs", "units", "nos"]);
  }
  return randomItem(["pcs", "units", "nos"]);
}

function getProduct(platformCategory) {
  const products = PLATFORM_CATEGORY_TEMPLATES[platformCategory];
  if (!products || products.length === 0) {
    return `${platformCategory} Product`;
  }
  return randomItem(products);
}

function generateDetail(platformCategory, quantity, unit, brandData = {}) {
  const styleRoll = Math.random();
  let detail;
  const hasBrand = brandData && brandData.brand;
  
  if (styleRoll < 0.15) {
    detail = randomItem(DETAIL_STYLES.short);
  } else if (styleRoll < 0.35) {
    detail = randomItem(DETAIL_STYLES.casual);
  } else if (styleRoll < 0.55) {
    detail = randomItem(DETAIL_STYLES.detailed);
  } else if (styleRoll < 0.70) {
    detail = randomItem(DETAIL_STYLES.formal);
  } else if (styleRoll < 0.85) {
    detail = randomItem(DETAIL_STYLES.urgent);
  } else {
    detail = randomItem(DETAIL_STYLES.negotiation);
  }
  
  if (hasBrand) {
    detail = detail.replace("{product}", `${brandData.brand} ${brandData.model}`);
  } else {
    detail = detail.replace("{product}", randomItem(PLATFORM_CATEGORY_TEMPLATES[platformCategory]) || "this item");
  }
  
  detail = detail.replace("{timeline}", randomItem(TIMELINES));
  detail = detail.replace("{budget}", randomItem(BUDGETS));
  detail = detail.replace("{qty}", quantity);
  detail = detail.replace("{unit}", unit);
  detail = detail.replace("{industry}", randomItem(["factory", "warehouse", "office", "plant", "manufacturing unit", "warehouse"]));
  
  if (hasBrand && randomBool(0.3) && !detail.includes("brand") && !detail.includes("Brand")) {
    detail = `Looking for ${brandData.brand} ${brandData.model}. ` + detail;
  }
  
  if (randomBool(0.1) && !detail.includes("WhatsApp") && !detail.includes("whatsapp")) {
    detail += " WhatsApp preferred.";
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
  
  const cities = await getCities();
  if (!Array.isArray(cities) || cities.length === 0) {
    cities = citiesFallback;
  }
  
  const recentCombos = await getRecentCityCategories(30);
  
  const categoryDistribution = {};
  for (let i = 0; i < count; i++) {
    const category = selectPlatformCategory();
    categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
  }
  
  console.log(`[DummyReq] Category distribution:`, categoryDistribution);
  
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
  
  for (const [platformCategory, categoryCount] of Object.entries(categoryDistribution)) {
    const shuffledCities = shuffleArray([...cities]);
    
    for (let i = 0; i < categoryCount; i++) {
      const city = shuffledCities[i % shuffledCities.length];
      const comboKey = `${city}|${platformCategory}`;
      
      if (recentCombos.has(comboKey) && generated.length < count * 2) {
        continue;
      }
      
      const product = getProduct(platformCategory);
      const quantity = getSmartQuantity(platformCategory);
      const unit = getSmartUnit(platformCategory, product);
      const brandData = getBrandModel(platformCategory);
      const condition = brandData.condition || randomItem(["new", "used"]);
      const details = generateDetail(platformCategory, quantity, unit, brandData);
      
      try {
        const offerInvitedFrom = platformCategory.includes("Raw Materials") || platformCategory.includes("Chemicals") || platformCategory.includes("Industrial") || platformCategory.includes("Electrical") ? "anywhere" : "city";
        
        const dummy = await DummyRequirement.create({
          product: product,
          quantity: quantity,
          unit: unit,
          city: String(city),
          category: platformCategory,
          isDummy: true,
          status: "new",
          details: details,
          reqType: platformCategory
        });
        
        const requirement = await Requirement.create({
          buyerId: dummyBuyer._id,
          city: String(city),
          category: platformCategory,
          productName: brandData.model ? `${brandData.brand} ${brandData.model}` : product,
          product: product,
          brand: brandData.brand || null,
          make: brandData.brand || null,
          typeModel: brandData.model || null,
          type: brandData.type || condition,
          condition: condition,
          quantity: String(quantity),
          details: details,
          status: "open",
          isAutoGenerated: true,
          offerInvitedFrom: offerInvitedFrom
        });
        
        dummy.realRequirementId = requirement._id;
        await dummy.save();
        
        generated.push(dummy);
        console.log(`[DummyReq] Generated: ${city} | ${platformCategory} | ${product}`);
        
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
    const requirementId = dummy.realRequirementId ? dummy.realRequirementId.toString() : dummy._id.toString();
    const deepLink = `https://hokoapp.in/seller/deeplink/${requirementId}`;
    
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
        `👉 ${deepLink}`
      ].join("\n");
    } else {
      message = [
        "🆕 New Buyer Requirement in " + dummy.city + ":",
        "",
        `📦 Product: ${dummy.product}`,
        `📍 Qty: ${dummy.quantity} ${dummy.unit || "pcs"}`,
        "",
        "💰 Submit your best offer:",
        `👉 ${deepLink}`
      ].join("\n");
    }
    
    try {
      const normalizedMobile = normalizeMobileE164(mobileE164);
      console.log(`[DummyReq] Sending to ${normalizedMobile}: ${dummy.product}`);
      await sendWhatsAppMessage({ to: normalizedMobile, body: message });
      await DummyRequirement.updateOne({ _id: dummy._id }, { $set: { status: "sent" } });
      console.log(`[DummyReq] Sent requirement ${dummy.product} to ${normalizedMobile}`);
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
