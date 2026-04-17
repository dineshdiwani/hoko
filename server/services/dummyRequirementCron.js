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

const PRODUCT_MASTER = [
  // ELECTRONICS & APPLIANCES
  { category: "Electronics & Appliances", product: "LED Smart TV", brand: "Samsung", model: "55 inch 4K", type: "LED TV", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Smart LED, WiFi, 4K Ultra HD, HDR, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "LED Smart TV", brand: "LG", model: "43 inch Full HD", type: "LED TV", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Full HD, WebOS, HDR, WiFi, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Frost Free Refrigerator", brand: "Samsung", model: "253L", type: "Refrigerator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Frost Free, 5 Star Rating, Digital Inverter, 10 Year Compressor Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Frost Free Refrigerator", brand: "LG", model: "260L", type: "Refrigerator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Frost Free, Linear Compressor, 5 Star, Smart Diagnosis, 10 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Split AC", brand: "Daikin", model: "1.5 Ton", type: "Split AC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Inverter, 5 Star Rating, PM2.5 Filter, Copper Coil, 5 Year Warranty on Compressor, GST Invoice" },
  { category: "Electronics & Appliances", product: "Split AC", brand: "Voltas", model: "1.5 Ton", type: "Split AC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Inverter, 3 Star Rating, High Ambient Cooling, Copper Coil, 5 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Fully Automatic Washing Machine", brand: "LG", model: "7kg", type: "Washing Machine", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Front Load, 1400 RPM, 6 Motion DD, Steam Care, 10 Year Motor Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Fully Automatic Washing Machine", brand: "Samsung", model: "6.5kg", type: "Washing Machine", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Top Load, 680 RPM, Diamond Drum, Digital Inverter, 5 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Laptop", brand: "Dell", model: "Inspiron 15", type: "Laptop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Intel i5 12th Gen, 8GB RAM, 512GB SSD, Windows 11, 2 Year On-site Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Laptop", brand: "HP", model: "15s", type: "Laptop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "AMD Ryzen 5, 16GB RAM, 512GB SSD, Windows 11, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Laptop", brand: "Lenovo", model: "IdeaPad 14", type: "Laptop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Intel i3 11th Gen, 8GB RAM, 256GB SSD, Windows 11, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Smartphone", brand: "Samsung", model: "Galaxy S24", type: "Smartphone", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "8GB RAM, 256GB Storage, 5G, AI Camera, 1 Year Manufacturer Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Smartphone", brand: "Apple", model: "iPhone 15", type: "Smartphone", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "A16 Bionic, 128GB, 5G, USB-C, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Headphones", brand: "Sony", model: "WH-1000XM5", type: "Headphones", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Wireless NC, 30hr Battery, Hi-Res Audio, Multipoint Connection, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "DSLR Camera", brand: "Canon", model: "EOS 1500D", type: "Camera", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "24.1MP, WiFi, Full HD, EF-S 18-55mm Lens, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Gaming Console", brand: "Sony", model: "PlayStation 5", type: "Gaming Console", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "825GB SSD, 4K Gaming, Ray Tracing, DualSense Controller, 1 Year Warranty, GST Invoice" },

  // FURNITURE & HOME
  { category: "Furniture & Home", product: "King Size Bed", brand: "UrbanLadder", model: "6x6 feet", type: "Bed", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Sheesham Wood, Hydraulic Storage, Mattress Included, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "L-Shaped Sofa", brand: "Fabindia", model: "6 Seater", type: "Sofa", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Velvet Fabric, Solid Wood Frame, Cushion Included, 3 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Dining Table Set", brand: null, model: "6 Chairs", type: "Dining Table", unit: "sets", qtyMin: 1, qtyMax: 3, specs: "Solid Wood, 6 Cushioned Chairs, Glass Top, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Office Executive Chair", brand: "Godrej", model: "Ergo", type: "Chair", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "Ergonomic, Mesh Back, Adjustable Armrest, lumbar Support, 3 Year Warranty, GST Invoice" },
  { category: "Furniture & Home", product: "Modular Kitchen", brand: null, model: "L-Shape", type: "Kitchen", unit: "sets", qtyMin: 1, qtyMax: 2, specs: "BWP Plywood, Soft Close, Hettich Hardware, Counter Top Included, Delivery + Installation, GST Invoice" },
  { category: "Furniture & Home", product: "TV Unit", brand: null, model: "Wall Mounted", type: "TV Unit", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Engineered Wood, Gloss Finish, Cable Management, 3 Year Warranty, Delivery + Installation" },

  // VEHICLES & PARTS
  { category: "Vehicles & Parts", product: "Sedan Car", brand: "Maruti", model: "Swift Dzire", type: "Sedan", unit: "pcs", qtyMin: 1, qtyMax: 5, condition: "used", specs: "2022 Model, Petrol, 15000km Driven, Insurance Valid, Service Records, Transfer Included" },
  { category: "Vehicles & Parts", product: "SUV Vehicle", brand: "Toyota", model: "Innova Crysta", type: "SUV", unit: "pcs", qtyMin: 1, qtyMax: 3, condition: "used", specs: "2021 Model, Diesel, 45000km Driven, Top Model, Insurance Valid, Full Service History, Transfer Included" },
  { category: "Vehicles & Parts", product: "SUV Vehicle", brand: "Tata", model: "Nexon", type: "SUV", unit: "pcs", qtyMin: 1, qtyMax: 5, condition: "new", specs: "2024 Model, Petrol/Diesel, BS6, 5 Star Safety, Warranty 3 Years/100000km, Immediate Delivery, GST Invoice" },
  { category: "Vehicles & Parts", product: "Hatchback Car", brand: "Maruti", model: "Swift", type: "Hatchback", unit: "pcs", qtyMin: 1, qtyMax: 5, condition: "new", specs: "2024 Model, Petrol, BS6, 5 Star Safety, CNG Option, Warranty 2 Years/100000km, Immediate Delivery, GST Invoice" },
  { category: "Vehicles & Parts", product: "Compact SUV", brand: "Hyundai", model: "Creta", type: "SUV", unit: "pcs", qtyMin: 1, qtyMax: 3, condition: "used", specs: "2022 Model, Petrol, 25000km Driven, Top Model, Sunroof, Insurance Valid, Transfer Included" },
  { category: "Vehicles & Parts", product: "Two Wheeler", brand: "Honda", model: "Activa", type: "Scooter", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "2024 Model, Petrol, LED Headlamp, CBS/ABS, 5 Year Warranty, EMI Available, GST Invoice" },

  // INDUSTRIAL MACHINERY
  { category: "Industrial Machinery", product: "Three Phase Motor", brand: "ABB", model: "5HP", type: "Motor", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "3 Phase, 1440 RPM, F Class Insulation, IE3 Efficiency, Test Certificate, GST Invoice" },
  { category: "Industrial Machinery", product: "AC Motor", brand: "Siemens", model: "7.5HP", type: "Motor", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "3 Phase, 1450 RPM, TEFC, IE3 Premium, Warranty 2 Years, Test Certificate, GST Invoice" },
  { category: "Industrial Machinery", product: "Diesel Generator", brand: "Kirloskar", model: "25kVA", type: "Generator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Silent Canopy, Sound Proof, ATS Panel, 250 Hours Runtime, Warranty 2 Years, GST Invoice" },
  { category: "Industrial Machinery", product: "MIG Welding Machine", brand: "Miller", model: "400A", type: "Welder", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "400A Output, IGBT Based, Water Cooled Torch, Digital Display, 1 Year Warranty, GST Invoice" },
  { category: "Industrial Machinery", product: "CNC Lathe", brand: "ACE", model: "CNC 200", type: "CNC Lathe", unit: "pcs", qtyMin: 1, qtyMax: 2, specs: "200mm Chuck, 8 Station Turret, Spindle Speed 50-3000 RPM, Siemens/Fanuc Controller, Training Included, GST Invoice" },
  { category: "Industrial Machinery", product: "Industrial Pump", brand: "Kirloskar", model: "5HP", type: "Pump", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Centrifugal, Cast Iron, 2880 RPM, 50mm Outlet, 2 Year Warranty, GST Invoice" },

  // ELECTRICAL PARTS
  { category: "Electrical Parts", product: "Copper Wire", brand: "Havells", model: "1.5sqmm 90mtr", type: "Wire", unit: "roll", qtyMin: 5, qtyMax: 50, specs: "FR Grade, HRFR, 1100V, ISI Marked, Copper 99.97% Pure, GST Invoice" },
  { category: "Electrical Parts", product: "Electric Wire", brand: "Polycab", model: "2.5sqmm 90mtr", type: "Wire", unit: "roll", qtyMin: 5, qtyMax: 50, specs: "FR Grade, HRFR, 1100V, ISI Marked, 100m Length, GST Invoice" },
  { category: "Electrical Parts", product: "Ball Bearing", brand: "SKF", model: "6205", type: "Bearing", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "Deep Groove, 25x52x15mm, Steel Shield, C3 Clearance, OEM Quality, GST Invoice" },
  { category: "Electrical Parts", product: "MCB Circuit Breaker", brand: "Havells", model: "32A", type: "MCB", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "Single Pole, C Curve, 10kA Breaking Capacity, ISI Marked, 2 Year Warranty, GST Invoice" },
  { category: "Electrical Parts", product: "VFD Drive", brand: "ABB", model: "ACS550 10HP", type: "VFD", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "7.5kW, 3 Phase, 380-480V, Built-in EMC Filter, 2 Year Warranty, GST Invoice" },
  { category: "Electrical Parts", product: "PLC Controller", brand: "Allen Bradley", model: "1756", type: "PLC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "ControlLogix, 16 I/O, Ethernet/IP, 2MB Memory, Original OEM, GST Invoice" },

  // CONSTRUCTION MATERIALS
  { category: "Construction Materials", product: "TMT Bar", brand: "Tata", model: "12mm Fe500", type: "TMT Bar", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "Fe500D, UTS 545+, earthquake Resistant, Anti Corrosion, Mill Test Certificate, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "TMT Bar", brand: "JSW", model: "16mm Fe550", type: "TMT Bar", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "Fe550D, Superior Bendability, ISI Marked, Quality Certificate, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Cement", brand: "ACC", model: "53 Grade", type: "Cement", unit: "bags", qtyMin: 50, qtyMax: 500, specs: "OPC 53S, Initial Strength 27MPa, Low Heat of Hydration, ISI Marked, 6 Month Shelf Life, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Cement", brand: "Ultratech", model: "OPC 53", type: "Cement", unit: "bags", qtyMin: 50, qtyMax: 500, specs: "OPC 53 Grade, Superior Strength, Fast Setting, ISI Marked, Quality Guaranteed, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Steel Beam", brand: "JSW", model: "Structural", type: "Steel Beam", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "ISMB 200, Hot Rolled, IS 2062 E250, Test Certificate, Fabrication Available, GST Invoice" },
  { category: "Construction Materials", product: "Aluminum Panel", brand: "Alstrong", model: "4mm ACP", type: "ACP Sheet", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "4mm Thickness, PVDF Coating, Fire Retardant, 2440x1220mm Sheet, 10 Year Warranty, GST Invoice" },
  { category: "Construction Materials", product: "Bricks", brand: null, model: "Red Clay", type: "Brick", unit: "pcs", qtyMin: 1000, qtyMax: 10000, specs: "230x115x75mm, Class A, Compressive Strength 10MPa, Uniform Shape, Delivery Available, GST Invoice" },
  { category: "Construction Materials", product: "Sand", brand: null, model: "River Sand", type: "Sand", unit: "ton", qtyMin: 5, qtyMax: 50, specs: "Cubic Delivered, Zone 2-3, Low Silt, Washed and Screened, Quality Report, Delivery Included" },

  // RAW MATERIALS
  { category: "Raw Materials", product: "Aluminum Ingot", brand: null, model: "Primary Grade", type: "Aluminum", unit: "ton", qtyMin: 1, qtyMax: 20, specs: "99.7% Pure, Ingot Form, LM6/LM24 Grade, Chemical Composition Report, GST Invoice" },
  { category: "Raw Materials", product: "Copper Scrap", brand: null, model: "Bare Bright", type: "Copper Scrap", unit: "kg", qtyMin: 100, qtyMax: 1000, specs: "99.9% Pure, No Insulation, Bright Bare Wire, Lab Test Report, GST Invoice" },
  { category: "Raw Materials", product: "MS Scrap", brand: null, model: "Heavy Melting", type: "MS Scrap", unit: "ton", qtyMin: 5, qtyMax: 50, specs: "HMS 1&2, 98% Metal Recovery, No Radiated, Lab Tested, GST Invoice" },
  { category: "Raw Materials", product: "Steel Scrap", brand: null, model: "Shredded", type: "Steel Scrap", unit: "ton", qtyMin: 5, qtyMax: 30, specs: "Shredded Form, ISRI 211-214, 98.5% Pure, No Contamination, GST Invoice" },
  { category: "Raw Materials", product: "Iron Ore", brand: null, model: "Fines 63%", type: "Iron Ore", unit: "ton", qtyMin: 100, qtyMax: 1000, specs: "Fe 63%+, Low Silica, Moisture 4% Max, Chrome 0.1% Max, Assay Report, GST Invoice" },

  // CHEMICALS & PLASTICS
  { category: "Chemicals & Plastics", product: "HDPE Granules", brand: "Reliance", model: "Injection Grade", type: "HDPE", unit: "kg", qtyMin: 500, qtyMax: 5000, specs: "MFI 20, Natural Color, Food Grade, BIS Approved, Technical Data Sheet, GST Invoice" },
  { category: "Chemicals & Plastics", product: "PVC Resin", brand: "Finolex", model: "SG5", type: "PVC", unit: "kg", qtyMin: 500, qtyMax: 5000, specs: "K Value 67, Suspension Polymer, BIS Certified, Technical Data Sheet, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Polypropylene Granules", brand: "Reliance", model: "PP H110MA", type: "PP Granules", unit: "kg", qtyMin: 500, qtyMax: 5000, specs: "MFI 3, Homopolymer, Injection Molding Grade, BIS Approved, TDS Available, GST Invoice" },
  { category: "Chemicals & Plastics", product: "LDPE Film", brand: "Standard", model: "Film Grade", type: "LDPE", unit: "kg", qtyMin: 200, qtyMax: 2000, specs: "MFI 2, Natural, Blown Film Grade, Food Contact Approved, TDS Available, GST Invoice" },
  { category: "Chemicals & Plastics", product: "ABS Granules", brand: "LG Chem", model: "HF-6560", type: "ABS", unit: "kg", qtyMin: 200, qtyMax: 2000, specs: "High Flow, Impact Modified, Heat Resistant, OEM Grade, TDS Available, GST Invoice" },

  // PACKAGING
  { category: "Packaging", product: "Corrugated Box", brand: null, model: "5 Ply", type: "Box", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "5 Ply, Bursting Strength 12kg/cm2, Custom Sizes, Printing Available, MOQ 50, GST Invoice" },
  { category: "Packaging", product: "Stretch Film Roll", brand: null, model: "23 mic", type: "Film", unit: "roll", qtyMin: 10, qtyMax: 100, specs: "23 Micron, 500mm Width, 300m Length, Load Capacity 200kg, UV Stabilized, GST Invoice" },
  { category: "Packaging", product: "Bubble Wrap Roll", brand: null, model: "5mm Bubble", type: "Bubble Wrap", unit: "roll", qtyMin: 5, qtyMax: 50, specs: "5mm Bubble, 50m Length, 500mm Width, Lightweight, Recyclable, GST Invoice" },
  { category: "Packaging", product: "Packing Tape", brand: "3M", model: "Translucent", type: "Tape", unit: "pcs", qtyMin: 20, qtyMax: 200 },

  // TEXTILES & APPAREL
  { category: "Textiles & Apparel", product: "Cotton Fabric", brand: "Raymond", model: "60 inch", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 500 },
  { category: "Textiles & Apparel", product: "Polyester Fabric", brand: "Arvind", model: "58 inch", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 500 },
  { category: "Textiles & Apparel", product: "Formal Shirts", brand: null, model: "Cotton Blend", type: "Shirt", unit: "pcs", qtyMin: 25, qtyMax: 250 },
  { category: "Textiles & Apparel", product: "Industrial Workwear", brand: null, model: "Cotton", type: "Workwear", unit: "pcs", qtyMin: 25, qtyMax: 200 },

  // FOOD & AGRICULTURE
  { category: "Food & Agriculture", product: "Basmati Rice", brand: "India Gate", model: "5kg", type: "Rice", unit: "kg", qtyMin: 50, qtyMax: 500 },
  { category: "Food & Agriculture", product: "Wheat", brand: null, model: "Sharbati", type: "Wheat", unit: "kg", qtyMin: 100, qtyMax: 1000 },
  { category: "Food & Agriculture", product: "Organic Fertilizer", brand: "Godrej", model: "25kg", type: "Fertilizer", unit: "bags", qtyMin: 10, qtyMax: 100 },
  { category: "Food & Agriculture", product: "Sprayer Pump", brand: "MAP", model: "16L", type: "Sprayer", unit: "pcs", qtyMin: 5, qtyMax: 50 },

  // HEALTH & SAFETY
  { category: "Health & Safety", product: "N95 Mask", brand: "3M", model: "VFM 100pcs", type: "Mask", unit: "pcs", qtyMin: 50, qtyMax: 500 },
  { category: "Health & Safety", product: "Safety Helmet", brand: "Ultimate", model: "ISI Marked", type: "Helmet", unit: "pcs", qtyMin: 10, qtyMax: 100 },
  { category: "Health & Safety", product: "Industrial Gloves", brand: "Midas", model: "Heavy Duty", type: "Gloves", unit: "pairs", qtyMin: 25, qtyMax: 200 },
  { category: "Health & Safety", product: "First Aid Kit", brand: "Dukal", model: "OSHA", type: "First Aid", unit: "pcs", qtyMin: 5, qtyMax: 50 },

  // LOGISTICS & TRANSPORT
  { category: "Logistics & Transport", product: "Packer and Mover Service", brand: null, model: "2BHK", type: "Service", unit: "service", qtyMin: 1, qtyMax: 3 },
  { category: "Logistics & Transport", product: "Truck Transport", brand: null, model: "14ft", type: "Truck", unit: "trips", qtyMin: 1, qtyMax: 10 },
  { category: "Logistics & Transport", product: "Container Storage", brand: null, model: "20ft", type: "Container", unit: "units", qtyMin: 1, qtyMax: 5 },
  { category: "Logistics & Transport", product: "Warehouse Rental", brand: null, model: "5000sqft", type: "Warehouse", unit: "sqft", qtyMin: 1000, qtyMax: 10000 },

  // BUSINESS SERVICES
  { category: "Business Services", product: "Management Consulting", brand: null, model: "Strategic", type: "Consulting", unit: "hours", qtyMin: 10, qtyMax: 100 },
  { category: "Business Services", product: "Digital Marketing", brand: null, model: "Monthly Package", type: "Marketing", unit: "month", qtyMin: 1, qtyMax: 6 },
  { category: "Business Services", product: "Website Development", brand: null, model: "E-commerce", type: "Development", unit: "project", qtyMin: 1, qtyMax: 3 },
  { category: "Business Services", product: "Legal Documentation", brand: null, model: "Corporate", type: "Legal", unit: "service", qtyMin: 1, qtyMax: 5 },

  // SERVICES & MAINTENANCE
  { category: "Services & Maintenance", product: "Wedding Catering", brand: null, model: "100 plates", type: "Catering", unit: "plates", qtyMin: 50, qtyMax: 500 },
  { category: "Services & Maintenance", product: "Corporate Event", brand: null, model: "50 persons", type: "Event", unit: "event", qtyMin: 1, qtyMax: 5 },
  { category: "Services & Maintenance", product: "Interior Design", brand: null, model: "Full House", type: "Interior", unit: "project", qtyMin: 1, qtyMax: 3 },
  { category: "Services & Maintenance", product: "AC Repair Service", brand: null, model: "Split/Window", type: "Service", unit: "service", qtyMin: 5, qtyMax: 50 },

  // PACKAGING continued
  { category: "Packaging", product: "Packing Tape", brand: "3M", model: "Translucent", type: "Tape", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "48mm Width, 50m Length, Clear, Acrylic Adhesive, UV Resistant, GST Invoice" },

  // TEXTILES & APPAREL
  { category: "Textiles & Apparel", product: "Cotton Fabric", brand: "Raymond", model: "60 inch", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 500, specs: "100% Cotton, 60 inch Width, GSM 150, OEKO-TEX Certified, Color Fastness Guaranteed, GST Invoice" },
  { category: "Textiles & Apparel", product: "Polyester Fabric", brand: "Arvind", model: "58 inch", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 500, specs: "Polyester Blend, 58 inch Width, GSM 120, Wrinkle Resistant, Color Fastness Guaranteed, GST Invoice" },
  { category: "Textiles & Apparel", product: "Formal Shirts", brand: null, model: "Cotton Blend", type: "Shirt", unit: "pcs", qtyMin: 25, qtyMax: 250, specs: "65% Poly 35% Cotton, Regular Fit, Solid Colors, Sizes S-5XL, MOQ 25, GST Invoice" },
  { category: "Textiles & Apparel", product: "Industrial Workwear", brand: null, model: "Cotton", type: "Workwear", unit: "pcs", qtyMin: 25, qtyMax: 200, specs: "100% Cotton 12oz, Hi-Vis Options, EN ISO Certified, Sizes M-4XL, MOQ 25, GST Invoice" },

  // FOOD & AGRICULTURE
  { category: "Food & Agriculture", product: "Basmati Rice", brand: "India Gate", model: "5kg", type: "Rice", unit: "kg", qtyMin: 50, qtyMax: 500, specs: "Extra Long Grain, 99.95% Purity, FSSAI Certified, Aroma Guaranteed, Non-Sticky, GST Invoice" },
  { category: "Food & Agriculture", product: "Wheat", brand: null, model: "Sharbati", type: "Wheat", unit: "kg", qtyMin: 100, qtyMax: 1000, specs: "Premium Sharbati, 99% Purity, Moisture 12% Max, FSSAI Certified, Clean and Sorted, GST Invoice" },
  { category: "Food & Agriculture", product: "Organic Fertilizer", brand: "Godrej", model: "25kg", type: "Fer", unit: "bags", qtyMin: 10, qtyMax: 100, specs: "Organic, NPK 10:5:5, 25kg Bag, FCO Certified, Bio-Fortified, GST Invoice" },
  { category: "Food & Agriculture", product: "Sprayer Pump", brand: "MAP", model: "16L", type: "Sprayer", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "16L Capacity, Battery Operated, 8 Bar Pressure, Adjustable Nozzle, 1 Year Warranty, GST Invoice" },

  // HEALTH & SAFETY
  { category: "Health & Safety", product: "N95 Mask", brand: "3M", model: "VFM 100pcs", type: "Mask", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "N95 Grade, 4 Layer Protection, BIS Approved, 99% Bacterial Filtration, Comfortable Fit, GST Invoice" },
  { category: "Health & Safety", product: "Safety Helmet", brand: "Ultimate", model: "ISI Marked", type: "Helmet", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "IS 2925 Certified, UV Stabilized, Ratchet Adjustment, Electrical Insulation, 3 Year Shelf Life, GST Invoice" },
  { category: "Health & Safety", product: "Industrial Gloves", brand: "Midas", model: "Heavy Duty", type: "Gloves", unit: "pairs", qtyMin: 25, qtyMax: 200, specs: "Cut Level 5, PU Coated, Abrasion Resistant, Sizes M-XXL, EN388 Certified, GST Invoice" },
  { category: "Health & Safety", product: "First Aid Kit", brand: "Dukal", model: "OSHA", type: "First Aid", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "OSHA Compliant, 100 Items, Plastic Case, Wall Mountable, Refill Available, GST Invoice" },

  // LOGISTICS & TRANSPORT
  { category: "Logistics & Transport", product: "Packer and Mover Service", brand: null, model: "2BHK", type: "Service", unit: "service", qtyMin: 1, qtyMax: 3, specs: "Packing Material Included, 3 Men Team, Door to Door, Insurance Available, 10 Years Experience, GST Invoice" },
  { category: "Logistics & Transport", product: "Truck Transport", brand: null, model: "14ft", type: "Truck", unit: "trips", qtyMin: 1, qtyMax: 10, specs: "14ft Container, 4 Ton Capacity, GPS Tracked, Experienced Driver, Door Pickup, All India Permit, GST Invoice" },
  { category: "Logistics & Transport", product: "Container Storage", brand: null, model: "20ft", type: "Container", unit: "units", qtyMin: 1, qtyMax: 5, specs: "20ft Dry Container, CSC Certified, Pest Controlled, 24/7 Security, CCTV Surveillance, Flexible Tenure, GST Invoice" },
  { category: "Logistics & Transport", product: "Warehouse Rental", brand: null, model: "5000sqft", type: "Warehouse", unit: "sqft", qtyMin: 1000, qtyMax: 10000, specs: "Industrial Area, PEB Structure, 20ft Ceiling Height, Loading Bay, Power Backup, 24/7 Security, GST Invoice" },

  // BUSINESS SERVICES
  { category: "Business Services", product: "Management Consulting", brand: null, model: "Strategic", type: "Consulting", unit: "hours", qtyMin: 10, qtyMax: 100, specs: "Industry Expert, Strategy Development, Market Analysis, Implementation Support, Progress Reports, GST Invoice" },
  { category: "Business Services", product: "Digital Marketing", brand: null, model: "Monthly Package", type: "Marketing", unit: "month", qtyMin: 1, qtyMax: 6, specs: "SEO + SMM + PPC, Monthly Reports, Dedicated Account Manager, Social Media Management, GST Invoice" },
  { category: "Business Services", product: "Website Development", brand: null, model: "E-commerce", type: "Development", unit: "project", qtyMin: 1, qtyMax: 3, specs: "Custom Design, Payment Gateway, Inventory Management, Mobile Responsive, 1 Year Support, GST Invoice" },
  { category: "Business Services", product: "Legal Documentation", brand: null, model: "Corporate", type: "Legal", unit: "service", qtyMin: 1, qtyMax: 5, specs: "ROC Compliance, MOA/AOA Drafting, Share Registry, Annual Compliance, CA Verified, GST Invoice" },

  // SERVICES & MAINTENANCE
  { category: "Services & Maintenance", product: "Wedding Catering", brand: null, model: "100 plates", type: "Catering", unit: "plates", qtyMin: 50, qtyMax: 500, specs: "North Indian + South Indian, 5 Star Quality, Trained Staff, Live Counter, Hall Decoration, GST Invoice" },
  { category: "Services & Maintenance", product: "Corporate Event", brand: null, model: "50 persons", type: "Event", unit: "event", qtyMin: 1, qtyMax: 5, specs: "Venue Selection, Invitation Design, Catering, Photography, AV Equipment, GST Invoice" },
  { category: "Services & Maintenance", product: "Interior Design", brand: null, model: "Full House", type: "Interior", unit: "project", qtyMin: 1, qtyMax: 3, specs: "2BHK/3BHK, Modular Kitchen, Wardrobes, False Ceiling, Civil Work Included, 3 Year Warranty, GST Invoice" },
  { category: "Services & Maintenance", product: "AC Repair Service", brand: null, model: "Split/Window", type: "Service", unit: "service", qtyMin: 5, qtyMax: 50, specs: "Gas Refilling, PCB Repair, Coil Cleaning, 90 Day Warranty, Genuine Parts, Trained Technician, GST Invoice" }
];

function getRandomProduct(category) {
  const categoryProducts = PRODUCT_MASTER.filter(p => p.category === category);
  if (!categoryProducts.length) {
    const allProducts = PRODUCT_MASTER;
    return allProducts[Math.floor(Math.random() * allProducts.length)];
  }
  return categoryProducts[Math.floor(Math.random() * categoryProducts.length)];
}

function getQuantityForProduct(product) {
  const min = product.qtyMin || 1;
  const max = product.qtyMax || 5;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getSmartUnit(category, product) {
  const adminUnits = await getUnits();
  const availableUnits = Array.isArray(adminUnits) && adminUnits.length > 0 ? adminUnits : ["pcs", "units"];
  const productUnit = product.unit || "pcs";
  if (availableUnits.some(u => u.toLowerCase() === productUnit.toLowerCase())) {
    return productUnit;
  }
  return availableUnits[0] || "pcs";
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
  english: {
    "Electronics & Appliances": [
      "Setting up new home - need this for living room. Please share best price with installation.",
      "Office requirement - need this ASAP. Share your lowest price for bulk if available.",
      "Gift for family member. Brand new with warranty please. Share complete price details.",
      "Renovating my house. Need this urgently. Share your best dealer price.",
      "My old {product} stopped working. Need urgent replacement. Share price with home delivery."
    ],
    "Furniture & Home": [
      "Moving to new house next month. Need quality furniture. Budget flexible for good product.",
      "Home renovation project. Looking for durable furniture at reasonable price. Share your best deal.",
      "Wanted for my new bedroom. Premium quality needed. Please share photos and price.",
      "Furnishing my rental apartment. Need affordable yet quality furniture. Share options.",
      "Replacing old furniture. Exchange my old items possible? Share best dealer price."
    ],
    "Vehicles & Parts": [
      "Looking for well-maintained pre-owned car for daily commute. Budget flexible for good condition.",
      "Need vehicle for family use. Service history and insurance mandatory. Share your best price.",
      "Replacing my old car. Looking for reliable vehicle with clean background. Share price.",
      "Business use vehicle needed. Well-maintained pre-owned preferred. Share complete details.",
      "First car for my son. Budget around {budget}. Need safe and reliable vehicle."
    ],
    "Industrial Machinery": [
      "Factory expansion - need reliable machinery. Quality guarantee essential. Share technical specs.",
      "Production line upgrade needed. Installation and training must. Share your best quote.",
      "Plant maintenance requirement. Need quality equipment. Test run before purchase mandatory.",
      "Setting up new unit. Looking for efficient machinery with warranty. Share complete pricing.",
      "Industrial requirement for manufacturing. Technical specifications and test certificates mandatory."
    ],
    "Electrical Parts": [
      "Electrical project requirement. ISI marked products mandatory. Share competitive price.",
      "Factory maintenance stock needed. Consistent quality essential. Monthly orders possible if satisfied.",
      "Construction site electrical work. Need reliable parts supplier. Share bulk pricing.",
      "Trial order to check quality. Monthly orders for good product. Share technical datasheet.",
      "Electrical work for new building. GST invoice must. Share per unit price."
    ],
    "Construction Materials": [
      "Building new house. Need quality materials with delivery. Quality certificate mandatory.",
      "Ongoing construction project. Bulk requirement for cement, steel etc. Yearly supplier agreement interested.",
      "Home construction - need TMT bars and cement. Delivery to site needed. Share price.",
      "Commercial building project. Need reliable material supplier. GST invoice mandatory.",
      "Looking for construction material supplier. Consistent quality and timely delivery essential."
    ],
    "Services & Maintenance": [
      "Wedding planning - need experienced caterer. Budget flexible for quality service. Share packages.",
      "Corporate event next week. Professional service required. Share complete event management quote.",
      "Home interior project. Looking for creative team. 2BHK modular kitchen needed. Share portfolio.",
      "Office AC not working. Need urgent repair service. Share your service charges.",
      "Birthday party planning. Looking for reliable event manager. Budget: {budget}. Share options."
    ],
    "Raw Materials": [
      "Manufacturing unit requirement. Monthly need of {qty} {unit}. Long-term supplier agreement interested.",
      "Factory raw material supply. High volume requirement. Competitive rates for bulk orders.",
      "Production requirement - need consistent quality material. Test sample required before bulk order.",
      "Looking for raw material supplier. Quality and timely delivery essential. GST invoice mandatory.",
      "Regular manufacturing need. Monthly orders of {qty} {unit}. Share your competitive rates."
    ],
    "Chemicals & Plastics": [
      "Plastic manufacturing requirement. Consistent quality essential. Interested in annual rate contract.",
      "Factory raw material supply. Test sample required. Share price per {unit} with delivery.",
      "Looking for established chemical supplier. Safety data sheet mandatory. Share competitive pricing.",
      "Production line requirement. Monthly orders of {qty} {unit}. Quality consistency mandatory.",
      "Industrial chemical requirement. Supplier reliability important. Share your best rates."
    ],
    "Packaging": [
      "Product packaging requirement. Monthly need of {qty} {unit}. Quality and timely delivery essential.",
      "Urgent packaging need for orders. Delivery by {timeline}. Share best price per {unit}.",
      "Looking for packaging material supplier. Consistent quality needed for monthly orders.",
      "Manufacturing packaging requirement. Custom printing available? Share price and samples.",
      "Food product packaging needed. Food-grade material mandatory. Share your rates."
    ],
    "Textiles & Apparel": [
      "Clothing business requirement. Need quality fabric supplier. Share fabric samples and pricing.",
      "Bulk apparel order for retail. Budget: {budget}. Delivery by {timeline}. Share catalog.",
      "Uniform requirement for office staff. {qty} pieces. Share price and available colors.",
      "Textile manufacturing need. Regular monthly orders of {qty} {unit}. Share competitive rates.",
      "Looking for fabric supplier. Quality consistency important. Share samples and pricing."
    ],
    "Food & Agriculture": [
      "Rice requirement for restaurant. Need consistent quality. Monthly orders of {qty} {unit}.",
      "Agricultural equipment for farm. Budget flexible for good quality. Share specifications.",
      "Foodgrains distribution business. FSSAI certified products needed. Share wholesale pricing.",
      "Wedding season rice requirement. Premium quality basmati. Share your best price.",
      "Organic produce for health store. Regular monthly orders. Share product samples and rates."
    ],
    "Health & Safety": [
      "Factory safety equipment requirement. ISI marked products mandatory. Share bulk pricing.",
      "Workplace PPE requirement. Monthly orders for employees. Competitive pricing needed.",
      "Hospital safety supplies. Quality medical-grade products needed. Share catalog and pricing.",
      "Construction site safety requirement. Helmet, gloves, boots etc. Share complete quote.",
      "Office first aid supplies. OSHA compliant kit needed. Share price and contents list."
    ],
    "Logistics & Transport": [
      "Factory shift requirement. Need reliable transport service. Share all-inclusive monthly quote.",
      "Warehouse storage needed for inventory. {qty} sqft space required. Share rental terms.",
      "Moving office to new location. Need professional packers and movers. Share estimate.",
      "Goods transportation requirement. Monthly contract. Share truck rental rates.",
      "Cold storage needed for perishables. {qty} sqft required. Share rental and facilities."
    ],
    "Business Services": [
      "Startup business consulting needed. Looking for experienced consultant. Budget: {budget}. Share approach.",
      "Digital marketing for new business. Monthly retainer preferred. Share your service packages.",
      "Website development for e-commerce. Custom design needed. Share portfolio and quote.",
      "Legal documentation for company registration. Need CA/CS services. Share professional fees.",
      "IT services requirement for office. Regular maintenance needed. Share annual contract pricing."
    ]
  },
  hinglish: {
    "Electronics & Appliances": [
      "Ghar ke liye chahiye ye product. Living room mein lagana hai. Installation ke saath price do.",
      "Office ke liye AC TV chahiye. Jaldi delivery chahiye. Share your best price.",
      "Pura naya home setup kar raha hoon. Quality product with warranty chahiye. Price with GST batao.",
      "Purana TV kharab ho gaya. Urgent replacement chahiye. Home delivery available?",
      "Beta ke liye laptop chahiye. Studies ke liye. Best price do HOKO pe."
    ],
    "Furniture & Home": [
      "Naya house le rahe hain next month. Quality furniture chahiye. Budget flexible hai.",
      "Home decoration ke liye sofa chahiye. Premium quality ka. Photos aur price share karo.",
      "Rental apartment furnish karna hai. Affordable furniture needed. Options batao.",
      "Bedroom ke liye bed chahiye. Storage wala. Best dealer price do.",
      "Purani furniture exchange kar sakte ho? New furniture chahiye."
    ],
    "Vehicles & Parts": [
      "Daily commute ke liye car chahiye. Well maintained pre-owned. Budget flexible.",
      "Family ke liye SUV chahiye. Service history mandatory. Price share karo.",
      "Apni old car replace karna hai. Reliable vehicle chahiye. Best price do.",
      "Business ke liye van chahiye. Loading capacity good honi chahiye. Share price.",
      "Pahli car meri beti ke liye. Budget mein safe car chahiye."
    ],
    "Industrial Machinery": [
      "Factory expansion ho raha hai. Reliable machinery chahiye. Technical specs share karo.",
      "Production line upgrade karna hai. Installation aur training included hona chahiye. Quote do.",
      "Plant maintenance ke liye equipment chahiye. Quality guarantee essential. Test run mandatory.",
      "New unit setup kar rahe hain. Efficient machinery with warranty. Complete pricing share karo.",
      "Industrial requirement hai. Technical specifications aur test certificates mandatory."
    ],
    "Electrical Parts": [
      "Electrical project hai. ISI marked products chahiye. Competitive price do.",
      "Factory maintenance stock chahiye. Monthly orders denge agar quality acchi rahi toh.",
      "Construction site electrical work hai. Reliable parts supplier chahiye. Bulk pricing do.",
      "Trial order hai quality check ke liye. Technical datasheet share karo.",
      "New building ke liye electrical work hai. GST invoice must hai. Per unit price do."
    ],
    "Construction Materials": [
      "Naya house build kar raha hoon. Quality materials with delivery chahiye. Certificate mandatory.",
      "Ongoing construction project hai. Cement, steel etc. bulk mein chahiye. Yearly agreement interested.",
      "Home construction ke liye TMT bars aur cement chahiye. Site tak delivery needed. Price do.",
      "Commercial building project hai. Reliable supplier chahiye. GST invoice mandatory.",
      "Construction material supplier dhundh rahe hain. Consistent quality aur timely delivery essential."
    ],
    "Services & Maintenance": [
      "Shadi ki tyohaar planning hai. Experienced caterer chahiye. Budget flexible hai. Packages batao.",
      "Corporate event hai next week. Professional service chahiye. Complete event management quote do.",
      "Home interior project hai. Creative team dhundh rahe hain. 2BHK modular kitchen. Portfolio share karo.",
      "Office AC kharab ho gaya. Urgent repair service chahiye. Service charges batao.",
      "Birthday party planning hai. Reliable event manager chahiye. Budget: {budget}. Options batao."
    ],
    "Raw Materials": [
      "Manufacturing unit requirement hai. Monthly {qty} {unit} chahiye. Long-term agreement interested.",
      "Factory raw material supply chahiye. High volume requirement hai. Competitive rates do.",
      "Production requirement - consistent quality chahiye. Bulk order se pehle test sample required.",
      "Raw material supplier dhundh rahe hain. Quality aur timely delivery essential. GST invoice mandatory.",
      "Regular manufacturing need hai. Monthly {qty} {unit} orders denge. Competitive rates share karo."
    ],
    "Chemicals & Plastics": [
      "Plastic manufacturing requirement hai. Consistent quality essential. Annual rate contract interested.",
      "Factory raw material supply chahiye. Test sample required. Delivery ke saath price do.",
      "Established chemical supplier dhundh rahe hain. Safety data sheet mandatory. Competitive pricing do.",
      "Production line requirement hai. Monthly {qty} {unit} orders. Quality consistency mandatory.",
      "Industrial chemical requirement hai. Supplier reliability important. Best rates share karo."
    ],
    "Packaging": [
      "Product packaging chahiye. Monthly {qty} {unit} need hai. Quality aur timely delivery essential.",
      "Urgent packaging need hai orders ke liye. {timeline} tak delivery chahiye. Per {unit} price do.",
      "Packaging material supplier dhundh rahe hain. Consistent quality monthly orders ke liye.",
      "Manufacturing packaging requirement hai. Custom printing available? Samples aur price share karo.",
      "Food product packaging chahiye. Food-grade material mandatory. Rates batao."
    ],
    "Textiles & Apparel": [
      "Clothing business ke liye fabric chahiye. Quality supplier dhundh rahe hain. Samples aur pricing share karo.",
      "Bulk apparel order hai retail ke liye. Budget: {budget}. {timeline} tak delivery. Catalog do.",
      "Office staff ke liye uniform chahiye. {qty} pieces. Price aur colors batao.",
      "Textile manufacturing need hai. Regular monthly {qty} {unit} orders. Competitive rates do.",
      "Fabric supplier dhundh rahe hain. Quality consistency important. Samples aur pricing share karo."
    ],
    "Food & Agriculture": [
      "Restaurant ke liye rice chahiye. Consistent quality important. Monthly {qty} {unit} orders.",
      "Farm ke liye agricultural equipment chahiye. Budget flexible good quality ke liye. Specs share karo.",
      "Foodgrains distribution business hai. FSSAI certified products chahiye. Wholesale pricing do.",
      "Wedding season ke liye rice requirement hai. Premium quality basmati. Best price do.",
      "Health store ke liye organic produce chahiye. Regular monthly orders. Samples aur rates share karo."
    ],
    "Health & Safety": [
      "Factory safety equipment chahiye. ISI marked products mandatory. Bulk pricing share karo.",
      "Workplace PPE requirement hai employees ke liye. Monthly orders. Competitive pricing needed.",
      "Hospital safety supplies chahiye. Quality medical-grade products. Catalog aur pricing do.",
      "Construction site safety requirement hai. Helmet, gloves, boots etc. Complete quote do.",
      "Office first aid supplies chahiye. OSHA compliant kit. Price aur contents list share karo."
    ],
    "Logistics & Transport": [
      "Factory shift ke liye transport service chahiye. Reliable service provider. Monthly quote do.",
      "Warehouse storage chahiye inventory ke liye. {qty} sqft space required. Rental terms batao.",
      "Office naya location mein shift ho raha hai. Professional packers movers chahiye. Estimate do.",
      "Goods transportation requirement hai. Monthly contract. Truck rental rates share karo.",
      "Perishables ke liye cold storage chahiye. {qty} sqft required. Rental aur facilities batao."
    ],
    "Business Services": [
      "Startup business consulting chahiye. Experienced consultant dhundh rahe hain. Budget: {budget}. Approach batao.",
      "New business ke liye digital marketing chahiye. Monthly retainer preferred. Service packages do.",
      "E-commerce website development chahiye. Custom design needed. Portfolio aur quote share karo.",
      "Company registration ke liye legal documentation chahiye. CA/CS services needed. Professional fees batao.",
      "Office ke liye IT services requirement hai. Regular maintenance. Annual contract pricing share karo."
    ]
  },
  hindi: {
    "Electronics & Appliances": [
      "घर के लिए यह प्रोडक्ट चाहिए। जल्दी डिलीवरी चाहिए। installation के साथ price बताओ।",
      "ऑफिस के लिए AC/TV चाहिए। तुरंत delivery चाहिए। Best price do.",
      "नया home setup कर रहा हूं। Quality product with warranty चाहिए। GST के साथ price बताओ।",
      "पुराना TV खराब हो गया। तुरंत replacement चाहिए। Home delivery available?",
      "बेटे के लिए laptop चाहिए। पढ़ाई के लिए। Best price do HOKO pe."
    ],
    "Furniture & Home": [
      "अगले month नया house ले रहे हैं। Quality furniture चाहिए। Budget flexible है।",
      "घर की सजावट के लिए sofa चाहिए। Premium quality का। Photos और price share करो।",
      "Rental apartment furnish करना है। Affordable furniture needed। Options बताओ।",
      "Bedroom के लिए bed चाहिए। Storage वाला। Best dealer price do.",
      "पुरानी furniture exchange कर सकते हो? New furniture चाहिए।"
    ],
    "Vehicles & Parts": [
      "रोज़ाना commute के लिए car चाहिए। Well maintained pre-owned। Budget flexible।",
      "परिवार के लिए SUV चाहिए। Service history mandatory। Price share करो।",
      "अपनी पुरानी car replace करनी है। Reliable vehicle चाहिए। Best price do।",
      "Business के लिए van चाहिए। Loading capacity अच्छी होनी चाहिए। Share price।",
      "बेटी के लिए पहली car। Budget में safe car चाहिए।"
    ],
    "Industrial Machinery": [
      "Factory expansion हो रहा है। Reliable machinery चाहिए। Technical specs share करो।",
      "Production line upgrade करना है। Installation और training included होना चाहिए। Quote do।",
      "Plant maintenance के लिए equipment चाहिए। Quality guarantee essential। Test run mandatory।",
      "New unit setup कर रहे हैं। Efficient machinery with warranty। Complete pricing share करो।",
      "Industrial requirement है। Technical specifications और test certificates mandatory।"
    ],
    "Electrical Parts": [
      "Electrical project है। ISI marked products चाहिए। Competitive price do।",
      "Factory maintenance stock चाहिए। Monthly orders देंगे अगर quality अच्छी रही तो।",
      "Construction site electrical work है। Reliable parts supplier चाहिए। Bulk pricing do।",
      "Trial order है quality check के लिए। Technical datasheet share करो।",
      "New building के लिए electrical work है। GST invoice must है। Per unit price do।"
    ],
    "Construction Materials": [
      "नया house build कर रहे हैं। Quality materials with delivery चाहिए। Certificate mandatory।",
      "Ongoing construction project है। Cement, steel etc. bulk में चाहिए। Yearly agreement interested।",
      "Home construction के लिए TMT bars और cement चाहिए। Site तक delivery needed। Price do।",
      "Commercial building project है। Reliable supplier चाहिए। GST invoice mandatory।",
      "Construction material supplier खोज रहे हैं। Consistent quality और timely delivery essential।"
    ],
    "Services & Maintenance": [
      "शादी की त्योहार planning है। Experienced caterer चाहिए। Budget flexible है। Packages बताओ।",
      "Corporate event है next week। Professional service चाहिए। Complete event management quote do।",
      "Home interior project है। Creative team खोज रहे हैं। 2BHK modular kitchen। Portfolio share करो।",
      "Office AC खराब हो गया। Urgent repair service चाहिए। Service charges बताओ।",
      "Birthday party planning है। Reliable event manager चाहिए। Budget: {budget}। Options बताओ।"
    ],
    "Raw Materials": [
      "Manufacturing unit requirement है। Monthly {qty} {unit} चाहिए। Long-term agreement interested।",
      "Factory raw material supply चाहिए। High volume requirement है। Competitive rates do।",
      "Production requirement - consistent quality चाहिए। Bulk order से पहले test sample required।",
      "Raw material supplier खोज रहे हैं। Quality और timely delivery essential। GST invoice mandatory।",
      "Regular manufacturing need है। Monthly {qty} {unit} orders देंगे। Competitive rates share करो।"
    ],
    "Chemicals & Plastics": [
      "Plastic manufacturing requirement है। Consistent quality essential। Annual rate contract interested।",
      "Factory raw material supply चाहिए। Test sample required। Delivery के साथ price do।",
      "Established chemical supplier खोज रहे हैं। Safety data sheet mandatory। Competitive pricing do।",
      "Production line requirement है। Monthly {qty} {unit} orders। Quality consistency mandatory।",
      "Industrial chemical requirement है। Supplier reliability important। Best rates share करो।"
    ],
    "Packaging": [
      "Product packaging चाहिए। Monthly {qty} {unit} need है। Quality और timely delivery essential।",
      "Urgent packaging need है orders के लिए। {timeline} तक delivery चाहिए। Per {unit} price do।",
      "Packaging material supplier खोज रहे हैं। Consistent quality monthly orders के लिए।",
      "Manufacturing packaging requirement है। Custom printing available? Samples और price share करो।",
      "Food product packaging चाहिए। Food-grade material mandatory। Rates बताओ।"
    ],
    "Textiles & Apparel": [
      "Clothing business के लिए fabric चाहिए। Quality supplier खोज रहे हैं। Samples और pricing share करो।",
      "Bulk apparel order है retail के लिए। Budget: {budget}। {timeline} तक delivery। Catalog do।",
      "Office staff के लिए uniform चाहिए। {qty} pieces। Price और colors बताओ।",
      "Textile manufacturing need है। Regular monthly {qty} {unit} orders। Competitive rates do।",
      "Fabric supplier खोज रहे हैं। Quality consistency important। Samples और pricing share करो।"
    ],
    "Food & Agriculture": [
      "Restaurant के लिए rice चाहिए। Consistent quality important। Monthly {qty} {unit} orders।",
      "Farm के लिए agricultural equipment चाहिए। Budget flexible good quality के लिए। Specs share करो।",
      "Foodgrains distribution business है। FSSAI certified products चाहिए। Wholesale pricing do।",
      "Wedding season के लिए rice requirement है। Premium quality basmati। Best price do।",
      "Health store के लिए organic produce चाहिए। Regular monthly orders। Samples और rates share करो।"
    ],
    "Health & Safety": [
      "Factory safety equipment चाहिए। ISI marked products mandatory। Bulk pricing share करो।",
      "Workplace PPE requirement है employees के लिए। Monthly orders। Competitive pricing needed।",
      "Hospital safety supplies चाहिए। Quality medical-grade products। Catalog और pricing do।",
      "Construction site safety requirement है। Helmet, gloves, boots etc। Complete quote do।",
      "Office first aid supplies चाहिए। OSHA compliant kit। Price और contents list share करो।"
    ],
    "Logistics & Transport": [
      "Factory shift के लिए transport service चाहिए। Reliable service provider। Monthly quote do।",
      "Warehouse storage चाहिए inventory के लिए। {qty} sqft space required। Rental terms बताओ।",
      "Office नए location में shift हो रहा है। Professional packers movers चाहिए। Estimate do।",
      "Goods transportation requirement है। Monthly contract। Truck rental rates share करो।",
      "Perishables के लिए cold storage चाहिए। {qty} sqft required। Rental और facilities बताओ।"
    ],
    "Business Services": [
      "Startup business consulting चाहिए। Experienced consultant खोज रहे हैं। Budget: {budget}। Approach बताओ।",
      "New business के लिए digital marketing चाहिए। Monthly retainer preferred। Service packages do।",
      "E-commerce website development चाहिए। Custom design needed। Portfolio और quote share करो।",
      "Company registration के लिए legal documentation चाहिए। CA/CS services needed। Professional fees बताओ।",
      "Office के लिए IT services requirement है। Regular maintenance। Annual contract pricing share करो।"
    ]
  }
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

function generateDetail(productName, quantity, unit, specs, category) {
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
  
  const categoryTemplates = CATEGORY_DETAIL_TEMPLATES[lang]?.[category] || CATEGORY_DETAIL_TEMPLATES.english?.[category];
  const useCategoryTemplate = categoryTemplates && Math.random() < 0.40;
  
  if (useCategoryTemplate) {
    detail = randomItem(categoryTemplates);
    detail = detail.replace(/{product}/gi, productName);
    detail = detail.replace("{qty}", String(quantity || ""));
    detail = detail.replace("{unit}", String(unit || "pcs"));
    detail = detail.replace("{timeline}", randomItem(TIMELINES) || "ASAP");
    detail = detail.replace("{budget}", randomItem(BUDGETS) || "Competitive pricing");
  } else if (styleRoll < 0.15) {
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
  
  if (!useCategoryTemplate) {
    detail = detail.replace("{product}", productName);
    detail = detail.replace("{qty}", String(quantity || ""));
    detail = detail.replace("{unit}", String(unit || "pcs"));
  }
  
  if (specs && !useCategoryTemplate) {
    detail += "\n\nSpecifications: " + specs;
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
      
      const productData = getRandomProduct(platformCategory);
      const quantity = getQuantityForProduct(productData);
      const unit = productData.unit;
      const condition = productData.condition || randomItem(["new", "used"]);
      const productName = productData.brand 
        ? `${productData.brand} ${productData.model} ${productData.product}` 
        : `${productData.model} ${productData.product}`;
      const details = generateDetail(productName, quantity, unit, productData.specs, platformCategory);
      
      try {
        const offerInvitedFrom = platformCategory.includes("Raw Materials") || platformCategory.includes("Chemicals") || platformCategory.includes("Industrial") || platformCategory.includes("Electrical") ? "anywhere" : "city";
        
        const dummy = await DummyRequirement.create({
          product: productName,
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
          productName: productName,
          product: productData.product,
          brand: productData.brand || null,
          make: productData.brand || null,
          typeModel: productData.model || null,
          type: productData.type || condition,
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
        console.log(`[DummyReq] Generated: ${city} | ${platformCategory} | ${productName} | Qty: ${quantity} ${unit}`);
        
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
