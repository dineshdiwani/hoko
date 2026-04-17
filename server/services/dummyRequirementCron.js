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
  if (!Array.isArray(arr) || arr.length === 0) {
    return null;
  }
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

function findMatchingTemplateKey(category, templateObj) {
  if (templateObj[category]) return category;
  const categoryLower = category.toLowerCase();
  for (const key of Object.keys(templateObj)) {
    if (categoryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(categoryLower)) {
      return key;
    }
  }
  return null;
}

function getBrandModel(platformCategory) {
  const matchKey = findMatchingTemplateKey(platformCategory, BRAND_MODEL_TEMPLATES);
  if (matchKey) {
    const templates = BRAND_MODEL_TEMPLATES[matchKey];
    if (templates && templates.length > 0) {
      const selected = randomItem(templates);
      if (selected) return selected;
    }
  }
  return { brand: null, model: null, type: null, condition: null };
}

function selectLanguage() {
  const rand = Math.random() * 100;
  if (rand < 70) return "english";
  if (rand < 90) return "hinglish";
  if (rand < 95) return "hindi";
  return "regional";
}

const REGIONAL_LANGUAGES = ["Tamil", "Telugu", "Marathi", "Gujarati", "Bengali", "Kannada", "Malayalam"];

const LANGUAGE_TEMPLATES = {
  english: {
    short: [
      "Price please?",
      "Needed urgently. Share your best price on HOKO.",
      "Share your lowest price",
      "Looking for best deal. Submit your offer on HOKO.",
      "Your price?",
      "Interested. Submit your best offer.",
      "Quick quote needed",
      "Available? Share price",
      "Need this. Best price?",
      "Urgent requirement. Price?",
      "Looking for {product}. Best price?"
    ],
    casual: [
      "Hi, we need {qty} {unit}. Submit your best price on HOKO.",
      "Hey, looking for {product}. What's your rate for {qty} {unit}?",
      "Do you have {product} in stock? Need about {qty} {unit}.",
      "Hi, interested in {product}. Submit your price for {qty} {unit} on HOKO.",
      "We need this urgently. Can you supply {qty} {unit}?",
      "Looking for supplier. Submit your best price on HOKO.",
      "Hi, can you arrange {qty} {unit}? What's the cost?",
      "Need {product} for our factory. {qty} {unit}. Submit your price on HOKO.",
      "Requirement for our plant. Can you supply {product}? Share price.",
      "We are interested in {product}. {qty} {unit} needed. Your rate?"
    ],
    detailed: [
      "Required for our {industry}. Need {qty} {unit}. Please share:\n- Best unit price\n- Delivery timeline\n- Payment terms\n- GST extra?",
      "We have a requirement for {product} ({qty} {unit}). Submit your best price on HOKO including:\n- Product specifications\n- Delivery schedule\n- Warranty details\n- GST invoice available?",
      "Business requirement - need {qty} {unit}. Submit on HOKO:\n- Complete pricing breakdown\n- Availability status\n- Expected delivery date\n- Payment options",
      "Procurement requirement for {product}. Qty: {qty} {unit}. Kindly share:\n- Per unit price\n- Bulk discount if applicable\n- Delivery timeline\n- Tax invoice mandatory"
    ],
    formal: [
      "We have a requirement for {product}. Quantity: {qty} {unit}. Please submit your quotation on HOKO with complete product details, pricing, and delivery timeline.",
      "Our organization requires {qty} {unit} of {product} for ongoing operations. Kindly submit your best offer on HOKO with technical specifications.",
      "Please quote for {product} ({qty} {unit}) on HOKO with details on pricing, availability, and delivery schedule.",
      "We require {product} for our upcoming project. Quantity: {qty} {unit}. Please share your competitive rates on HOKO along with product specifications."
    ],
    urgent: [
      "URGENT - Need {product} ({qty} {unit}) within {timeline}. Submit your best price on HOKO immediately.",
      "Urgent requirement! Need {product} ASAP. Qty: {qty} {unit}. Submit your best price on HOKO right away.",
      "Time-sensitive order. {product} ({qty} {unit}) needed by {timeline}. Submit your lowest price on HOKO immediately.",
      "Urgent procurement - {product} ({qty} {unit}) required by {timeline}. Submit your best rate on HOKO."
    ],
    negotiation: [
      "Looking for best price on {product}. We are serious buyers. Submit your lowest quote on HOKO.",
      "Ready to place order if price is competitive. Need {qty} {unit} of {product}. Submit your best price on HOKO?",
      "Multiple suppliers being contacted for {product}. Qty: {qty} {unit}. Lowest price wins. Submit your offer on HOKO.",
      "Comparing quotes for {product}. Need {qty} {unit}. Submit your best price on HOKO to get our business."
    ]
  },
  hinglish: {
    short: [
      "Price batao?",
      "Jaldi zaroorat hai. HOKO pe best price do.",
      "Sabse kam price batao",
      "Deal chahiye. HOKO pe offer do.",
      "Kitna loge?",
      "Interested hu. Best price do.",
      "Jaldi quote chahiye",
      "Hai kya? Price batao",
      "Chahiye ye. Best price?",
      "Emergency requirement. Price?",
      "{product} dhundh rahe hain. Best price?"
    ],
    casual: [
      "Hi, {qty} {unit} chahiye. HOKO pe best price do.",
      "Hey, {product} dhundh rahe hain. {qty} {unit} ka rate kya hoga?",
      "{product} stock mein hai? {qty} {unit} chahiye.",
      "Hi, {product} mein interested. HOKO pe price do.",
      "Jaldi chahiye. {qty} {unit} supply kar sakte ho?",
      "Supplier dhundh rahe. HOKO pe best price do.",
      "Hi, arrange kar sakte ho {qty} {unit}? Cost kya hoga?",
      "{product} factory ke liye chahiye. {qty} {unit}. HOKO pe price do.",
      "Plant ke liye requirement hai. {product} supply kar sakte ho?",
      "{product} mein interested hain. {qty} {unit} chahiye. Rate kya?"
    ],
    detailed: [
      "{industry} ke liye chahiye. {qty} {unit} zaroorat hai. Please share:\n- Per unit price\n- Delivery time\n- Payment terms\n- GST extra?",
      "{product} ki requirement hai ({qty} {unit}). HOKO pe best price do:\n- Product specifications\n- Delivery schedule\n- Warranty details\n- GST bill milega?",
      "Business requirement - {qty} {unit} chahiye. HOKO pe submit karo:\n- Complete price breakdown\n- Stock status\n- Delivery date\n- Payment options",
      "{product} procurement requirement. Qty: {qty} {unit}. Please share:\n- Per unit price\n- Bulk discount\n- Delivery timeline\n- Tax invoice mandatory"
    ],
    formal: [
      "{product} ki requirement hai. Quantity: {qty} {unit}. HOKO pe quotation do with complete details.",
      "Hamare organization ko {product} chahiye ({qty} {unit}). HOKO pe best offer do.",
      "{product} ke liye quote do ({qty} {unit}). HOKO pe pricing, availability aur delivery share karo.",
      "{product} chahiye upcoming project ke liye. Quantity: {qty} {unit}. HOKO pe competitive rates share karo."
    ],
    urgent: [
      "URGENT - {product} chahiye ({qty} {unit}) {timeline} tak. HOKO pe best price do.",
      "Jaldi requirement! {product} ASAP chahiye. Qty: {qty} {unit}. HOKO pe best price do.",
      "Time-sensitive order. {product} ({qty} {unit}) chahiye by {timeline}. HOKO pe lowest price do.",
      "Urgent procurement - {product} ({qty} {unit}) {timeline} tak. HOKO pe best rate do."
    ],
    negotiation: [
      "{product} pe best price dhundh rahe. Serious buyers hain. HOKO pe lowest quote do.",
      "Agar price competitive hai toh order denge. {qty} {unit} chahiye. HOKO pe best price do?",
      "{product} ke liye bahut suppliers contact kar rahe. Qty: {qty} {unit}. Lowest price wins. HOKO pe offer do.",
      "{product} quotes compare kar rahe hain. {qty} {unit} chahiye. HOKO pe best price do."
    ]
  },
  hindi: {
    short: [
      "कीमत बताओ?",
      "जल्दी जरूरत है। HOKO पर सबसे अच्छी कीमत दो।",
      "सबसे कम कीमत बताओ",
      "सौदा चाहिए। HOKO पर ऑफर दो।",
      "कितना लोगे?",
      "रुचि है। सबसे अच्छी कीमत दो।",
      "जल्दी कोट चाहिए",
      "उपलब्ध है? कीमत बताओ",
      "चाहिए ये। सबसे अच्छी कीमत?",
      "तत्काल जरूरत। कीमत?",
      "{product} खोज रहे हैं। सबसे अच्छी कीमत?"
    ],
    casual: [
      "नमस्ते, {qty} {unit} चाहिए। HOKO पर सबसे अच्छी कीमत दो।",
      "अरे, {product} खोज रहे हैं। {qty} {unit} का रेट क्या होगा?",
      "{product} स्टॉक में है? {qty} {unit} चाहिए।",
      "नमस्ते, {product} में रुचि है। HOKO पर कीमत दो।",
      "जल्दी चाहिए। {qty} {unit} सप्लाई कर सकते हो?",
      "सप्लायर खोज रहे। HOKO पर सबसे अच्छी कीमत दो।",
      "नमस्ते, arrange कर सकते हो {qty} {unit}? कॉस्ट क्या होगा?",
      "{product} फैक्ट्री के लिए चाहिए। {qty} {unit}। HOKO पर कीमत दो।",
      "प्लांट के लिए जरूरत है। {product} सप्लाई कर सकते हो?",
      "{product} में रुचि है। {qty} {unit} चाहिए। रेट क्या?"
    ],
    detailed: [
      "{industry} के लिए चाहिए। {qty} {unit} जरूरत है। कृपया बताओ:\n- प्रति यूनिट कीमत\n- डिलीवरी समय\n- भुगतान शर्तें\n- जीएसटी अलग?",
      "{product} की जरूरत है ({qty} {unit})। HOKO पर सबसे अच्छी कीमत दो:\n- उत्पाद विशिष्टताएं\n- डिलीवरी अनुसूची\n- वारंटी विवरण\n- जीएसटी बिल मिलेगा?",
      "व्यापारिक जरूरत - {qty} {unit} चाहिए। HOKO पर submit करो:\n- पूर्ण मूल्य विवरण\n- स्टॉक स्थिति\n- डिलीवरी तिथि\n- भुगतान विकल्प",
      "{product} खरीद जरूरत। मात्रा: {qty} {unit}। कृपया बताओ:\n- प्रति यूनिट कीमत\n- थोक छूट\n- डिलीवरी समय\n- टैक्स इनवॉइस अनिवार्य"
    ],
    formal: [
      "{product} की जरूरत है। मात्रा: {qty} {unit}। HOKO पर quotation दो।",
      "हमारे संगठन को {product} चाहिए ({qty} {unit})। HOKO पर सबसे अच्छा offer दो।",
      "{product} के लिए quote दो ({qty} {unit})। HOKO पर pricing, availability और delivery share करो।",
      "{product} चाहिए आगामी project के लिए। मात्रा: {qty} {unit}। HOKO पर competitive rates share करो।"
    ],
    urgent: [
      "तत्काल - {product} चाहिए ({qty} {unit}) {timeline} तक। HOKO पर सबसे अच्छी कीमत दो।",
      "जल्दी जरूरत! {product} ASAP चाहिए। मात्रा: {qty} {unit}। HOKO पर सबसे अच्छी कीमत दो।",
      "समय-संवेदनशील ऑर्डर। {product} ({qty} {unit}) चाहिए by {timeline}। HOKO पर सबसे कम कीमत दो।",
      "तत्काल खरीद - {product} ({qty} {unit}) {timeline} तक। HOKO पर सबसे अच्छा rate दो।"
    ],
    negotiation: [
      "{product} पर सबसे अच्छी कीमत खोज रहे। गंभीर खरीदार हैं। HOKO पर सबसे कम quote दो।",
      "अगर कीमत competitive है तो order देंगे। {qty} {unit} चाहिए। HOKO पर सबसे अच्छी कीमत दो?",
      "{product} के लिए कई suppliers contact कर रहे। मात्रा: {qty} {unit}। सबसे कम कीमत जीतेगी। HOKO पर offer दो।",
      "{product} quotes compare कर रहे हैं। {qty} {unit} चाहिए। HOKO पर सबसे अच्छी कीमत दो।"
    ]
  },
  regional: {
    tamil: {
      short: [
        "விலை சொல்லுங்க?",
        "உடனே தேவை. HOKO ல் சிறந்த விலை தருங்க.",
        "குறைந்த விலை சொல்லுங்க",
        "ஒப்பந்தம் வேணும். HOKO ல் ஆஃபர் தருக.",
        "எவ்ளோ விலை?"
      ],
      casual: [
        "வணக்கம், {qty} {unit} தேவை. HOKO ல் சிறந்த விலை தருக.",
        "ஏய், {product} தேடுகிறோம். {qty} {unit} க்கு விலை என்ன?",
        "{product} இருக்கா? {qty} {unit} தேவை."
      ],
      detailed: [
        "எங்களுக்கு {product} தேவை ({qty} {unit}). HOKO ல் விலை தருக:\n- Per unit price\n- Delivery time\n- Payment terms"
      ],
      formal: [
        "{product} தேவை. Quantity: {qty} {unit}. HOKO ல் quotation தருக.",
        "{product} க்கு quote தருக ({qty} {unit}). HOKO ல் pricing, availability தருக."
      ],
      urgent: [
        "அவசரம் - {product} தேவை ({qty} {unit}) {timeline}க்குள். HOKO ல் விலை தருக.",
        "உடனடி ஆர்டர். {product} ({qty} {unit}) தேவை. HOKO ல் சிறந்த விலை தருக."
      ],
      negotiation: [
        "{product} க்கு சிறந்த விலை தேடுகிறோம். HOKO ல் குறைந்த quote தருக.",
        "மல்ட்டிபிள் சப்ளையர்கள் contact பண்ணுகிறோம். {qty} {unit}. HOKO ல் offer தருக."
      ]
    },
    telugu: {
      short: [
        "ధర చెప్పండి?",
        "త్వరగా అవసరం. HOKO లో ఉత్తమ ధర ఇవ్వండి.",
        "తక్కువ ధర చెప్పండి",
        "డీల్ కావాలి. HOKO లో ఆఫర్ ఇవ్వండి."
      ],
      casual: [
        "నమస్కారం, {qty} {unit} కావాలి. HOKO లో ఉత్తమ ధర ఇవ్వండి.",
        "హాయ్, {product} వెతుకుతున్నాము. {qty} {unit} కు ధర ఎంత?",
        "{product} స్టాక్ లో ఉందా? {qty} {unit} కావాలి."
      ],
      detailed: [
        "మాకు {product} కావాలి ({qty} {unit}). HOKO లో ధర ఇవ్వండి:\n- Per unit price\n- Delivery time"
      ],
      formal: [
        "{product} అవసరం. Quantity: {qty} {unit}. HOKO లో quotation ఇవ్వండి.",
        "{product} కు quote ఇవ్వండి ({qty} {unit}). HOKO లో pricing చెప్పండి."
      ],
      urgent: [
        "అర్జెంట్ - {product} కావాలి ({qty} {unit}) {timeline} లోపు. HOKO లో ఉత్తమ ధర ఇవ్వండి.",
        "తక్కువ సమయంలో ఆర్డర్. {product} ({qty} {unit}) కావాలి. HOKO లో ధర ఇవ్వండి."
      ],
      negotiation: [
        "{product} కు ఉత్తమ ధర వెతుకుతున్నాము. HOKO లో తక్కువ quote ఇవ్వండి."
      ]
    },
    marathi: {
      short: [
        "किंमत सांगा?",
        "लवकर गरज आहे. HOKO वर सर्वोत्तम किंमत द्या.",
        "कमी किंमत सांगा",
        "deal हवे. HOKO वर offer द्या."
      ],
      casual: [
        "नमस्कार, {qty} {unit} हवे आहे. HOKO वर सर्वोत्तम किंमत द्या.",
        "हाय, {product} शोधत आहोत. {qty} {unit} साठी दर किती?",
        "{product} स्टॉक मध्ये आहे? {qty} {unit} हवे आहे."
      ],
      detailed: [
        "आम्हाला {product} हवे आहे ({qty} {unit}). HOKO वर किंमत द्या:\n- Per unit price\n- Delivery time"
      ],
      formal: [
        "{product} ची गरज आहे. Quantity: {qty} {unit}. HOKO वर quotation द्या."
      ],
      urgent: [
        "तात्काळ - {product} हवे आहे ({qty} {unit}) {timeline} पर्यंत. HOKO वर किंमत द्या."
      ],
      negotiation: [
        "{product} साठी सर्वोत्तम किंमत शोधत आहोत. HOKO वर offer द्या."
      ]
    },
    gujarati: {
      short: [
        "કિંમત કહો?",
        "ઝડપથી જરૂર છે. HOKO પર શ્રેષ્ઠ કિંમત આપો.",
        "ઓછી કિંમત કહો",
        "deal જોઈએ છે. HOKO પર offer આપો."
      ],
      casual: [
        "નમસ્તે, {qty} {unit} જોઈએ છે. HOKO પર શ્રેષ્ઠ કિંમત આપો.",
        "હાય, {product} શોધી રહ્યા છીએ. {qty} {unit} માટે ભાવ શું?",
        "{product} stock માં છે? {qty} {unit} જોઈએ છે."
      ],
      detailed: [
        "અમને {product} જોઈએ છે ({qty} {unit}). HOKO પર કિંમત આપો:\n- Per unit price\n- Delivery time"
      ],
      formal: [
        "{product} ની જરૂર છે. Quantity: {qty} {unit}. HOKO પર quotation આપો."
      ],
      urgent: [
        "તાત્કાલિક - {product} જોઈએ છે ({qty} {unit}) {timeline} સુધી. HOKO પર કિંમત આપો."
      ],
      negotiation: [
        "{product} માટે શ્રેષ્ઠ કિંમત શોધી રહ્યા છીએ. HOKO પર offer આપો."
      ]
    },
    bengali: {
      short: [
        "দাম বলুন?",
        "তাড়াতাড়ি দরকার। HOKO তে সেরা দাম দিন।",
        "কম দাম বলুন",
        "ডিল চাই। HOKO তে অফার দিন।"
      ],
      casual: [
        "নমস্কার, {qty} {unit} লাগবে। HOKO তে সেরা দাম দিন।",
        "হ্যাঁ, {product} খুঁজছি। {qty} {unit} এর দাম কত?",
        "{product} স্টকে আছে? {qty} {unit} লাগবে।"
      ],
      detailed: [
        "আমাদের {product} দরকার ({qty} {unit})। HOKO তে দাম দিন:\n- Per unit price\n- Delivery time"
      ],
      formal: [
        "{product} এর প্রয়োজন। Quantity: {qty} {unit}। HOKO তে quotation দিন।"
      ],
      urgent: [
        "জরুরি - {product} দরকার ({qty} {unit}) {timeline} এর মধ্যে। HOKO তে দাম দিন।"
      ],
      negotiation: [
        "{product} এর সেরা দাম খুঁজছি। HOKO তে অফার দিন।"
      ]
    },
    kannada: {
      short: [
        "ಬೆಲೆ ಹೇಳಿ?",
        "ತ್ವರಿತವಾಗಿ ಅಗತ್ಯವಿದೆ. HOKO ನಲ್ಲಿ ಉತ್ತಮ ಬೆಲೆ ನೀಡಿ.",
        "ಕಡಿಮೆ ಬೆಲೆ ಹೇಳಿ",
        "ಒಪ್ಪಂದ ಬೇಕು. HOKO ನಲ್ಲಿ ಆಫರ್ ನೀಡಿ."
      ],
      casual: [
        "ನಮಸ್ಕಾರ, {qty} {unit} ಬೇಕು. HOKO ನಲ್ಲಿ ಉತ್ತಮ ಬೆಲೆ ನೀಡಿ.",
        "ಹಾಯ್, {product} ಹುಡುಕುತ್ತಿದ್ದೇವೆ. {qty} {unit} ಗೆ ಬೆಲೆ ಎಷ್ಟು?"
      ],
      detailed: [
        "ನಮಗೆ {product} ಬೇಕು ({qty} {unit}). HOKO ನಲ್ಲಿ ಬೆಲೆ ನೀಡಿ:\n- Per unit price"
      ],
      formal: [
        "{product} ಅಗತ್ಯವಿದೆ. Quantity: {qty} {unit}. HOKO ನಲ್ಲಿ quotation ನೀಡಿ."
      ],
      urgent: [
        "ತುರ್ತು - {product} ಬೇಕು ({qty} {unit}) {timeline} ಒಳಗೆ. HOKO ನಲ್ಲಿ ಬೆಲೆ ನೀಡಿ."
      ],
      negotiation: [
        "{product} ಗೆ ಉತ್ತಮ ಬೆಲೆ ಹುಡುಕುತ್ತಿದ್ದೇವೆ. HOKO ನಲ್ಲಿ ಆಫರ್ ನೀಡಿ."
      ]
    },
    malayalam: {
      short: [
        "വില പറയൂ?",
        "വേഗം ആവശ്യമാണ്. HOKO ല്‍ മികച്ച വില തരൂ.",
        "കുറഞ്ഞ വില പറയൂ",
        "ഡീല്‍ വേണ്ടിയാണ്. HOKO ല്‍ ഓഫര്‍ തരൂ."
      ],
      casual: [
        "നമസ്കാരം, {qty} {unit} വേണം. HOKO ല്‍ മികച്ച വില തരൂ.",
        "ഹായ്, {product} തിരയുകയാണ്. {qty} {unit} എത്ര?",
        "{product} സ്റ്റോക്കിലുണ്ടോ? {qty} {unit} വേണം."
      ],
      detailed: [
        "ഞങ്ങള്‍ക്ക് {product} വേണം ({qty} {unit}). HOKO ല്‍ വില തരൂ:\n- Per unit price"
      ],
      formal: [
        "{product} ആവശ്യമാണ്. Quantity: {qty} {unit}. HOKO ല്‍ quotation തരൂ."
      ],
      urgent: [
        "അടിയന്തരം - {product} വേണം ({qty} {unit}) {timeline} ന്റെയുള്ളില്‍. HOKO ല്‍ വില തരൂ."
      ],
      negotiation: [
        "{product} ന് മികച്ച വില തിരയുകയാണ്. HOKO ല്‍ ഓഫര്‍ തരൂ."
      ]
    }
  }
};

