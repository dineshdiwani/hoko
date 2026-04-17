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
      "Need {product}. Share your best price on HOKO.",
      "Looking for {product}. Best deal?",
      "Urgent! Need {product}. Share price.",
      "Interested in {product}. Submit offer on HOKO."
    ],
    casual: [
      "Hi, I'm setting up something and need {product}. What's your rate for {qty} {unit}? Share your best price on HOKO.",
      "Hey, looking for {product} for my home/office. Need about {qty} {unit}. Can you arrange? Share price on HOKO.",
      "Do you have {product} in stock? Need {qty} {unit} urgently. Please share your price with GST on HOKO.",
      "Hi, interested in {product}. Need {qty} {unit} for our project. What's your best price including delivery?",
      "Looking for a reliable supplier for {product}. Need {qty} {unit}. Share your competitive price on HOKO.",
      "My old {product} broke down and I urgently need a replacement. Can you supply {qty} {unit}? Share price on HOKO.",
      "We're expanding our setup and need {product}. {qty} {unit} required. Submit your best price on HOKO please.",
      "Hi, can you arrange {qty} {unit} of {product}? Need good quality with warranty. Share your price on HOKO.",
      "Need {product} for our factory/plant. {qty} {unit}. Looking for best quality at competitive price. Submit on HOKO.",
      "We saw your contact and need {product} urgently. {qty} {unit} required. Share your lowest price on HOKO."
    ],
    detailed: [
      "We have an urgent requirement for {product}. Need {qty} {unit}. Please share:\n- Best unit price with GST\n- Delivery timeline\n- Payment terms\n- Warranty details\n- Installation included?",
      "Business requirement - need {product} for ongoing operations. Qty: {qty} {unit}. Submit your best price on HOKO including:\n- Product specifications\n- Delivery schedule\n- GST invoice availability\n- Any bulk discounts",
      "Procurement requirement for {product}. Quantity needed: {qty} {unit}. Kindly share:\n- Per unit price breakdown\n- Bulk discount if ordering more\n- Expected delivery date\n- Tax invoice mandatory\nSubmit on HOKO.",
      "We're looking for quality {product} supplier. Need {qty} {unit}. Share complete pricing with:\n- Unit price\n- Delivery charges\n- GST extra or inclusive\n- Warranty period\nSubmit your best offer on HOKO."
    ],
    formal: [
      "We have a procurement requirement for {product}. Quantity: {qty} {unit}. Please submit your detailed quotation on HOKO including product specifications, pricing, delivery timeline, and payment terms.",
      "Our organization requires {product} for ongoing business operations. Quantity: {qty} {unit}. Kindly submit your competitive offer on HOKO with complete technical specifications and warranty details.",
      "Please provide your best quotation for {product}. Required quantity: {qty} {unit}. Include pricing breakdown, GST details, delivery schedule, and payment terms. Submit on HOKO.",
      "We require quality {product} for our upcoming project. Quantity: {qty} {unit}. Please share your most competitive rates on HOKO along with product specifications and delivery capability."
    ],
    urgent: [
      "URGENT requirement for {product}. Need {qty} {unit} within {timeline}. This is time-sensitive! Submit your best price on HOKO immediately.",
      "Urgent! Need {product} ASAP for our project. Qty: {qty} {unit}. Please share your lowest price on HOKO right away. Delivery is critical.",
      "Time-sensitive procurement! {product} ({qty} {unit}) needed by {timeline}. Submit your best price on HOKO immediately. We are ready to order today.",
      "Emergency requirement - {product} ({qty} {unit}) needed by {timeline}. Looking for immediate response. Submit your competitive rate on HOKO."
    ],
    negotiation: [
      "We're serious buyers looking for the best price on {product}. Need {qty} {unit}. Multiple suppliers being considered. Submit your lowest quote on HOKO to get our business.",
      "Ready to place order immediately if price is right. Need {qty} {unit} of {product}. Share your most competitive rate on HOKO. We compare all quotes.",
      "Comparing prices for {product}. Need {qty} {unit}. Lowest price wins our order. Submit your best offer on HOKO. We're looking for long-term supplier relationship.",
      "Budget-conscious purchase for {product}. Qty: {qty} {unit}. Looking for best value, not just lowest price. Share quality product pricing on HOKO."
    ]
  },
  hinglish: {
    short: [
      "Need {product}. HOKO pe best price do.",
      "{product} dhundh rahe hain. Deal chahiye.",
      "Jaldi! {product} chahiye. Price batao.",
      "{product} mein interested. HOKO pe offer do."
    ],
    casual: [
      "Hi, kuch setup kar rahe hain aur {product} chahiye. {qty} {unit} ka rate kya hoga? HOKO pe best price do.",
      "Hey, ghar/office ke liye {product} dhundh rahe hain. {qty} {unit} chahiye. Arrange kar sakte ho? HOKO pe price do.",
      "{product} stock mein hai? {qty} {unit} jaldi chahiye. GST ke saath price share karo HOKO pe.",
      "Hi, {product} mein interested. {qty} {unit} chahiye hamare project ke liye. Delivery ke saath best price kya hoga?",
      "Reliable supplier dhundh rahe hain {product} ke liye. {qty} {unit} chahiye. Competitive price share karo HOKO pe.",
      "Mera {product} kharab ho gaya, urgently replacement chahiye. {qty} {unit} supply kar sakte ho? HOKO pe price do.",
      "Hamari setup expand ho rahi hai, {product} chahiye. {qty} {unit} required. HOKO pe best price do.",
      "Hi, {product} ke {qty} {unit} arrange kar sakte ho? Good quality with warranty chahiye. HOKO pe price do.",
      "{product} factory/plant ke liye chahiye. {qty} {unit}. Best quality competitive price mein dhundh rahe hain. HOKO pe submit karo.",
      "Aapka contact mila, {product} urgently chahiye. {qty} {unit} required. HOKO pe lowest price share karo."
    ],
    detailed: [
      "Hamare paas {product} ki urgent requirement hai. {qty} {unit} chahiye. Please share karo:\n- GST ke saath best unit price\n- Delivery timeline\n- Payment terms\n- Warranty details\n- Installation included?",
      "Business requirement hai - {product} chahiye ongoing operations ke liye. Qty: {qty} {unit}. HOKO pe best price do with:\n- Product specifications\n- Delivery schedule\n- GST invoice availability\n- Bulk discounts",
      "{product} ki procurement requirement hai. Quantity needed: {qty} {unit}. Please share karo:\n- Per unit price breakdown\n- Bulk discount agar zyada order karenge toh\n- Expected delivery date\n- Tax invoice mandatory\nHOKO pe submit karo.",
      "Quality {product} supplier dhundh rahe hain. {qty} {unit} chahiye. Complete pricing share karo with:\n- Unit price\n- Delivery charges\n- GST extra or inclusive\n- Warranty period\nBest offer HOKO pe do."
    ],
    formal: [
      "Hamare paas {product} ki procurement requirement hai. Quantity: {qty} {unit}. Please submit detailed quotation HOKO pe including product specifications, pricing, delivery timeline, and payment terms.",
      "Hamare organization ko {product} chahiye ongoing business operations ke liye. Quantity: {qty} {unit}. Kindly submit competitive offer HOKO pe with complete technical specifications and warranty details.",
      "Please provide your best quotation for {product}. Required quantity: {qty} {unit}. Include pricing breakdown, GST details, delivery schedule, and payment terms. Submit on HOKO.",
      "Hamare upcoming project ke liye quality {product} chahiye. Quantity: {qty} {unit}. Please share competitive rates HOKO pe along with product specifications and delivery capability."
    ],
    urgent: [
      "URGENT requirement for {product}. Need {qty} {unit} within {timeline}. Time-sensitive hai! HOKO pe best price immediately do.",
      "Jaldi! {product} ASAP chahiye hamare project ke liye. Qty: {qty} {unit}. Please share lowest price HOKO pe right away. Delivery critical hai.",
      "Time-sensitive procurement! {product} ({qty} {unit}) chahiye by {timeline}. HOKO pe best price immediately submit karo. Today order dene ke ready hain.",
      "Emergency requirement - {product} ({qty} {unit}) chahiye by {timeline}. Immediate response dhundh rahe hain. HOKO pe competitive rate do."
    ],
    negotiation: [
      "Serious buyers hain, {product} pe best price dhundh rahe hain. {qty} {unit} chahiye. Bahut suppliers consider kar rahe hain. Lowest quote do HOKO pe, hamara business paane ke liye.",
      "Agar price sahi hai toh immediately order place karne ke ready hain. {product} ke {qty} {unit} chahiye. Most competitive rate share karo HOKO pe. Saare quotes compare kar rahe hain.",
      "{product} ki prices compare kar rahe hain. {qty} {unit} chahiye. Lowest price wins hamara order. HOKO pe best offer do. Long-term supplier relationship dhundh rahe hain.",
      "{product} ke liye budget-conscious purchase hai. Qty: {qty} {unit}. Best value dhundh rahe hain, sirf lowest price nahi. HOKO pe quality product pricing share karo."
    ]
  },
  hindi: {
    short: [
      "Need {product}. HOKO pe best price do.",
      "{product} खोज रहे हैं। Deal चाहिए।",
      "Jaldi! {product} चाहिए। Price बताओ।",
      "{product} में interested। HOKO pe offer दो।"
    ],
    casual: [
      "नमस्ते, कुछ setup कर रहे हैं और {product} चाहिए। {qty} {unit} का rate क्या होगा? HOKO पर best price दो।",
      "अरे, घर/ऑफिस के लिए {product} खोज रहे हैं। {qty} {unit} चाहिए। Arrange कर सकते हो? HOKO पर price दो।",
      "{product} स्टॉक में है? {qty} {unit} जल्दी चाहिए। GST के साथ price share करो HOKO पर।",
      "नमस्ते, {product} में interested। {qty} {unit} चाहिए हमारे project के लिए। Delivery के साथ best price क्या होगा?",
      "Reliable supplier खोज रहे हैं {product} के लिए। {qty} {unit} चाहिए। Competitive price share करो HOKO पर।",
      "मेरा {product} खराब हो गया, urgently replacement चाहिए। {qty} {unit} supply कर सकते हो? HOKO पर price दो।",
      "हमारी setup expand हो रही है, {product} चाहिए। {qty} {unit} required। HOKO पर best price दो।",
      "नमस्ते, {product} के {qty} {unit} arrange कर सकते हो? Good quality with warranty चाहिए। HOKO पर price दो।",
      "{product} factory/plant के लिए चाहिए। {qty} {unit}। Best quality competitive price में खोज रहे हैं। HOKO पर submit करो।",
      "आपका contact मिला, {product} urgently चाहिए। {qty} {unit} required। HOKO पर lowest price share करो।"
    ],
    detailed: [
      "हमारे पास {product} की urgent requirement है। {qty} {unit} चाहिए। Please share करो:\n- GST के साथ best unit price\n- Delivery timeline\n- Payment terms\n- Warranty details\n- Installation included?",
      "Business requirement है - {product} चाहिए ongoing operations के लिए। Qty: {qty} {unit}। HOKO पर best price दो with:\n- Product specifications\n- Delivery schedule\n- GST invoice availability\n- Bulk discounts",
      "{product} की procurement requirement है। Quantity needed: {qty} {unit}। Please share करो:\n- Per unit price breakdown\n- Bulk discount अगर ज्यादा order करेंगे तो\n- Expected delivery date\n- Tax invoice mandatory\nHOKO पर submit करो।",
      "Quality {product} supplier खोज रहे हैं। {qty} {unit} चाहिए। Complete pricing share करो with:\n- Unit price\n- Delivery charges\n- GST extra or inclusive\n- Warranty period\nBest offer HOKO पर दो।"
    ],
    formal: [
      "हमारे पास {product} की procurement requirement है। Quantity: {qty} {unit}। Please submit detailed quotation HOKO पर including product specifications, pricing, delivery timeline, and payment terms.",
      "हमारे organization को {product} चाहिए ongoing business operations के लिए। Quantity: {qty} {unit}। Kindly submit competitive offer HOKO पर with complete technical specifications and warranty details.",
      "Please provide your best quotation for {product}। Required quantity: {qty} {unit}। Include pricing breakdown, GST details, delivery schedule, and payment terms। Submit on HOKO।",
      "हमारे upcoming project के लिए quality {product} चाहिए। Quantity: {qty} {unit}। Please share competitive rates HOKO पर along with product specifications and delivery capability।"
    ],
    urgent: [
      "URGENT requirement for {product}। Need {qty} {unit} within {timeline}। Time-sensitive है! HOKO पर best price immediately दो।",
      "जल्दी! {product} ASAP चाहिए हमारे project के लिए। Qty: {qty} {unit}। Please share lowest price HOKO पर right away। Delivery critical है।",
      "Time-sensitive procurement! {product} ({qty} {unit}) चाहिए by {timeline}। HOKO पर best price immediately submit करो। Today order देने के ready हैं।",
      "Emergency requirement - {product} ({qty} {unit}) चाहिए by {timeline}। Immediate response खोज रहे हैं। HOKO पर competitive rate दो।"
    ],
    negotiation: [
      "Serious buyers हैं, {product} पर best price खोज रहे हैं। {qty} {unit} चाहिए। बहुत suppliers consider कर रहे हैं। Lowest quote दो HOKO पर, हमारा business पाने के लिए।",
      "अगर price सही है तो immediately order place करने के ready हैं। {product} के {qty} {unit} चाहिए। Most competitive rate share करो HOKO पर। सारे quotes compare कर रहे हैं।",
      "{product} की prices compare कर रहे हैं। {qty} {unit} चाहिए। Lowest price wins हमारा order। HOKO पर best offer दो। Long-term supplier relationship खोज रहे हैं।",
      "{product} के लिए budget-conscious purchase है। Qty: {qty} {unit}। Best value खोज रहे हैं, सिर्फ lowest price नहीं। HOKO पर quality product pricing share करो।"
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
      "{product} needed for new home setup. Living room installation. Share best price with installation on HOKO.",
      "{product} needed for office. Urgent delivery required. Share your lowest price on HOKO.",
      "{product} needed for new home. Premium quality with warranty. Share complete price with GST on HOKO.",
      "{product} needed urgently. Old one stopped working. Replacement with home delivery. Share price on HOKO.",
      "{product} needed for child's studies. Brand new with warranty. Best price on HOKO please."
    ],
    "Furniture & Home": [
      "{product} needed for new house. Moving in next month. Quality furniture with delivery. Share price on HOKO.",
      "{product} needed for home decoration. Premium quality. Share photos and price on HOKO.",
      "{product} needed for new bedroom. Storage included preferred. Best dealer price on HOKO.",
      "{product} needed for rental apartment. Affordable options. Share options on HOKO.",
      "{product} needed. Old furniture exchange possible? New furniture with delivery. Share price on HOKO."
    ],
    "Vehicles & Parts": [
      "{product} needed for daily commute. Well maintained pre-owned. Best price on HOKO.",
      "{product} needed for family use. Service history mandatory. Share price on HOKO.",
      "{product} needed. Replacing old car. Reliable vehicle with clean background. Best price on HOKO.",
      "{product} needed for business use. Good loading capacity. Share price on HOKO.",
      "{product} needed for first car. Safe and reliable. Budget flexible. Share price on HOKO."
    ],
    "Industrial Machinery": [
      "{product} needed for factory expansion. Reliable machinery with warranty. Share technical specs on HOKO.",
      "{product} needed for production line upgrade. Installation and training included. Share quote on HOKO.",
      "{product} needed for plant maintenance. Quality guarantee essential. Test run mandatory. Share price on HOKO.",
      "{product} needed for new unit setup. Efficient machinery with warranty. Complete pricing on HOKO.",
      "{product} needed for industrial requirement. Technical specifications and test certificates mandatory."
    ],
    "Electrical Parts": [
      "{product} needed for electrical project. ISI marked products. Competitive price on HOKO.",
      "{product} needed for factory maintenance. Consistent quality essential. Monthly orders possible. Share price on HOKO.",
      "{product} needed for construction site. Reliable supplier. Bulk pricing on HOKO.",
      "{product} needed for trial order. Quality check purpose. Technical datasheet. Share price on HOKO.",
      "{product} needed for new building. GST invoice must. Per unit price on HOKO."
    ],
    "Construction Materials": [
      "{product} needed for new house construction. Quality with delivery. Certificate mandatory. Share price on HOKO.",
      "{product} needed for ongoing construction. Bulk requirement. Yearly supplier agreement interested. Share price on HOKO.",
      "{product} needed for home construction. Site delivery required. Best price on HOKO.",
      "{product} needed for commercial building. Reliable supplier with GST invoice. Share price on HOKO.",
      "{product} needed. Consistent quality and timely delivery essential. Supplier agreement interested."
    ],
    "Services & Maintenance": [
      "{product} needed for wedding event. Experienced caterer with quality service. Share packages on HOKO.",
      "{product} needed for corporate event. Professional service. Complete event management quote on HOKO.",
      "{product} needed for home interior. Creative team with experience. 2BHK modular kitchen. Portfolio on HOKO.",
      "{product} needed for office AC repair. Urgent service. Service charges on HOKO.",
      "{product} needed for birthday party. Reliable event manager. Budget flexible. Share options on HOKO."
    ],
    "Raw Materials": [
      "{product} needed for manufacturing unit. Monthly {qty} {unit}. Long-term supplier agreement interested. Share price on HOKO.",
      "{product} needed for factory raw material. High volume. Competitive rates on HOKO.",
      "{product} needed for production. Consistent quality essential. Test sample required before bulk order.",
      "{product} needed. Quality and timely delivery essential. GST invoice mandatory. Share price on HOKO.",
      "{product} needed for regular manufacturing. Monthly {qty} {unit} orders. Competitive rates on HOKO."
    ],
    "Chemicals & Plastics": [
      "{product} needed for plastic manufacturing. Consistent quality essential. Annual rate contract interested. Share price on HOKO.",
      "{product} needed for factory raw material. Test sample required. Delivery included price on HOKO.",
      "{product} needed. Established supplier. Safety data sheet mandatory. Competitive pricing on HOKO.",
      "{product} needed for production line. Monthly {qty} {unit} orders. Quality consistency mandatory. Share price on HOKO.",
      "{product} needed for industrial requirement. Supplier reliability important. Best rates on HOKO."
    ],
    "Packaging": [
      "{product} needed for product packaging. Monthly {qty} {unit}. Quality and timely delivery essential. Share price on HOKO.",
      "{product} needed urgently. Delivery by {timeline}. Per {unit} price on HOKO.",
      "{product} needed for regular supplier. Monthly orders. Consistent quality. Competitive pricing on HOKO.",
      "{product} needed for manufacturing packaging. Custom printing available? Samples and price on HOKO.",
      "{product} needed for food product. Food-grade material mandatory. Share rates on HOKO."
    ],
    "Textiles & Apparel": [
      "{product} needed for clothing business. Quality supplier. Samples and pricing on HOKO.",
      "{product} needed for bulk apparel order. Retail purpose. Delivery by {timeline}. Catalog on HOKO.",
      "{product} needed for office staff uniform. {qty} pieces. Price and available colors on HOKO.",
      "{product} needed for textile manufacturing. Regular monthly {qty} {unit} orders. Competitive rates on HOKO.",
      "{product} needed. Quality consistency important. Long-term supplier. Samples and pricing on HOKO."
    ],
    "Food & Agriculture": [
      "{product} needed for restaurant. Consistent quality. Monthly {qty} {unit} orders. Share price on HOKO.",
      "{product} needed for farm. Agricultural equipment. Good quality. Specs on HOKO.",
      "{product} needed for foodgrains distribution. FSSAI certified mandatory. Wholesale pricing on HOKO.",
      "{product} needed for wedding season. Premium quality basmati. Best price on HOKO.",
      "{product} needed for health store. Organic produce. Regular monthly orders. Samples and rates on HOKO."
    ],
    "Health & Safety": [
      "{product} needed for factory safety. ISI marked mandatory. Bulk pricing on HOKO.",
      "{product} needed for workplace PPE. Monthly orders for employees. Competitive pricing on HOKO.",
      "{product} needed for hospital safety. Quality medical-grade products. Catalog and pricing on HOKO.",
      "{product} needed for construction site safety. Helmet, gloves, boots etc. Complete quote on HOKO.",
      "{product} needed for office first aid. OSHA compliant kit. Price and contents list on HOKO."
    ],
    "Logistics & Transport": [
      "{product} needed for factory shift. Reliable service. Monthly contract. Quote on HOKO.",
      "{product} needed for warehouse storage. {qty} sqft space. Rental terms on HOKO.",
      "{product} needed for office shift. New location. Professional packers movers. Estimate on HOKO.",
      "{product} needed for goods transportation. Monthly contract. Truck rental rates on HOKO.",
      "{product} needed for cold storage. Perishables. {qty} sqft. Rental and facilities on HOKO."
    ],
    "Business Services": [
      "{product} needed for startup business. Experienced consultant. Budget flexible. Approach on HOKO.",
      "{product} needed for digital marketing. New business. Monthly retainer preferred. Service packages on HOKO.",
      "{product} needed for e-commerce website. Custom design. Portfolio and quote on HOKO.",
      "{product} needed for company registration. CA/CS services. Professional fees on HOKO.",
      "{product} needed for office IT services. Regular maintenance. Annual contract pricing on HOKO."
    ]
  },
  hinglish: {
    "Electronics & Appliances": [
      "{product} chahiye ghar ke liye. Living room mein lagana hai. Installation ke saath price do HOKO pe.",
      "{product} chahiye office ke liye. Jaldi delivery honi chahiye. Best price do HOKO pe.",
      "{product} chahiye new home setup ke liye. Quality product with warranty chahiye. Price with GST batao.",
      "{product} chahiye urgent replacement ke liye. Purana kharab ho gaya. Home delivery available?",
      "{product} chahiye beta/beta ki padhai ke liye. Best price do HOKO pe."
    ],
    "Furniture & Home": [
      "{product} chahiye new house ke liye. Next month move-in hai. Quality furniture with delivery chahiye.",
      "{product} chahiye home decoration ke liye. Premium quality ka. Photos aur price share karo HOKO pe.",
      "{product} chahiye rental apartment ke liye. Affordable options batao HOKO pe.",
      "{product} chahiye bedroom ke liye. Storage wala. Best dealer price do HOKO pe.",
      "{product} chahiye. Purani furniture exchange possible hai? New furniture with delivery chahiye."
    ],
    "Vehicles & Parts": [
      "{product} chahiye daily commute ke liye. Well maintained pre-owned. Best price do HOKO pe.",
      "{product} chahiye family use ke liye. Service history mandatory. Price share karo HOKO pe.",
      "{product} chahiye. Old car replace karni hai. Reliable vehicle with clean background. Best price do.",
      "{product} chahiye business ke liye. Loading capacity good honi chahiye. Share price on HOKO.",
      "{product} chahiye first car ke liye. Safe and reliable. Budget flexible. HOKO pe price do."
    ],
    "Industrial Machinery": [
      "{product} chahiye factory expansion ke liye. Reliable machinery with warranty. Technical specs share karo.",
      "{product} chahiye production line upgrade ke liye. Installation aur training included hona chahiye. Quote do.",
      "{product} chahiye plant maintenance ke liye. Quality guarantee essential. Test run mandatory. HOKO pe price do.",
      "{product} chahiye new unit setup ke liye. Efficient machinery with warranty. Complete pricing share karo.",
      "{product} chahiye industrial requirement ke liye. Technical specifications aur test certificates mandatory."
    ],
    "Electrical Parts": [
      "{product} chahiye electrical project ke liye. ISI marked products. Competitive price do HOKO pe.",
      "{product} chahiye factory maintenance stock ke liye. Consistent quality essential. Monthly orders possible.",
      "{product} chahiye construction site electrical work ke liye. Reliable parts supplier. Bulk pricing do.",
      "{product} chahiye trial order ke liye. Quality check karna hai. Technical datasheet share karo.",
      "{product} chahiye new building ke liye. GST invoice must hai. Per unit price do HOKO pe."
    ],
    "Construction Materials": [
      "{product} chahiye naya house build karne ke liye. Quality materials with delivery. Certificate mandatory.",
      "{product} chahiye ongoing construction project ke liye. Bulk requirement. Yearly supplier agreement interested.",
      "{product} chahiye home construction ke liye. Site tak delivery needed. Best price do HOKO pe.",
      "{product} chahiye commercial building project ke liye. Reliable supplier with GST invoice mandatory.",
      "{product} chahiye. Consistent quality aur timely delivery essential. Supplier agreement interested."
    ],
    "Services & Maintenance": [
      "{product} chahiye shadi ki tyohaar ke liye. Experienced caterer with quality service. Packages batao HOKO pe.",
      "{product} chahiye corporate event ke liye. Professional service. Complete event management quote do HOKO pe.",
      "{product} chahiye home interior project ke liye. Creative team with experience. 2BHK modular kitchen. Portfolio share karo.",
      "{product} chahiye office AC repair ke liye. Urgent service needed. Service charges batao HOKO pe.",
      "{product} chahiye birthday party ke liye. Reliable event manager. Budget flexible. Options batao."
    ],
    "Raw Materials": [
      "{product} chahiye manufacturing unit ke liye. Monthly {qty} {unit}. Long-term supplier agreement interested.",
      "{product} chahiye factory raw material ke liye. High volume requirement. Competitive rates do HOKO pe.",
      "{product} chahiye production ke liye. Consistent quality essential. Test sample required before bulk order.",
      "{product} chahiye. Quality aur timely delivery essential. GST invoice mandatory. HOKO pe price do.",
      "{product} chahiye regular manufacturing ke liye. Monthly {qty} {unit} orders. Competitive rates share karo."
    ],
    "Chemicals & Plastics": [
      "{product} chahiye plastic manufacturing ke liye. Consistent quality essential. Annual rate contract interested.",
      "{product} chahiye factory raw material ke liye. Test sample required. Delivery ke saath price do HOKO pe.",
      "{product} chahiye. Safety data sheet mandatory. Established supplier dhundh rahe hain. Competitive pricing do.",
      "{product} chahiye production line ke liye. Monthly {qty} {unit} orders. Quality consistency mandatory.",
      "{product} chahiye industrial requirement ke liye. Supplier reliability important. Best rates share karo."
    ],
    "Packaging": [
      "{product} chahiye product packaging ke liye. Monthly {qty} {unit} need. Quality aur timely delivery essential.",
      "{product} chahiye urgent packaging ke liye. {timeline} tak delivery required. Per {unit} price do HOKO pe.",
      "{product} chahiye regular supplier ke liye. Monthly orders. Consistent quality. Competitive pricing do.",
      "{product} chahiye manufacturing packaging ke liye. Custom printing available? Samples aur price share karo.",
      "{product} chahiye food product ke liye. Food-grade material mandatory. Rates batao HOKO pe."
    ],
    "Textiles & Apparel": [
      "{product} chahiye clothing business ke liye. Quality fabric supplier. Samples aur pricing share karo.",
      "{product} chahiye bulk apparel order ke liye. Retail ke liye. {timeline} tak delivery. Catalog do HOKO pe.",
      "{product} chahiye office staff uniform ke liye. {qty} pieces. Price aur available colors batao HOKO pe.",
      "{product} chahiye textile manufacturing ke liye. Regular monthly {qty} {unit} orders. Competitive rates do.",
      "{product} chahiye. Quality consistency important. Long-term supplier interested. Samples aur pricing share karo."
    ],
    "Food & Agriculture": [
      "{product} chahiye restaurant ke liye. Consistent quality important. Monthly {qty} {unit} orders. HOKO pe price do.",
      "{product} chahiye farm ke liye. Agricultural equipment with good quality. Specs share karo HOKO pe.",
      "{product} chahiye foodgrains distribution ke liye. FSSAI certified products mandatory. Wholesale pricing do.",
      "{product} chahiye wedding season ke liye. Premium quality basmati. Best price do HOKO pe.",
      "{product} chahiye health store ke liye. Organic produce. Regular monthly orders. Samples aur rates share karo."
    ],
    "Health & Safety": [
      "{product} chahiye factory safety ke liye. ISI marked products mandatory. Bulk pricing share karo HOKO pe.",
      "{product} chahiye workplace PPE ke liye. Monthly orders for employees. Competitive pricing needed.",
      "{product} chahiye hospital safety ke liye. Quality medical-grade products. Catalog aur pricing do HOKO pe.",
      "{product} chahiye construction site safety ke liye. Helmet, gloves, boots etc. Complete quote do.",
      "{product} chahiye office first aid ke liye. OSHA compliant kit. Price aur contents list share karo."
    ],
    "Logistics & Transport": [
      "{product} chahiye factory shift ke liye. Reliable transport service. Monthly contract. Quote do HOKO pe.",
      "{product} chahiye warehouse storage ke liye. {qty} sqft space. Rental terms batao HOKO pe.",
      "{product} chahiye office shift ke liye. New location mein move kar rahe hain. Professional packers movers. Estimate do.",
      "{product} chahiye goods transportation ke liye. Monthly contract. Truck rental rates share karo HOKO pe.",
      "{product} chahiye cold storage ke liye. Perishables ke liye. {qty} sqft required. Rental aur facilities batao."
    ],
    "Business Services": [
      "{product} chahiye startup business ke liye. Experienced consultant. Budget flexible. Approach batao HOKO pe.",
      "{product} chahiye digital marketing ke liye. New business. Monthly retainer preferred. Service packages do.",
      "{product} chahiye e-commerce website ke liye. Custom design. Portfolio aur quote share karo HOKO pe.",
      "{product} chahiye company registration ke liye. CA/CS services needed. Professional fees batao.",
      "{product} chahiye office IT services ke liye. Regular maintenance. Annual contract pricing share karo."
    ]
  },
  hindi: {
    "Electronics & Appliances": [
      "{product} चाहिए new home setup के लिए। Living room में installation के साथ। HOKO पर price do.",
      "{product} चाहिए office के लिए। जल्दी delivery चाहिए। HOKO पर best price do.",
      "{product} चाहिए new home के लिए। Premium quality with warranty। GST के साथ price HOKO पर do.",
      "{product} चाहिए urgently। Old one काम करना बंद कर दिया। Replacement with home delivery। HOKO पर price do.",
      "{product} चाहिए बच्चे की पढ़ाई के लिए। Brand new with warranty। HOKO पर best price do."
    ],
    "Furniture & Home": [
      "{product} चाहिए new house के लिए। Next month move-in है। Quality furniture with delivery। HOKO पर price do.",
      "{product} चाहिए home decoration के लिए। Premium quality। Photos aur price HOKO पर share karo.",
      "{product} चाहिए new bedroom के लिए। Storage wala preferred। HOKO पर best dealer price do.",
      "{product} चाहिए rental apartment के लिए। Affordable options। HOKO पर options batao.",
      "{product} चाहिए। Old furniture exchange possible? New furniture with delivery। HOKO पर price do."
    ],
    "Vehicles & Parts": [
      "{product} चाहिए daily commute के लिए। Well maintained pre-owned। HOKO पर best price do.",
      "{product} चाहिए family use के लिए। Service history mandatory। HOKO पर price share karo.",
      "{product} चाहिए। Old car replace करनी है। Reliable vehicle with clean background। HOKO पर best price do.",
      "{product} चाहिए business use के लिए। Good loading capacity। HOKO पर price share karo.",
      "{product} चाहिए first car के लिए। Safe and reliable। Budget flexible। HOKO पर price do."
    ],
    "Industrial Machinery": [
      "{product} चाहिए factory expansion के लिए। Reliable machinery with warranty। HOKO पर technical specs share karo.",
      "{product} चाहिए production line upgrade के लिए। Installation aur training included। HOKO पर quote do.",
      "{product} चाहिए plant maintenance के लिए। Quality guarantee essential। Test run mandatory। HOKO पर price do.",
      "{product} चाहिए new unit setup के लिए। Efficient machinery with warranty। HOKO पर complete pricing do.",
      "{product} चाहिए industrial requirement के लिए। Technical specifications aur test certificates mandatory।"
    ],
    "Electrical Parts": [
      "{product} चाहिए electrical project के लिए। ISI marked products। HOKO पर competitive price do.",
      "{product} चाहिए factory maintenance के लिए। Consistent quality essential। Monthly orders possible। HOKO पर price do.",
      "{product} चाहिए construction site के लिए। Reliable supplier। HOKO पर bulk pricing do.",
      "{product} चाहिए trial order के लिए। Quality check purpose। Technical datasheet। HOKO पर price do.",
      "{product} चाहिए new building के लिए। GST invoice must। HOKO पर per unit price do।"
    ],
    "Construction Materials": [
      "{product} चाहिए new house construction के लिए। Quality with delivery। Certificate mandatory। HOKO पर price do.",
      "{product} चाहिए ongoing construction के लिए। Bulk requirement। Yearly supplier agreement interested। HOKO पर price do.",
      "{product} चाहिए home construction के लिए। Site delivery required। HOKO पर best price do.",
      "{product} चाहिए commercial building के लिए। Reliable supplier with GST invoice। HOKO पर price do.",
      "{product} चाहिए। Consistent quality aur timely delivery essential। Supplier agreement interested।"
    ],
    "Services & Maintenance": [
      "{product} चाहिए wedding event के लिए। Experienced caterer with quality service। HOKO पर packages batao.",
      "{product} चाहिए corporate event के लिए। Professional service। HOKO पर complete event management quote do.",
      "{product} चाहिए home interior के लिए। Creative team with experience। 2BHK modular kitchen। HOKO पर portfolio do.",
      "{product} चाहिए office AC repair के लिए। Urgent service। HOKO पर service charges batao.",
      "{product} चाहिए birthday party के लिए। Reliable event manager। Budget flexible। HOKO पर options batao."
    ],
    "Raw Materials": [
      "{product} चाहिए manufacturing unit के लिए। Monthly {qty} {unit}। Long-term supplier agreement interested। HOKO पर price do.",
      "{product} चाहिए factory raw material के लिए। High volume। HOKO पर competitive rates do.",
      "{product} चाहिए production के लिए। Consistent quality essential। Bulk order से पहले test sample required।",
      "{product} चाहिए। Quality aur timely delivery essential। GST invoice mandatory। HOKO पर price do.",
      "{product} चाहिए regular manufacturing के लिए। Monthly {qty} {unit} orders। HOKO पर competitive rates do।"
    ],
    "Chemicals & Plastics": [
      "{product} चाहिए plastic manufacturing के लिए। Consistent quality essential। Annual rate contract interested। HOKO पर price do.",
      "{product} चाहिए factory raw material के लिए। Test sample required। Delivery included price HOKO पर do.",
      "{product} चाहिए। Established supplier। Safety data sheet mandatory। HOKO पर competitive pricing do.",
      "{product} चाहिए production line के लिए। Monthly {qty} {unit} orders। Quality consistency mandatory। HOKO पर price do.",
      "{product} चाहिए industrial requirement के लिए। Supplier reliability important। HOKO पर best rates do।"
    ],
    "Packaging": [
      "{product} चाहिए product packaging के लिए। Monthly {qty} {unit}। Quality aur timely delivery essential। HOKO पर price do.",
      "{product} चाहिए urgently। Delivery by {timeline}। HOKO पर per {unit} price do.",
      "{product} चाहिए regular supplier के लिए। Monthly orders। Consistent quality। HOKO पर competitive pricing do.",
      "{product} चाहिए manufacturing packaging के लिए। Custom printing available? HOKO पर samples aur price do.",
      "{product} चाहिए food product के लिए। Food-grade material mandatory। HOKO पर rates batao।"
    ],
    "Textiles & Apparel": [
      "{product} चाहिए clothing business के लिए। Quality supplier। HOKO पर samples aur pricing do.",
      "{product} चाहिए bulk apparel order के लिए। Retail purpose। Delivery by {timeline}। HOKO पर catalog do.",
      "{product} चाहिए office staff uniform के लिए। {qty} pieces। HOKO पर price aur colors batao.",
      "{product} चाहिए textile manufacturing के लिए। Regular monthly {qty} {unit} orders। HOKO पर competitive rates do.",
      "{product} चाहिए। Quality consistency important। Long-term supplier। HOKO पर samples aur pricing do।"
    ],
    "Food & Agriculture": [
      "{product} चाहिए restaurant के लिए। Consistent quality। Monthly {qty} {unit} orders। HOKO पर price do.",
      "{product} चाहिए farm के लिए। Agricultural equipment। Good quality। HOKO पर specs do.",
      "{product} चाहिए foodgrains distribution के लिए। FSSAI certified mandatory। HOKO पर wholesale pricing do.",
      "{product} चाहिए wedding season के लिए। Premium quality basmati। HOKO पर best price do.",
      "{product} चाहिए health store के लिए। Organic produce। Regular monthly orders। HOKO पर samples aur rates do।"
    ],
    "Health & Safety": [
      "{product} चाहिए factory safety के लिए। ISI marked mandatory। HOKO पर bulk pricing do.",
      "{product} चाहिए workplace PPE के लिए। Monthly orders for employees। HOKO पर competitive pricing do.",
      "{product} चाहिए hospital safety के लिए। Quality medical-grade products। HOKO पर catalog aur pricing do.",
      "{product} चाहिए construction site safety के लिए। Helmet, gloves, boots etc। HOKO पर complete quote do.",
      "{product} चाहिए office first aid के लिए। OSHA compliant kit। HOKO पर price aur contents list do।"
    ],
    "Logistics & Transport": [
      "{product} चाहिए factory shift के लिए। Reliable service। Monthly contract। HOKO पर quote do.",
      "{product} चाहिए warehouse storage के लिए। {qty} sqft space। HOKO पर rental terms batao.",
      "{product} चाहिए office shift के लिए। New location। Professional packers movers। HOKO पर estimate do.",
      "{product} चाहिए goods transportation के लिए। Monthly contract। HOKO पर truck rental rates do.",
      "{product} चाहिए cold storage के लिए। Perishables। {qty} sqft। HOKO पर rental aur facilities batao।"
    ],
    "Business Services": [
      "{product} चाहिए startup business के लिए। Experienced consultant। Budget flexible। HOKO पर approach batao.",
      "{product} चाहिए digital marketing के लिए। New business। Monthly retainer preferred। HOKO पर service packages do.",
      "{product} चाहिए e-commerce website के लिए। Custom design। HOKO पर portfolio aur quote do.",
      "{product} चाहिए company registration के लिए। CA/CS services। HOKO पर professional fees batao.",
      "{product} चाहिए office IT services के लिए। Regular maintenance। HOKO पर annual contract pricing do।"
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
  const useCategoryTemplate = categoryTemplates && Math.random() < 0.70;
  
  if (useCategoryTemplate) {
    detail = randomItem(categoryTemplates);
    detail = detail.replace(/{product}/gi, productName);
    detail = detail.replace("{qty}", String(quantity || ""));
    detail = detail.replace("{unit}", String(unit || "pcs"));
    detail = detail.replace("{timeline}", randomItem(TIMELINES) || "ASAP");
    detail = detail.replace("{budget}", randomItem(BUDGETS) || "Competitive pricing");
  } else if (styleRoll < 0.20) {
    detail = randomItem(templates.casual) || "Hi, looking for {product}. What's your rate?";
  } else if (styleRoll < 0.45) {
    detail = randomItem(templates.detailed) || "We have a requirement for {product}. Please share your best price.";
  } else if (styleRoll < 0.65) {
    detail = randomItem(templates.formal) || "We have a requirement for {product}. Please submit your quotation.";
  } else if (styleRoll < 0.80) {
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