const DETAIL_STYLES = {
  short: [
    "Price please?",
    "Needed urgently. Share your best price on HOKO.",
    "Share your lowest price",
    "Looking for best deal. Submit your offer on HOKO.",
    "Your price?",
    "Interested. Submit your best offer.",
    "Quick quote needed",
    "Available? Share price",
    "Need this. Best price?",
    "Urgent requirement. Price?",
    "Looking for {product}. Best price?"
  ],
  casual: [
    "Hi, we need {qty} {unit}. Submit your best price on HOKO.",
    "Hey, looking for {product}. What's your rate for {qty} {unit}?",
    "Do you have {product} in stock? Need about {qty} {unit}.",
    "Hi, interested in {product}. Submit your price for {qty} {unit} on HOKO.",
    "We need this urgently. Can you supply {qty} {unit}?",
    "Looking for supplier. Submit your best price on HOKO.",
    "Hi, can you arrange {qty} {unit}? What's the cost?",
    "Need {product} for our factory. {qty} {unit}. Submit your price on HOKO.",
    "Requirement for our plant. Can you supply {product}? Share price.",
    "We are interested in {product}. {qty} {unit} needed. Your rate?"
  ],
  detailed: [
    "Required for our {industry}. Need {qty} {unit}. Please share:\n- Best unit price\n- Delivery timeline\n- Payment terms\n- GST extra?",
    "We have a requirement for {product} ({qty} {unit}). Submit your best price on HOKO including:\n- Product specifications\n- Delivery schedule\n- Warranty details\n- GST invoice available?",
    "Business requirement - need {qty} {unit}. Submit on HOKO:\n- Complete pricing breakdown\n- Availability status\n- Expected delivery date\n- Payment options",
    "Procurement requirement for {product}. Qty: {qty} {unit}. Kindly share:\n- Per unit price\n- Bulk discount if applicable\n- Delivery timeline\n- Tax invoice mandatory"
  ],
  formal: [
    "We have a requirement for {product}. Quantity: {qty} {unit}. Please submit your quotation on HOKO with complete product details, pricing, and delivery timeline.",
    "Our organization requires {qty} {unit} of {product} for ongoing operations. Kindly submit your best offer on HOKO with technical specifications.",
    "Please quote for {product} ({qty} {unit}) on HOKO with details on pricing, availability, and delivery schedule.",
    "We require {product} for our upcoming project. Quantity: {qty} {unit}. Please share your competitive rates on HOKO along with product specifications."
  ],
  urgent: [
    "URGENT - Need {product} ({qty} {unit}) within {timeline}. Submit your best price on HOKO immediately.",
    "Urgent requirement! Need {product} ASAP. Qty: {qty} {unit}. Submit your best price on HOKO right away.",
    "Time-sensitive order. {product} ({qty} {unit}) needed by {timeline}. Submit your lowest price on HOKO immediately.",
    "Urgent procurement - {product} ({qty} {unit}) required by {timeline}. Submit your best rate on HOKO."
  ],
  negotiation: [
    "Looking for best price on {product}. We are serious buyers. Submit your lowest quote on HOKO.",
    "Ready to place order if price is competitive. Need {qty} {unit} of {product}. Submit your best price on HOKO?",
    "Multiple suppliers being contacted for {product}. Qty: {qty} {unit}. Lowest price wins. Submit your offer on HOKO.",
    "Comparing quotes for {product}. Need {qty} {unit}. Submit your best price on HOKO to get our business."
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
  const fallback = Object.keys(PLATFORM_CATEGORY_WEIGHTS);
  return Array.isArray(fallback) ? fallback : [];
}

async function getUnits() {
  try {
    const settings = await PlatformSettings.findOne().lean();
    const units = settings?.units;
    if (Array.isArray(units) && units.length > 0) {
      return units;
    }
  } catch (err) {
    console.log("[DummyReq] getUnits error:", err.message);
  }
  return ["pcs", "kg", "liter", "units", "bags"];
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

async function selectPlatformCategory() {
  const categories = await getCategories();
  if (!Array.isArray(categories) || categories.length === 0) {
    const keys = Object.keys(PLATFORM_CATEGORY_WEIGHTS);
    return keys.length > 0 ? keys[0] : "Electronics & Appliances";
  }
  const selected = randomItem(categories);
  return selected || "Electronics & Appliances";
}

function getSmartQuantity(platformCategory, product) {
  const productLower = String(product || "").toLowerCase();
  
  if (platformCategory.includes("Electronics & Appliances")) {
    if (productLower.includes("tv") || productLower.includes("led") || productLower.includes("smart tv")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("refrigerator") || productLower.includes("fridge")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("ac") || productLower.includes("air conditioner")) {
      return randomItem([1, 2, 3, 5]);
    }
    if (productLower.includes("washing machine") || productLower.includes("washer")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("laptop") || productLower.includes("macbook") || productLower.includes("notebook") || productLower.includes("computer")) {
      return randomItem([1, 2, 5]);
    }
    if (productLower.includes("smartphone") || productLower.includes("iphone") || productLower.includes("phone") || productLower.includes("mobile")) {
      return randomItem([1, 2, 5, 10]);
    }
    if (productLower.includes("headphone") || productLower.includes("earphone") || productLower.includes("earbud") || productLower.includes("audio")) {
      return randomItem([1, 2, 5, 10]);
    }
    if (productLower.includes("camera") || productLower.includes("dslr") || productLower.includes("mirrorless")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("console") || productLower.includes("playstation") || productLower.includes("xbox")) {
      return randomItem([1, 2, 3]);
    }
    return randomItem([1, 2, 3, 5]);
  }
  
  if (platformCategory.includes("Furniture & Home")) {
    if (productLower.includes("bed") || productLower.includes("mattress")) {
      return randomItem([1, 2, 5]);
    }
    if (productLower.includes("sofa") || productLower.includes("couch")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("chair") && !productLower.includes("office")) {
      return randomItem([2, 4, 6, 10]);
    }
    if (productLower.includes("office chair")) {
      return randomItem([1, 2, 5, 10]);
    }
    if (productLower.includes("table") || productLower.includes("dining")) {
      return randomItem([1, 2, 5]);
    }
    if (productLower.includes("kitchen") || productLower.includes("modular")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("tv unit") || productLower.includes("cabinet")) {
      return randomItem([1, 2, 3]);
    }
    return randomItem([1, 2, 5]);
  }
  
  if (platformCategory.includes("Vehicles") || productLower.includes("car") || productLower.includes("vehicle") || productLower.includes("suv") || productLower.includes("sedan") || productLower.includes("hatchback") || productLower.includes("compact")) {
    return randomItem([1, 2, 3, 5]);
  }
  
  if (platformCategory.includes("Services") || platformCategory.includes("Logistics") || platformCategory.includes("Business")) {
    if (productLower.includes("catering") || productLower.includes("event") || productLower.includes("decoration") || productLower.includes("wedding")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("truck") || productLower.includes("container")) {
      return randomItem([1, 2, 5, 10]);
    }
    if (productLower.includes("packer") || productLower.includes("mover") || productLower.includes("2bhk") || productLower.includes("3bhk")) {
      return randomItem([1, 2, 3]);
    }
    if (productLower.includes("warehouse") || productLower.includes("storage") || productLower.includes("rental")) {
      return randomItem([1, 2, 3, 5]);
    }
    if (productLower.includes("consulting") || productLower.includes("marketing") || productLower.includes("development") || productLower.includes("legal")) {
      return randomItem([1, 2, 3]);
    }
    return 1;
  }
  
  if (productLower.includes("motor") || productLower.includes("generator") || productLower.includes("lathe") || productLower.includes("cnc") || productLower.includes("welder") || productLower.includes("pump")) {
    return randomItem([1, 2, 3, 5]);
  }
  
  if (productLower.includes("wire") || productLower.includes("cable")) {
    return randomItem([5, 10, 20, 50, 100]);
  }
  
  if (productLower.includes("bearing")) {
    return randomItem([10, 20, 50, 100, 200]);
  }
  
  if (productLower.includes("bar") || productLower.includes("steel") || productLower.includes("beam") || productLower.includes("cement") || productLower.includes("panel") || productLower.includes("tmt")) {
    return randomItem([50, 100, 200, 500]);
  }
  
  if (productLower.includes("scrap") || productLower.includes("ore") || productLower.includes("ingot")) {
    return randomItem([1, 5, 10, 20, 50]);
  }
  
  if (productLower.includes("grain") || productLower.includes("rice") || productLower.includes("wheat")) {
    return randomItem([5, 10, 20, 50, 100]);
  }
  
  if (productLower.includes("granule") || productLower.includes("resin") || productLower.includes("poly") || productLower.includes("hdpe") || productLower.includes("pvc") || productLower.includes("abs")) {
    return randomItem([500, 1000, 2000, 5000]);
  }
  
  if (productLower.includes("mask") || productLower.includes("glove") || productLower.includes("helmet") || productLower.includes("first aid")) {
    return randomItem([10, 25, 50, 100, 200]);
  }
  
  if (productLower.includes("fabric") || productLower.includes("cloth") || productLower.includes("cotton") || productLower.includes("polyester")) {
    return randomItem([10, 25, 50, 100]);
  }
  
  if (productLower.includes("shirt") || productLower.includes("wear") || productLower.includes("garment") || productLower.includes("workwear") || productLower.includes("readymade")) {
    return randomItem([25, 50, 100, 250]);
  }
  
  if (productLower.includes("box") || productLower.includes("corrugated")) {
    return randomItem([50, 100, 250, 500, 1000]);
  }
  
  if (productLower.includes("tape") || productLower.includes("wrap") || productLower.includes("film") || productLower.includes("bubble")) {
    return randomItem([10, 25, 50, 100]);
  }
  
  if (productLower.includes("fertilizer") || productLower.includes("sprayer") || productLower.includes("agricultural")) {
    return randomItem([10, 25, 50, 100]);
  }
  
  if (productLower.includes("mcb") || productLower.includes("switchgear") || productLower.includes("vfd") || productLower.includes("plc") || productLower.includes("breaker") || productLower.includes("valve") || productLower.includes("transmitter")) {
    return randomItem([5, 10, 20, 50]);
  }
  
  if (platformCategory.includes("Industrial") || platformCategory.includes("Electrical")) {
    return randomItem([1, 2, 5, 10]);
  }
  
  if (platformCategory.includes("Raw Materials") || platformCategory.includes("Chemicals") || platformCategory.includes("Food") || platformCategory.includes("Construction")) {
    return randomItem([10, 25, 50, 100]);
  }
  
  if (platformCategory.includes("Packaging") || platformCategory.includes("Textiles") || platformCategory.includes("Health")) {
    return randomItem([10, 25, 50, 100]);
  }
  
  return randomItem([1, 2, 5, 10]);
}

async function getSmartUnit(platformCategory, product) {
  const productLower = String(product || "").toLowerCase();
  const adminUnits = await getUnits();
  const baseUnits = Array.isArray(adminUnits) && adminUnits.length > 0 ? adminUnits : ["pcs", "units", "nos"];
  
  let categoryUnits = [...baseUnits];
  
  if (platformCategory.includes("Raw Materials") || platformCategory.includes("Chemicals") || platformCategory.includes("Food")) {
    categoryUnits = [...baseUnits, "kg", "quintal", "ton", "liter", "bags"];
  }
  if (platformCategory.includes("Services") || platformCategory.includes("Business")) {
    if (productLower.includes("catering") || productLower.includes("guest") || productLower.includes("people")) {
      categoryUnits = [...baseUnits, "people", "guests", "persons", "plates"];
    } else if (productLower.includes("consulting") || productLower.includes("service") || productLower.includes("hour")) {
      categoryUnits = [...baseUnits, "hours", "sessions", "package"];
    } else {
      categoryUnits = [...baseUnits, "service", "job", "set"];
    }
  }
  if (platformCategory.includes("Logistics")) {
    if (productLower.includes("packer") || productLower.includes("mover") || productLower.includes("2bhk") || productLower.includes("3bhk")) {
      categoryUnits = [...baseUnits, "service", "job", "house"];
    } else if (productLower.includes("truck") || productLower.includes("container") || productLower.includes("ton")) {
      categoryUnits = [...baseUnits, "trips", "capacity"];
    } else if (productLower.includes("sqft") || productLower.includes("warehouse")) {
      categoryUnits = [...baseUnits, "sqft", "sq.ft", "area"];
    } else {
      categoryUnits = [...baseUnits, "service"];
    }
  }
  if (platformCategory.includes("Vehicles")) {
    categoryUnits = [...baseUnits, "vehicles", "nos"];
  }
  if (platformCategory.includes("Industrial") || platformCategory.includes("Electrical")) {
    if (productLower.includes("motor") || productLower.includes("generator") || productLower.includes("machine") || productLower.includes("welder") || productLower.includes("lathe") || productLower.includes("cnc") || productLower.includes("pump")) {
      categoryUnits = [...baseUnits, "sets"];
    } else if (productLower.includes("wire") || productLower.includes("cable")) {
      categoryUnits = [...baseUnits, "roll", "mtr", "coils"];
    } else if (productLower.includes("bearing")) {
      categoryUnits = [...baseUnits, "packs", "sets"];
    } else if (productLower.includes("valve") || productLower.includes("meter") || productLower.includes("switchgear") || productLower.includes("MCB") || productLower.includes("VFD") || productLower.includes("PLC") || productLower.includes("drive") || productLower.includes("transmitter")) {
      categoryUnits = [...baseUnits, "modules"];
    }
  }
  if (platformCategory.includes("Construction")) {
    if (productLower.includes("bar") || productLower.includes("steel") || productLower.includes("beam") || productLower.includes("panel")) {
      categoryUnits = [...baseUnits, "mtr", "lengths"];
    } else if (productLower.includes("cement") || productLower.includes("bag")) {
      categoryUnits = [...baseUnits, "tons"];
    }
  }
  if (platformCategory.includes("Packaging")) {
    if (productLower.includes("box") || productLower.includes("roll") || productLower.includes("film") || productLower.includes("wrap")) {
      categoryUnits = [...baseUnits, "rolls", "boxes"];
    }
  }
  if (platformCategory.includes("Textiles")) {
    if (productLower.includes("fabric") || productLower.includes("roll")) {
      categoryUnits = [...baseUnits, "meters", "rolls"];
    } else if (productLower.includes("shirt") || productLower.includes("wear") || productLower.includes("garment")) {
      categoryUnits = [...baseUnits, "dozens"];
    }
  }
  if (platformCategory.includes("Health")) {
    if (productLower.includes("mask") || productLower.includes("glove") || productLower.includes("kit")) {
      categoryUnits = [...baseUnits, "boxes"];
    }
  }
  
  const selectedUnit = randomItem(categoryUnits);
  return selectedUnit || "pcs";
}

function getProduct(platformCategory) {
  const matchKey = findMatchingTemplateKey(platformCategory, PLATFORM_CATEGORY_TEMPLATES);
  if (matchKey) {
    const products = PLATFORM_CATEGORY_TEMPLATES[matchKey];
    if (products && products.length > 0) {
      const selected = randomItem(products);
      if (selected) return selected;
    }
  }
  return `${platformCategory} Product`;
}

function generateDetail(platformCategory, quantity, unit, brandData = {}) {
  const styleRoll = Math.random();
  const lang = selectLanguage();
  let templates;
  
  if (lang === "regional") {
    const regionalLang = randomItem(REGIONAL_LANGUAGES).toLowerCase();
    templates = LANGUAGE_TEMPLATES.regional[regionalLang] || LANGUAGE_TEMPLATES.english;
  } else {
    templates = LANGUAGE_TEMPLATES[lang] || LANGUAGE_TEMPLATES.english;
  }
  
  let detail;
  if (styleRoll < 0.15) {
    detail = randomItem(templates.short) || "Looking for {product}. Best price?";
  } else if (styleRoll < 0.35) {
    detail = randomItem(templates.casual) || "Hi, looking for {product}. What's your rate?";
  } else if (styleRoll < 0.55) {
    detail = randomItem(templates.detailed) || "We have a requirement for {product}. Please share your best price.";
  } else if (styleRoll < 0.70) {
    detail = randomItem(templates.formal) || "We have a requirement for {product}. Please submit your quotation.";
  } else if (styleRoll < 0.85) {
    detail = randomItem(templates.urgent) || "URGENT - Need {product}. Please confirm availability.";
  } else {
    detail = randomItem(templates.negotiation) || "Looking for best price on {product}.";
  }
  
  if (hasBrand) {
    detail = detail.replace("{product}", `${brandData.brand} ${brandData.model}`);
  } else {
    detail = detail.replace("{product}", randomItem(PLATFORM_CATEGORY_TEMPLATES[platformCategory]) || "this item");
  }
  
  detail = detail.replace("{timeline}", randomItem(TIMELINES) || "ASAP");
  detail = detail.replace("{budget}", randomItem(BUDGETS) || "Competitive pricing required");
  detail = detail.replace("{qty}", String(quantity || ""));
  detail = detail.replace("{unit}", String(unit || "pcs"));
  detail = detail.replace("{industry}", randomItem(["factory", "warehouse", "office", "plant", "manufacturing unit", "warehouse"]) || "factory");
  
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
  
  const adminCategories = await getCategories();
  const recentCombos = await getRecentCityCategories(30);
  
  const categoryDistribution = {};
  for (let i = 0; i < count; i++) {
    const category = await selectPlatformCategory();
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
      
      const product = getProduct(platformCategory, adminCategories);
      const quantity = getSmartQuantity(platformCategory, product);
      const unit = await getSmartUnit(platformCategory, product);
      const brandData = getBrandModel(platformCategory, adminCategories);
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
          unit: unit,
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
