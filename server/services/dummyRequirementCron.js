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
      "LED TV required. Living room use. 55 inch or 43 inch. Smart TV with WiFi. Price with installation on HOKO.",
      "AC required. Split or window. For office. 1.5 ton inverter. Quick delivery with installation needed.",
      "Refrigerator required. Double door frost free. For home. Energy efficient 5 star. Best price on HOKO.",
      "Washing machine required. Automatic front load. Family use. Good brand like LG/Samsung. Price on HOKO.",
      "Laptop required. Office work. i5 or Ryzen 5. 8GB RAM minimum. Can be for student too.",
      "LED TV required. New home setup. 40-55 inch. Smart features with good picture. GST invoice on HOKO.",
      "AC required. Summer urgent. Split AC 1.5 ton. Inverter recommended. Installation included price.",
      "Fridge required. For home. Double door. 250-300L. 5 star energy rating. Best dealer price.",
      "Laptop required. Work from home. i3/i5 processor. 8GB RAM. Windows 11. GST invoice.",
      "LED TV required. Bedroom use. 32-43 inch. Budget friendly. Simple smart TV. Price on HOKO."
    ],
    "Furniture & Home": [
      "Sofa set required. Living room. 3+2 seater or L-shape. Fabric or leather. Best price on HOKO.",
      "Bed required. Master bedroom. King size with storage. Sheesham wood. Delivery with installation.",
      "Dining table required. 6 chairs. Family dinner. Good wood or glass top. Price on HOKO.",
      "Office chair required. Work from home. Ergonomic with lumbar support. Multiple pieces needed.",
      "Almirah/wardrobe required. Bedroom. 3 door. Storage. Good finishing. Best price on HOKO.",
      "Sofa required. New home. 3 seater. Premium fabric. Showroom quality. GST invoice on HOKO.",
      "Bed required. Kids room. Single bed with storage. Study desk. Budget friendly option.",
      "Dining table required. 4 chairs. Small family. Wooden or marble top. Delivery.",
      "TV unit required. Living room decor. Wall mounted or floor standing. Modern design. Price.",
      "Office desk required. Executive desk with drawers. Boss cabin. Premium finish. Best price."
    ],
    "Vehicles & Parts": [
      "Car required. Family use. Sedan or SUV. Pre-owned with service history. Well maintained. Best price.",
      "Activa/scooter required. Daily commute. New or 1-2 year old. LED light preferred. Price on HOKO.",
      "Swift/Dzire required. First car. Petrol. Well maintained. Insurance valid. Best dealer price.",
      "Creta/Compass SUV required. Family road trips. Diesel/Petrol. Top model. Low km. Price.",
      "Car required. Business use. Sedan. White or silver. Service records. Transfer included.",
      "Activa required. College student. New model preferred. LED headlamp. Competitive price.",
      "Swift required. Daily office commute. Petrol/CNG. 2021-2023 model. Clean car. Best price.",
      "SUV required. Family SUV like Innova/Tucson. 7 seater preferred. Well maintained. Insurance valid. Price.",
      "Car required. Pre-owned. Honda City or VW Polo. Sedan. Automatic preferred. Low running. Best quote.",
      "Two wheeler required. Office commute. Scooter or bike. 100-150cc. New or minimal use. Price."
    ],
    "Industrial Machinery": [
      "Motor required. Factory use. 3 phase. 5HP-10HP. AC or DC. IE3 efficiency. Test certificate on HOKO.",
      "Generator required. Factory backup. Silent/genset. 25-50kVA. ATS panel with auto start. Quote.",
      "AC motor required. Industrial use. 5-15HP. TEFC. Heavy duty. IE3 premium. Best price.",
      "Welding machine required. Fabrication. MIG welder. 400A output. IGBT based. Digital display. Price.",
      "CNC lathe required. Machine shop. 150-200mm chuck. Siemens/Fanuc controller. Training included. Quote.",
      "Motor required. Pump or compressor drive. 3 phase. 7.5HP. Cast iron body. Energy efficient. GST.",
      "Generator set required. Power backup. 15-30kVA. Silent canopy. Diesel. ATS panel. Best price.",
      "Industrial pump required. Water transfer. Centrifugal. 5HP. Cast iron. 2880 RPM. Delivery on HOKO.",
      "Air compressor required. Pneumatic tools. 10-15HP. Reciprocating or rotary. Tank mounted. Price.",
      "Transformer required. Industrial. 100-250kVA. Oil cooled. Voltage stabilizer. Technical specs."
    ],
    "Electrical Parts": [
      "Copper wire required. Electrical wiring. 1.5-2.5sqmm. FR grade. 90-100m rolls. ISI marked. GST invoice.",
      "MCB required. Distribution board. 32A-63A. Hager or Havells. 10kA breaking. Multiple pieces.",
      "Ball bearing required. Motor/reducer. SKF or NSK. Multiple sizes like 6204, 6205, 6206. Bulk price.",
      "Cable required. 3 core or 4 core. 2.5-4sqmm. Armoured. Industrial grade. Per meter or roll. GST.",
      "VFD drive required. Motor speed control. ABB or Siemens. 5-15HP. 3 phase. 380-480V. Quote on HOKO.",
      "Wire required. House or factory wiring. 1.5sqmm-4sqmm. HRFR. Multiple rolls needed. Wholesale price.",
      "DB box required. Electric panel. 8 way-24 way. Metal or ABS. MCB/RCCB with it. Complete set.",
      "Contactor required. Motor starter. 9A-95A. 3 pole. 3 phase. ABB or Siemens. Multiple rating.",
      "Relay required. Control panel. Overload relay. Thermal or digital. Multiple sizes. Price.",
      "Cable gland required. Industrial cable entry. Brass or SS. Multiple sizes. Waterproof. Bulk quantity."
    ],
    "Construction Materials": [
      "TMT bar required. House/building construction. 8mm-25mm. Fe500/Fe550. Tata/SAIL/JSW. Per quintal rate.",
      "Cement required. Construction. 53 grade. ACC/Utratech/Ambuja. Per bag or truck load. Delivery.",
      "Steel beam required. Structure. ISMB/ISA. 100-400mm. Fabrication. GST invoice.",
      "ACP sheet required. Building cladding. 3mm-4mm. PVDF coating. Fire rated. Standard sizes. Price.",
      "Brick required. Wall construction. Red clay. AAC or fly ash. Class A. Per piece or load. Delivery.",
      "TMT bar required. RCC work. 12mm-16mm. Fe550D. Earthquake resistant. Test certificate. GST.",
      "Cement required. Plastering or casting. 43 grade. 50kg bags. On site delivery.",
      "Sand required. Construction. River sand or M-sand. Cubic rate. Good quality. Delivery included.",
      "Aggregate required. Concrete. 10mm-20mm. Crushed stone. Clean. Per truck load. Best price.",
      "Structural steel required. Warehouse or factory. I-beam or channel. Fabrication with painting. Quote."
    ],
    "Services & Maintenance": [
      "Caterer required. Wedding/reception. 100-500 plates. North Indian or veg-nonveg both. Tasting on HOKO.",
      "Interior designer required. Home renovation. 2BHK or 3BHK. Modular kitchen. Budget flexible. Portfolio.",
      "Event manager required. Corporate event. 50-200 people. Venue to decoration. Complete package. Quote.",
      "AC repair service required. Split or window. Gas refilling or installation. 90 day warranty. Genuine parts. Price.",
      "Photographer required. Wedding/engagement. Candid + traditional. Album included. Portfolio share.",
      "Catering service required. Party or get-together. 50-100 plates. Pure veg. Quality food. Best price.",
      "Interior contractor required. Full house renovation. Civil + woodwork. Experienced team. Timeline: 2-3 months. Quote.",
      "Packer mover required. House shifting. 2BHK-3BHK. Packing material included. Insurance. Estimate.",
      "Carpenter required. Custom furniture. Wardrobe/TV unit. Wood selection. Installation. Best price.",
      "Pest control required. Home or office. Cockroach/spider/termite. Annual contract. Warranty. Price."
    ],
    "Raw Materials": [
      "Aluminum ingot required. Casting. 99.7% pure. LM6/LM24 grade. Per kg or metric ton. GST invoice.",
      "MS scrap required. Melting. HMS 1&2. 98% metal recovery. No radiation. Per ton rate.",
      "Copper scrap required. Bare bright. 99.9% pure. No insulation. Lab test report. Best price per kg.",
      "Steel scrap required. Shredded. ISRI 211-214. For re-rolling. Clean. Per ton. GST.",
      "Iron ore required. Steel making. Fe 62-65%. Low silica. Per metric ton. Assay report.",
      "Aluminum scrap required. Sheet or casting. Clean. No oil. Per kg. Competitive price on HOKO.",
      "Brass scrap required. Melting. 60-70% copper. Clean yellow brass. No mixed material. Price.",
      "Plastic scrap required. Recycling. HDPE/PP/LDPE. Bale form. Clean. Per quintal. Best quote.",
      "Rubber scrap required. Tyre or belt. Clean cut pieces. No metal. Per kg. Regular quantity. Price.",
      "Paper scrap required. Recycling. OCC or mixed paper. Per ton. Baler compress. Best rate."
    ],
    "Chemicals & Plastics": [
      "HDPE granules required. Plastic molding. Injection grade. Natural/colored. BIS approved. Per kg.",
      "PVC resin required. Pipe/fitting. SG5 or SG3. Suspension polymer. BIS certified. Best price.",
      "PP granules required. Automotive or packaging. Homopolymer or copolymer. MFI 3-20. Per kg rate.",
      "ABS granules required. Electronics or appliances. High impact. Heat resistant. LG/Mitsubishi. Technical specs.",
      "LDPE film required. Packaging. Blown film grade. Natural. Food contact approved. Per kg. GST.",
      "Masterbatch required. Color mixing. White/black/colored. Universal. Per kg. Bulk price on HOKO.",
      "Caustic soda required. Industrial cleaning. Flakes or pearl. 98% purity. Per kg or drum. Best price.",
      "Sulfuric acid required. Chemical processing. 98%. Per liter or drum. Industrial grade. Safety data sheet.",
      "Solvent required. Industrial use. Acetone or toluene. Per liter. Drums. GST invoice. Best price.",
      "Pigment required. Plastic/coloring. Organic or inorganic. Multiple colors. Per kg. Samples."
    ],
    "Packaging": [
      "Corrugated box required. Shipping. 3-5 ply. Custom sizes. Printing available. Per piece or 1000s. GST.",
      "Stretch film required. Pallet wrapping. 23 micron. 500mm width. 300m roll. UV stabilized. Best price.",
      "Bubble wrap required. Fragile items. 5mm-10mm bubble. 50m roll. Recyclable. Per roll.",
      "Packing tape required. 3M or similar. 48mm width. Clear or brown. 50m-100m roll. Per dozen.",
      "Tape required. Box sealing or masking. Multiple types. Brown/pink/clear. Per piece. Wholesale price.",
      "Corrugated roll required. Wrapping. 3mm-5mm flutes. Per kg or roll. Custom width. Best rate.",
      "Poly bag required. Packaging. LDPE/PP. Various sizes. Printed or plain. Per kg. GST invoice.",
      "Air pillow required. Void fill. 100x200mm. 1000s per roll. Cushioning. Per roll.",
      "Pallet required. Storage/transport. Wooden or plastic. Standard sizes. 1000kg capacity. Per piece. GST.",
      "Strapping band required. Bundle tying. PP or steel. 12mm width. Buckles available. Per roll."
    ],
    "Textiles & Apparel": [
      "Cotton fabric required. Shirt/kurti. 60 inch width. GSM 100-150. Per meter. Multiple colors. GST.",
      "Polyester fabric required. Suit/dress. 44-58 inch. Digital print or plain. Per meter. Best price.",
      "Formal shirts required. Office staff. Cotton blend. S-XXL sizes. {qty} pieces minimum. Per piece rate.",
      "Workwear required. Factory/industrial. 100% cotton 12oz. Hi-vis options. Sizes M-4XL. Per piece.",
      "Bed sheet fabric required. Bedding. Cotton/satin. 90-108 inch width. Per meter. Bulk order.",
      "Linen fabric required. Formal wear. 100% linen. Premium quality. Per meter. Samples.",
      "Denim required. Jeans/chinos. 10-14oz. Multiple washes. Per meter. Stretch available.",
      "Silk fabric required. Saree/kurti. Pure or art silk. Multiple colors. Per meter. GST invoice.",
      "Uniform fabric required. School/company. Poly-cotton. 45 inch. Grey/white. Per meter. Bulk order.",
      "Curtain fabric required. Home furnishing. Blackout or sheer. 54-120 inch. Per meter. Samples."
    ],
    "Food & Agriculture": [
      "Basmati rice required. Daily cooking or restaurant. 5kg-25kg bags. Long grain. FSSAI certified. Best wholesale.",
      "Wheat required. Flour mill or bakery. Sharbati or dara. 50kg bags. Clean. Per quintal rate.",
      "Toor dal required. Regular dal or bulk. 5-25kg bags. Clean. FSSAI. Best price per kg.",
      "Mustard oil required. Cooking. Kachi ghani or refined. 1L-15L tins. FSSAI. Per liter.",
      "Chana dal required. Snack or dal. Bold/split. 5-25kg. Clean. Per kg. Wholesale rate.",
      "Sugar required. Sweet shop or bakery. 50kg bags. White or sugar. Per quintal. Best price on HOKO.",
      "Besan required. Pakora/snacks. 1-25kg packs. Fine mesh. FSSAI. Per kg. Regular orders.",
      "Spices required. Kitchen. Turmeric/red chili/coriander. Whole or powder. FSSAI. Per kg. GST.",
      "Maida required. Bakery/namkeen. 50kg bags. Fine quality. Per quintal. Bulk order.",
      "Suji/rava required. Upma/halwa. Medium/coarse. 5-25kg. Clean. Per kg. Regular supply."
    ],
    "Health & Safety": [
      "N95 mask required. Safety. 3M or similar. BIS approved. {qty} pieces or box. GST invoice.",
      "Safety helmet required. Construction/industrial. ISI marked. UV stabilized. Ratchet. Per piece. Bulk price.",
      "Safety gloves required. Industrial. Cut resistant or leather. Sizes M-XXL. Per pair or dozen.",
      "Safety shoes required. Factory/construction. Steel toe. PU sole. Sizes 6-12. Per pair. GST.",
      "First aid kit required. Office or site. OSHA compliant. 50-100 items. Plastic case. Per piece. Price.",
      "Hand sanitizer required. Office or factory. 5L jar or 100ml bottles. Alcohol based. FSSAI. Per liter.",
      "Safety goggles required. Chemical/construction. Anti-fog. Clear lens. Per piece. Bulk order.",
      "Ear plugs required. Noisy environment. Foam or silicon. SNR 30+. Per pair or box. Best price.",
      "Fire extinguisher required. Office or warehouse. CO2 or ABC. 2-6kg. ISI marked. Per piece. GST.",
      "Safety vest required. Construction or security. High vis. Reflective strips. Per piece. Bulk rate."
    ],
    "Logistics & Transport": [
      "Truck transport required. 14ft or 20ft. Local or outstation. GPS tracked. Experienced driver. Per trip or ton.",
      "Packer mover required. 2BHK-3BHK shifting. 3 men team. Packing material. Insurance. Estimate on HOKO.",
      "Warehouse space required. Storage. 1000-10000 sqft. Industrial area. Power backup. Per sqft rate.",
      "Container storage required. 20ft or 40ft. Dry or reefer. CSC certified. 24/7 security. Per month.",
      "Cold storage required. Perishable. Temperature controlled. -18 to +5 C. Per sqft or pallet. GST.",
      "Shared warehouse required. Small business. 100-500 sqft. PEB structure. Loading bay. Flexible lease.",
      "ODC transport required. Heavy machinery. Trailer or low bed. Route survey. NOC. Per trip. Best quote.",
      "Local delivery van required. Last mile. Pickup or mini truck. Daily runs. Monthly contract. Rate.",
      "International shipping required. Export or import. 20ft or 40ft container. CFS or door to door. Quote.",
      "Courier service required. Documents or small parcels. Domestic or international. DTD. Per kg or piece. Best rate."
    ],
    "Business Services": [
      "Digital marketing required. Online presence. SEO + social media. Monthly retainer. Results oriented. Portfolio.",
      "Website development required. Company or e-commerce. Custom design. Mobile responsive. 1 year support. Quote.",
      "CA services required. Company registration. GST return. Audit. Monthly/annual. Professional fees. Best price.",
      "Legal documentation required. Property or business. Agreement or sale deed. Advocate fees. Per matter.",
      "IT support required. Office or server. AMC or on-call. Network. Hardware. Monthly contract. Best rate.",
      "Software development required. Custom app or web. ERP or CRM. Per project or man-month. Quote.",
      "Content writing required. Website or social media. SEO articles. Product descriptions. Per word or project. Best rate.",
      "Logo design required. Brand identity. 3-5 concepts. Revision included. Source files. Per design.",
      "Video production required. Promo or training. Corporate. Editing included. Per minute or project. Quote.",
      "Tax consultation required. Income or GST. Return filing. Planning. Expert CA/CS. Per consultation."
    ]
  },
  hinglish: {
    "Electronics & Appliances": [
      "LED TV chahiye. Living room ke liye. 55 inch ya 43 inch. Smart TV with WiFi. Price with installation do HOKO pe.",
      "AC chahiye. Split ya window. Office ke liye. 1.5 ton inverter. Jaldi delivery with installation do.",
      "Refrigerator chahiye. Double door frost free. Ghar ke liye. Energy efficient 5 star. Best price do HOKO pe.",
      "Washing machine chahiye. Automatic front load. Family use ke liye. Good brand like LG/Samsung. Price do.",
      "Laptop chahiye. Office work ke liye. i5 ya Ryzen 5. 8GB RAM minimum. Student ke liye bhi ho sakti hai.",
      "LED TV chahiye. New home ke liye. 40-55 inch. Smart features with good picture. GST invoice do HOKO pe.",
      "AC chahiye. Summer ke liye urgent. Split AC 1.5 ton. Inverter recommended. Installation included price do.",
      "Fridge chahiye. Ghar ke liye. Double door. 250-300L. 5 star energy rating. Best dealer price do.",
      "Laptop chahiye. Work from home ke liye. i3/i5 processor. 8GB RAM. Windows 11. GST invoice do.",
      "LED TV chahiye. Bedroom ke liye. 32-43 inch. Budget friendly. Simple smart TV. Price do HOKO pe."
    ],
    "Furniture & Home": [
      "Sofa set chahiye. Living room ke liye. 3+2 seater ya L-shape. Fabric ya leather. Best price do HOKO pe.",
      "Bed chahiye. Master bedroom ke liye. King size with storage. Sheesham wood ya ply. Delivery with installation do.",
      "Dining table chahiye. 6 chairs ke saath. Family dinner ke liye. Good wood ya glass top. Price do.",
      "Office chair chahiye. Work from home ke liye. Ergonomic with lumbar support. Multiple pieces chahte hain.",
      "Almirah/wardrobe chahiye. Bedroom ke liye. 3 door. Storage ke liye. Good finishing. Best price do.",
      "Sofa chahiye. New home ke liye. 3 seater. Premium fabric. Showroom quality. GST invoice do HOKO pe.",
      "Bed chahiye. Kids room ke liye. Single bed with storage. Study table ke saath. Budget friendly do.",
      "Dining table chahiye. 4 chairs. Small family ke liye. Wooden ya marble top. Delivery do.",
      "TV unit chahiye. Living room decor ke liye. Wall mounted ya floor standing. Modern design. Price do.",
      "Office table chahiye. Executive desk with drawers. Boss cabin ke liye. Premium finish. Best price do."
    ],
    "Vehicles & Parts": [
      "Car chahiye. Family ke liye. Sedan ya SUV. Pre-owned with service history. Well maintained. Best price do.",
      "Activa/scooter chahiye. Daily commute ke liye. New ya 1-2 year old. LED light preferred. Price do HOKO pe.",
      "Swift/Dzire chahiye. First car ke liye. Petrol. Well maintained. Insurance valid. Best dealer price do.",
      "Creta/Compass SUV chahiye. Family road trips ke liye. Diesel/Petrol. Top model. Low km driven. Price do.",
      "Car chahiye. Business use ke liye. Sedan. White ya silver. Service records ke saath. Transfer included do.",
      "Activa chahiye. College student ke liye. New model preferred. LED headlamp. Competitive price do.",
      "Swift chahiye. Daily office commute. Petrol/CNG. 2021-2023 model. Clean car. Best price do HOKO pe.",
      "SUV chahiye. Family SUV like Innova/Tucson. 7 seater preferred. Well maintained. Insurance valid. Price do.",
      "Car chahiye. Pre-owned. Honda City ya VW Polo. Sedan. Automatic preferred. Low running. Best quote do.",
      "Two wheeler chahiye. Office commute ke liye. Scooter ya bike. 100-150cc. New ya minimal use. Price do."
    ],
    "Industrial Machinery": [
      "Motor chahiye. Factory ke liye. 3 phase. 5HP-10HP. AC ya DC. IE3 efficiency. Test certificate do HOKO pe.",
      "Generator chahiye. Factory backup ke liye. Silent/genset. 25-50kVA. ATS panel with auto start. Quote do.",
      "AC motor chahiye. Industrial use ke liye. 5-15HP. TEFC. Heavy duty. IE3 premium. Best price do.",
      "Welding machine chahiye. Fabrication ke liye. MIG welder. 400A output. IGBT based. Digital display. Price do.",
      "CNC lathe chahiye. Machine shop ke liye. 150-200mm chuck. Siemens/Fanuc controller. Training included. Quote do.",
      "Motor chahiye. Pump ya compressor drive ke liye. 3 phase. 7.5HP. Cast iron body. Energy efficient. GST do.",
      "Generator set chahiye. Power backup ke liye. 15-30kVA. Silent canopy. Diesel. ATS panel. Best price do.",
      "Industrial pump chahiye. Water transfer ke liye. Centrifugal. 5HP. Cast iron. 2880 RPM. Delivery do HOKO pe.",
      "Air compressor chahiye. Pneumatic tools ke liye. 10-15HP. Reciprocating ya rotary. Tank mounted. Price do.",
      "Transformer chahiye. Industrial ke liye. 100-250kVA. Oil cooled. Voltage stabilizer. Technical specs do."
    ],
    "Electrical Parts": [
      "Copper wire chahiye. Electrical wiring ke liye. 1.5-2.5sqmm. FR grade. 90-100m rolls. ISI marked. GST invoice do.",
      "MCB chahiye. Distribution board ke liye. 32A-63A. Hager ya Havells. 10kA breaking. Multiple pieces do.",
      "Ball bearing chahiye. Motor/reducer ke liye. SKF ya NSK. Multiple sizes like 6204, 6205, 6206. Bulk price do.",
      "Cable chahiye. 3 core ya 4 core. 2.5-4sqmm. Armoured. Industrial grade. Per meter ya roll. GST do.",
      "VFD drive chahiye. Motor speed control ke liye. ABB ya Siemens. 5-15HP. 3 phase. 380-480V. Quote do HOKO pe.",
      "Wire chahiye. House ya factory wiring. 1.5sqmm-4sqmm. HRFR. Multiple rolls needed. Wholesale price do.",
      "DB box chahiye. Electric panel ke liye. 8 way-24 way. Metal ya ABS. MCB/RCCB with it. Complete set do.",
      "Contactor chahiye. Motor starter ke liye. 9A-95A. 3 pole. 3 phase. ABB ya Siemens. Multiple rating do.",
      "Relay chahiye. Control panel ke liye. Overload relay. Thermal ya digital. Multiple sizes. Price do.",
      "Cable gland chahiye. Industrial cable entry. Brass ya SS. Multiple sizes. Waterproof. Bulk quantity do."
    ],
    "Construction Materials": [
      "TMT bar chahiye. House/building construction. 8mm-25mm. Fe500/Fe550. Tata/SAIL/JSW. Per quintal rate do.",
      "Cement chahiye. Construction ke liye. 53 grade. ACC/Utratech/Ambuja. Per bag ya truck load. Delivery do.",
      "Steel beam chahiye. Structure ke liye. ISMB/ISA. 100-400mm. Fabrication ke saath. GST invoice do.",
      "ACP sheet chahiye. Building cladding ke liye. 3mm-4mm. PVDF coating. Fire rated. Standard sizes. Price do.",
      "Brick chahiye. Wall construction. Red clay. AAC ya fly ash. Class A. Per piece ya load. Delivery do.",
      "TMT bar chahiye. RCC work ke liye. 12mm-16mm. Fe550D. Earthquake resistant. Test certificate. GST do.",
      "Cement chahiye. Plastering ya casting. 43 grade bhi ho sakti hai. 50kg bags. On site delivery do.",
      "Sand chahiye. Construction ke liye. River sand ya M-sand. Cubic rate. Good quality. Delivery included do.",
      "Aggregate chahiye. Concrete ke liye. 10mm-20mm. Crushed stone. Clean. Per truck load. Best price do.",
      "Structural steel chahiye. Warehouse ya factory. I-beam ya channel. Fabrication with painting. Quote do."
    ],
    "Services & Maintenance": [
      "Caterer chahiye. Wedding/reception ke liye. 100-500 plates. North Indian ya veg-nonveg both. Tasting do HOKO pe.",
      "Interior designer chahiye. Home renovation ke liye. 2BHK ya 3BHK. Modular kitchen. Budget flexible. Portfolio do.",
      "Event manager chahiye. Corporate event ke liye. 50-200 people. Venue to decoration. Complete package. Quote do.",
      "AC repair service chahiye. Split ya window. Gas refilling ya installation. 90 day warranty. Genuine parts. Price do.",
      "Photographer chahiye. Wedding/engagement ke liye. Candid + traditional. Album included. Portfolio share karo.",
      "Catering service chahiye. Party ya get-together. 50-100 plates. Pure veg. Quality food. Best price do.",
      "Interior contractor chahiye. Full house renovation. Civil + woodwork. Experienced team. Timeline: 2-3 months. Quote do.",
      "Packer mover chahiye. House shifting ke liye. 2BHK-3BHK. Packing material included. Insurance available. Estimate do.",
      "Carpenter chahiye. Custom furniture ke liye. Wardrobe/TV unit. Wood selection. Installation. Best price do.",
      "Pest control chahiye. Home ya office. Cockroach/spider/termite treatment. Annual contract. Warranty. Price do."
    ],
    "Raw Materials": [
      "Aluminum ingot chahiye. Casting ke liye. 99.7% pure. LM6/LM24 grade. Per kg ya metric ton. GST invoice do.",
      "MS scrap chahiye. Melting ke liye. HMS 1&2. 98% metal recovery. No radiation. Per ton rate do.",
      "Copper scrap chahiye. Bare bright. 99.9% pure. No insulation. Lab test report. Best price per kg do.",
      "Steel scrap chahiye. Shredded form. ISRI 211-214. For re-rolling. Clean. Per ton. GST do.",
      "Iron ore chahiye. Steel making ke liye. Fe 62-65%. Low silica. Per metric ton. Assay report do.",
      "Aluminum scrap chahiye. Sheet ya casting. Clean. No oil. Per kg. Competitive price do HOKO pe.",
      "Brass scrap chahiye. Melting ke liye. 60-70% copper. Clean yellow brass. No mixed material. Price do.",
      "Plastic scrap chahiye. Recycling ke liye. HDPE/PP/LDPE. Bale form. Clean. Per quintal. Best quote do.",
      "Rubber scrap chahiye. Tyre ya belt. Clean cut pieces. No metal. Per kg. Regular quantity. Price do.",
      "Paper scrap chahiye. Recycling ke liye. OCC ya mixed paper. Per ton. Baler compress. Best rate do."
    ],
    "Chemicals & Plastics": [
      "HDPE granules chahiye. Plastic molding ke liye. Injection grade. Natural/colored. BIS approved. Per kg do.",
      "PVC resin chahiye. Pipe/fitting ke liye. SG5 ya SG3. Suspension polymer. BIS certified. Best price do.",
      "PP granules chahiye. Automotive ya packaging. Homopolymer ya copolymer. MFI 3-20. Per kg rate do.",
      "ABS granules chahiye. Electronics ya appliances. High impact. Heat resistant. LG/Mitsubishi. Technical specs do.",
      "LDPE film chahiye. Packaging ke liye. Blown film grade. Natural. Food contact approved. Per kg. GST do.",
      "Masterbatch chahiye. Color mixing ke liye. White/black/colored. Universal. Per kg. Bulk price do HOKO pe.",
      "Caustic soda chahiye. Industrial cleaning. Flakes ya pearl. 98% purity. Per kg ya drum. Best price do.",
      "Sulfuric acid chahiye. Chemical processing. 98%. Per liter ya drum. Industrial grade. Safety data sheet do.",
      "Solvent chahiye. Industrial use. Acetone ya toluene. Per liter. drums. GST invoice. Best price do.",
      "Pigment chahiye. Plastic/coloring ke liye. Organic ya inorganic. Multiple colors. Per kg. Samples do."
    ],
    "Packaging": [
      "Corrugated box chahiye. Shipping ke liye. 3-5 ply. Custom sizes. Printing available. Per piece ya 1000s. GST do.",
      "Stretch film chahiye. Pallet wrapping. 23 micron. 500mm width. 300m roll. UV stabilized. Best price do.",
      "Bubble wrap chahiye. Fragile items ke liye. 5mm-10mm bubble. 50m roll. Recyclable. Per roll do.",
      "Packing tape chahiye. 3M ya similar. 48mm width. Clear ya brown. 50m-100m roll. Per dozen do.",
      "Tape chahiye. Box sealing ya masking. Multiple types. Brown/pink/clear. Per piece. Wholesale price do.",
      "Corrugated roll chahiye. Wrapping ke liye. 3mm-5mm flutes. Per kg ya roll. Custom width. Best rate do.",
      "Poly bag chahiye. Packaging ke liye. LDPE/PP. Various sizes. Printed ya plain. Per kg. GST invoice do.",
      "Air pillow chahiye. Void fill ke liye. 100x200mm. 1000s per roll. Cushioning. Per roll do.",
      "Pallet chahiye. Storage/transport. Wooden ya plastic. Standard sizes. 1000kg capacity. Per piece. GST do.",
      "Strapping band chahiye. Bundle tying. PP ya steel. 12mm width. Buckles available. Per roll do."
    ],
    "Textiles & Apparel": [
      "Cotton fabric chahiye. Shirt/kurti ke liye. 60 inch width. GSM 100-150. Per meter. Multiple colors. GST do.",
      "Polyester fabric chahiye. Suit/dress ke liye. 44-58 inch. Digital print ya plain. Per meter. Best price do.",
      "Formal shirts chahiye. Office staff ke liye. Cotton blend. S-XXL sizes. {qty} pieces minimum. Per piece rate do.",
      "Workwear chahiye. Factory/industrial ke liye. 100% cotton 12oz. Hi-vis options. Sizes M-4XL. Per piece do.",
      "Bed sheet fabric chahiye. Bedding ke liye. Cotton/satin. 90-108 inch width. Per meter. Bulk order do.",
      "Linen fabric chahiye. Formal wear ke liye. 100% linen. Premium quality. Per meter ya meter. Samples do.",
      "Denim chahiye. Jeans/chinos ke liye. 10-14oz. Multiple washes. Per meter. Stretch bhi ho sakti hai.",
      "Silk fabric chahiye. Saree/kurti ke liye. Pure ya art silk. Multiple colors. Per meter. GST invoice do.",
      "Uniform fabric chahiye. School/company. Poly-cotton. 45 inch. Grey/white. Per meter. Bulk order do.",
      "Curtain fabric chahiye. Home furnishing. Blackout ya sheer. 54-120 inch. Per meter. Samples do."
    ],
    "Food & Agriculture": [
      "Basmati rice chahiye. Daily cooking ya restaurant. 5kg-25kg bags. Long grain. FSSAI certified. Best wholesale do.",
      "Wheat chahiye. Flour mill ya bakery. Sharbati ya dara. 50kg bags. Clean. Per quintal rate do.",
      "Toor dal chahiye. Regular dal ya bulk. 5-25kg bags. Clean. FSSAI. Best price per kg do.",
      "Mustard oil chahiye. Cooking ke liye. Kachi ghani ya refined. 1L-15L tins. FSSAI. Per liter do.",
      "Chana dal chahiye. Snack ya dal ke liye. Bold/split. 5-25kg. Clean. Per kg. Wholesale rate do.",
      "Sugar chahiye. Sweet shop ya bakery. 50kg bags. White ya sugar. Per quintal. Best price do HOKO pe.",
      "Besan chahiye. Pakora/snacks ke liye. 1-25kg packs. Fine mesh. FSSAI. Per kg. Regular orders do.",
      "Spices chahiye. Kitchen ke liye. Turmeric/red chili/coriander. Whole ya powder. FSSAI. Per kg. GST do.",
      "Maida chahiye. Bakery/namkeen ke liye. 50kg bags. Fine quality. Per quintal. Bulk order do.",
      "Suji/rava chahiye. Upma/halwa ke liye. Medium/coarse. 5-25kg. Clean. Per kg. Regular supply do."
    ],
    "Health & Safety": [
      "N95 mask chahiye. Safety ke liye. 3M ya similar. BIS approved. {qty} pieces ya box. GST invoice do.",
      "Safety helmet chahiye. Construction/industrial. ISI marked. UV stabilized. Ratchet. Per piece. Bulk price do.",
      "Safety gloves chahiye. Industrial ke liye. Cut resistant ya leather. Sizes M-XXL. Per pair ya dozen do.",
      "Safety shoes chahiye. Factory/construction. Steel toe. PU sole. Sizes 6-12. Per pair. GST do.",
      "First aid kit chahiye. Office ya site. OSHA compliant. 50-100 items. Plastic case. Per piece. Price do.",
      "Hand sanitizer chahiye. Office ya factory. 5L jar ya 100ml bottles. Alcohol based. FSSAI. Per liter do.",
      "Safety goggles chahiye. Chemical/construction. Anti-fog. Clear lens. Per piece. Bulk order do.",
      "Ear plugs chahiye. Noisy environment. Foam ya silicon. SNR 30+. Per pair ya box. Best price do.",
      "Fire extinguisher chahiye. Office ya warehouse. CO2 ya ABC. 2-6kg. ISI marked. Per piece. GST do.",
      "Safety vest chahiye. Construction ya security. High vis. Reflective strips. Per piece. Bulk rate do."
    ],
    "Logistics & Transport": [
      "Truck transport chahiye. 14ft ya 20ft. Local ya outstation. GPS tracked. Experienced driver. Per trip ya ton.",
      "Packer mover chahiye. 2BHK-3BHK shifting. 3 men team. Packing material. Insurance. Estimate do HOKO pe.",
      "Warehouse space chahiye. Storage ke liye. 1000-10000 sqft. Industrial area. Power backup. Per sqft rate do.",
      "Container storage chahiye. 20ft ya 40ft. Dry ya reefer. CSC certified. 24/7 security. Per month do.",
      "Cold storage chahiye. Perishable ke liye. Temperature controlled. -18 to +5 C. Per sqft ya pallet. GST do.",
      "Shared warehouse chahiye. Small business ke liye. 100-500 sqft. PEB structure. Loading bay. Flexible lease.",
      "ODC transport chahiye. Heavy machinery. Trailer ya low bed. Route survey. NOC. Per trip. Best quote do.",
      "Local delivery van chahiye. Last mile ke liye. Pickup ya mini truck. Daily runs. Monthly contract. Rate do.",
      "International shipping chahiye. Export ya import. 20ft ya 40ft container. CFS ya door to door. Quote do.",
      "Courier service chahiye. Documents ya small parcels. Domestic ya international. DTD. Per kg ya piece. Best rate do."
    ],
    "Business Services": [
      "Digital marketing chahiye. Online presence ke liye. SEO + social media. Monthly retainer. Results oriented. Portfolio do.",
      "Website development chahiye. Company ya e-commerce. Custom design. Mobile responsive. 1 year support. Quote do.",
      "CA services chahiye. Company registration. GST return. Audit. Monthly/annual. Professional fees. Best price do.",
      "Legal documentation chahiye. Property ya business. Agreement ya sale deed. Advocate fees. Per matter do.",
      "IT support chahiye. Office ya server. AMC ya on-call. Network. Hardware. Monthly contract. Best rate do.",
      "Software development chahiye. Custom app ya web. ERP ya CRM. Per project ya man-month. Quote do.",
      "Content writing chahiye. Website ya social media. SEO articles. Product descriptions. Per word ya project. Best rate do.",
      "Logo design chahiye. Brand identity ke liye. 3-5 concepts. Revision included. Source files. Per design do.",
      "Video production chahiye. Promo ya training. Corporate. Editing included. Per minute ya project. Quote do.",
      "Tax consultation chahiye. Income ya GST. Return filing. Planning. Expert CA/CS. Per consultation do."
    ]
  },
  hindi: {
    "Electronics & Appliances": [
      "LED TV चाहिए। Living room के लिए। 55 inch ya 43 inch। Smart TV with WiFi। Installation के साथ price HOKO पर do.",
      "AC चाहिए। Split ya window। Office के लिए। 1.5 ton inverter। Jaldi delivery with installation do.",
      "Refrigerator चाहिए। Double door frost free। Ghar के लिए। Energy efficient 5 star। Best price HOKO पर do.",
      "Washing machine चाहिए। Automatic front load। Family use। LG/Samsung जैसी brand। Price HOKO पर do.",
      "Laptop चाहिए। Office work के लिए। i5 ya Ryzen 5। 8GB RAM minimum। Student के लिए भी हो सकती है।",
      "LED TV चाहिए। New home setup। 40-55 inch। Smart features with good picture। GST invoice HOKO पर do.",
      "AC चाहिए। Summer के लिए urgent। Split AC 1.5 ton। Inverter recommended। Installation included price do.",
      "Fridge चाहिए। Ghar के लिए। Double door। 250-300L। 5 star energy rating। Best dealer price do.",
      "Laptop चाहिए। Work from home। i3/i5 processor। 8GB RAM। Windows 11। GST invoice do.",
      "LED TV चाहिए। Bedroom के लिए। 32-43 inch। Budget friendly। Simple smart TV। Price HOKO पर do."
    ],
    "Furniture & Home": [
      "Sofa set चाहिए। Living room के लिए। 3+2 seater ya L-shape। Fabric ya leather। Best price HOKO पर do.",
      "Bed चाहिए। Master bedroom। King size with storage। Sheesham wood। Delivery with installation do.",
      "Dining table चाहिए। 6 chairs के साथ। Family dinner के लिए। Good wood ya glass top। Price do.",
      "Office chair चाहिए। Work from home। Ergonomic with lumbar support। Multiple pieces chahte hain.",
      "Almirah/wardrobe चाहिए। Bedroom के लिए। 3 door। Storage के लिए। Good finishing। Best price do.",
      "Sofa चाहिए। New home के लिए। 3 seater। Premium fabric। Showroom quality। GST invoice HOKO पर do.",
      "Bed चाहिए। Kids room। Single bed with storage। Study table के साथ। Budget friendly do.",
      "Dining table चाहिए। 4 chairs। Small family। Wooden ya marble top। Delivery do.",
      "TV unit चाहिए। Living room decor। Wall mounted ya floor standing। Modern design। Price do.",
      "Office desk चाहिए। Executive desk with drawers। Boss cabin। Premium finish। Best price do."
    ],
    "Vehicles & Parts": [
      "Car चाहिए। Family के लिए। Sedan ya SUV। Pre-owned with service history। Well maintained। Best price do.",
      "Activa/scooter चाहिए। Daily commute। New ya 1-2 year old। LED light preferred। Price HOKO पर do.",
      "Swift/Dzire चाहिए। First car। Petrol। Well maintained। Insurance valid। Best dealer price do.",
      "Creta/Compass SUV चाहिए। Family road trips। Diesel/Petrol। Top model। Low km। Price do.",
      "Car चाहिए। Business use। Sedan। White ya silver। Service records के साथ। Transfer included do.",
      "Activa चाहिए। College student। New model preferred। LED headlamp। Competitive price do.",
      "Swift चाहिए। Daily office commute। Petrol/CNG। 2021-2023 model। Clean car। Best price HOKO पर do.",
      "SUV चाहिए। Family SUV jaise Innova/Tucson। 7 seater preferred। Well maintained। Insurance valid। Price do.",
      "Car चाहिए। Pre-owned। Honda City ya VW Polo। Sedan। Automatic preferred। Low running। Best quote do.",
      "Two wheeler चाहिए। Office commute। Scooter ya bike। 100-150cc। New ya minimal use। Price do."
    ],
    "Industrial Machinery": [
      "Motor चाहिए। Factory के लिए। 3 phase। 5HP-10HP। AC ya DC। IE3 efficiency। Test certificate HOKO पर do.",
      "Generator चाहिए। Factory backup। Silent/genset। 25-50kVA। ATS panel with auto start। Quote do.",
      "AC motor चाहिए। Industrial use। 5-15HP। TEFC। Heavy duty। IE3 premium। Best price do.",
      "Welding machine चाहिए। Fabrication। MIG welder। 400A output। IGBT based। Digital display। Price do.",
      "CNC lathe चाहिए। Machine shop। 150-200mm chuck। Siemens/Fanuc controller। Training included। Quote do.",
      "Motor चाहिए। Pump ya compressor drive। 3 phase। 7.5HP। Cast iron body। Energy efficient। GST do.",
      "Generator set चाहिए। Power backup। 15-30kVA। Silent canopy। Diesel। ATS panel। Best price do.",
      "Industrial pump चाहिए। Water transfer। Centrifugal। 5HP। Cast iron। 2880 RPM। Delivery HOKO पर do.",
      "Air compressor चाहिए। Pneumatic tools। 10-15HP। Reciprocating ya rotary। Tank mounted। Price do.",
      "Transformer चाहिए। Industrial। 100-250kVA। Oil cooled। Voltage stabilizer। Technical specs do."
    ],
    "Electrical Parts": [
      "Copper wire चाहिए। Electrical wiring। 1.5-2.5sqmm। FR grade। 90-100m rolls। ISI marked। GST invoice do.",
      "MCB चाहिए। Distribution board। 32A-63A। Hager ya Havells। 10kA breaking। Multiple pieces do.",
      "Ball bearing चाहिए। Motor/reducer। SKF ya NSK। Multiple sizes jaise 6204, 6205, 6206। Bulk price do.",
      "Cable चाहिए। 3 core ya 4 core। 2.5-4sqmm। Armoured। Industrial grade। Per meter ya roll। GST do.",
      "VFD drive चाहिए। Motor speed control। ABB ya Siemens। 5-15HP। 3 phase। 380-480V। Quote HOKO पर do.",
      "Wire चाहिए। House ya factory wiring। 1.5sqmm-4sqmm। HRFR। Multiple rolls needed। Wholesale price do.",
      "DB box चाहिए। Electric panel। 8 way-24 way। Metal ya ABS। MCB/RCCB के साथ। Complete set do.",
      "Contactor चाहिए। Motor starter। 9A-95A। 3 pole। 3 phase। ABB ya Siemens। Multiple rating do.",
      "Relay चाहिए। Control panel। Overload relay। Thermal ya digital। Multiple sizes। Price do.",
      "Cable gland चाहिए। Industrial cable entry। Brass ya SS। Multiple sizes। Waterproof। Bulk quantity do."
    ],
    "Construction Materials": [
      "TMT bar चाहिए। House/building construction। 8mm-25mm। Fe500/Fe550। Tata/SAIL/JSW। Per quintal rate do.",
      "Cement चाहिए। Construction। 53 grade। ACC/Utratech/Ambuja। Per bag ya truck load। Delivery do.",
      "Steel beam चाहिए। Structure। ISMB/ISA। 100-400mm। Fabrication के साथ। GST invoice do.",
      "ACP sheet चाहिए। Building cladding। 3mm-4mm। PVDF coating। Fire rated। Standard sizes। Price do.",
      "Brick चाहिए। Wall construction। Red clay। AAC ya fly ash। Class A। Per piece ya load। Delivery do.",
      "TMT bar चाहिए। RCC work। 12mm-16mm। Fe550D। Earthquake resistant। Test certificate। GST do.",
      "Cement चाहिए। Plastering ya casting। 43 grade भी हो सकती है। 50kg bags। On site delivery do.",
      "Sand चाहिए। Construction। River sand ya M-sand। Cubic rate। Good quality। Delivery included do.",
      "Aggregate चाहिए। Concrete। 10mm-20mm। Crushed stone। Clean। Per truck load। Best price do.",
      "Structural steel चाहिए। Warehouse ya factory। I-beam ya channel। Fabrication with painting। Quote do."
    ],
    "Services & Maintenance": [
      "Caterer चाहिए। Wedding/reception। 100-500 plates। North Indian ya veg-nonveg both। Tasting HOKO पर do.",
      "Interior designer चाहिए। Home renovation। 2BHK ya 3BHK। Modular kitchen। Budget flexible। Portfolio do.",
      "Event manager चाहिए। Corporate event। 50-200 people। Venue to decoration। Complete package। Quote do.",
      "AC repair service चाहिए। Split ya window। Gas refilling ya installation। 90 day warranty। Genuine parts। Price do.",
      "Photographer चाहिए। Wedding/engagement। Candid + traditional। Album included। Portfolio share karo.",
      "Catering service चाहिए। Party ya get-together। 50-100 plates। Pure veg। Quality food। Best price do.",
      "Interior contractor चाहिए। Full house renovation। Civil + woodwork। Experienced team। Timeline: 2-3 months। Quote do.",
      "Packer mover चाहिए। House shifting। 2BHK-3BHK। Packing material included। Insurance। Estimate do.",
      "Carpenter चाहिए। Custom furniture। Wardrobe/TV unit। Wood selection। Installation। Best price do.",
      "Pest control चाहिए। Home ya office। Cockroach/spider/termite। Annual contract। Warranty। Price do."
    ],
    "Raw Materials": [
      "Aluminum ingot चाहिए। Casting। 99.7% pure। LM6/LM24 grade। Per kg ya metric ton। GST invoice do.",
      "MS scrap चाहिए। Melting। HMS 1&2। 98% metal recovery। No radiation। Per ton rate do.",
      "Copper scrap चाहिए। Bare bright। 99.9% pure। No insulation। Lab test report। Best price per kg do.",
      "Steel scrap चाहिए। Shredded। ISRI 211-214। For re-rolling। Clean। Per ton। GST do.",
      "Iron ore चाहिए। Steel making। Fe 62-65%。 Low silica। Per metric ton। Assay report do.",
      "Aluminum scrap चाहिए। Sheet ya casting। Clean। No oil। Per kg। Competitive price HOKO पर do.",
      "Brass scrap चाहिए। Melting। 60-70% copper। Clean yellow brass। No mixed material। Price do.",
      "Plastic scrap चाहिए। Recycling। HDPE/PP/LDPE। Bale form। Clean। Per quintal। Best quote do.",
      "Rubber scrap चाहिए। Tyre ya belt। Clean cut pieces। No metal। Per kg। Regular quantity। Price do.",
      "Paper scrap चाहिए। Recycling। OCC ya mixed paper। Per ton। Baler compress। Best rate do."
    ],
    "Chemicals & Plastics": [
      "HDPE granules चाहिए। Plastic molding। Injection grade। Natural/colored। BIS approved। Per kg do.",
      "PVC resin चाहिए। Pipe/fitting। SG5 ya SG3। Suspension polymer। BIS certified। Best price do.",
      "PP granules चाहिए। Automotive ya packaging। Homopolymer ya copolymer। MFI 3-20। Per kg rate do.",
      "ABS granules चाहिए। Electronics ya appliances। High impact। Heat resistant। LG/Mitsubishi। Technical specs do.",
      "LDPE film चाहिए। Packaging। Blown film grade। Natural। Food contact approved। Per kg। GST do.",
      "Masterbatch चाहिए। Color mixing। White/black/colored। Universal। Per kg। Bulk price HOKO पर do.",
      "Caustic soda चाहिए। Industrial cleaning। Flakes ya pearl। 98% purity। Per kg ya drum। Best price do.",
      "Sulfuric acid चाहिए। Chemical processing। 98%。 Per liter ya drum। Industrial grade। Safety data sheet do.",
      "Solvent चाहिए। Industrial use। Acetone ya toluene। Per liter। Drums। GST invoice। Best price do.",
      "Pigment चाहिए। Plastic/coloring। Organic ya inorganic। Multiple colors। Per kg। Samples do."
    ],
    "Packaging": [
      "Corrugated box चाहिए। Shipping। 3-5 ply। Custom sizes। Printing available। Per piece ya 1000s। GST do.",
      "Stretch film चाहिए। Pallet wrapping। 23 micron। 500mm width। 300m roll। UV stabilized। Best price do.",
      "Bubble wrap चाहिए। Fragile items। 5mm-10mm bubble। 50m roll। Recyclable। Per roll do.",
      "Packing tape चाहिए। 3M ya similar। 48mm width। Clear ya brown। 50m-100m roll। Per dozen do.",
      "Tape चाहिए। Box sealing ya masking। Multiple types। Brown/pink/clear। Per piece। Wholesale price do.",
      "Corrugated roll चाहिए। Wrapping। 3mm-5mm flutes। Per kg ya roll। Custom width। Best rate do.",
      "Poly bag चाहिए। Packaging। LDPE/PP। Various sizes। Printed ya plain। Per kg। GST invoice do.",
      "Air pillow चाहिए। Void fill। 100x200mm। 1000s per roll। Cushioning। Per roll do.",
      "Pallet चाहिए। Storage/transport। Wooden ya plastic। Standard sizes। 1000kg capacity। Per piece। GST do.",
      "Strapping band चाहिए। Bundle tying। PP ya steel। 12mm width। Buckles available। Per roll do."
    ],
    "Textiles & Apparel": [
      "Cotton fabric चाहिए। Shirt/kurti। 60 inch width। GSM 100-150। Per meter। Multiple colors। GST do.",
      "Polyester fabric चाहिए। Suit/dress। 44-58 inch। Digital print ya plain। Per meter। Best price do.",
      "Formal shirts चाहिए। Office staff। Cotton blend। S-XXL sizes। {qty} pieces minimum। Per piece rate do.",
      "Workwear चाहिए। Factory/industrial। 100% cotton 12oz। Hi-vis options। Sizes M-4XL। Per piece do.",
      "Bed sheet fabric चाहिए। Bedding। Cotton/satin। 90-108 inch width। Per meter। Bulk order do.",
      "Linen fabric चाहिए। Formal wear। 100% linen। Premium quality। Per meter। Samples do.",
      "Denim चाहिए। Jeans/chinos। 10-14oz। Multiple washes। Per meter। Stretch available।",
      "Silk fabric चाहिए। Saree/kurti। Pure ya art silk। Multiple colors। Per meter। GST invoice do.",
      "Uniform fabric चाहिए। School/company। Poly-cotton। 45 inch। Grey/white। Per meter। Bulk order do.",
      "Curtain fabric चाहिए। Home furnishing। Blackout ya sheer। 54-120 inch। Per meter। Samples do."
    ],
    "Food & Agriculture": [
      "Basmati rice चाहिए। Daily cooking ya restaurant। 5kg-25kg bags। Long grain। FSSAI certified। Best wholesale do.",
      "Wheat चाहिए। Flour mill ya bakery। Sharbati ya dara। 50kg bags। Clean। Per quintal rate do.",
      "Toor dal चाहिए। Regular dal ya bulk। 5-25kg bags। Clean। FSSAI। Best price per kg do.",
      "Mustard oil चाहिए। Cooking। Kachi ghani ya refined। 1L-15L tins। FSSAI। Per liter do.",
      "Chana dal चाहिए। Snack ya dal। Bold/split। 5-25kg। Clean। Per kg। Wholesale rate do.",
      "Sugar चाहिए। Sweet shop ya bakery। 50kg bags। White ya sugar। Per quintal। Best price HOKO पर do.",
      "Besan चाहिए। Pakora/snacks। 1-25kg packs। Fine mesh। FSSAI। Per kg। Regular orders do.",
      "Spices चाहिए। Kitchen। Turmeric/red chili/coriander। Whole ya powder। FSSAI। Per kg। GST do.",
      "Maida चाहिए। Bakery/namkeen। 50kg bags। Fine quality। Per quintal। Bulk order do.",
      "Suji/rava चाहिए। Upma/halwa। Medium/coarse। 5-25kg। Clean। Per kg। Regular supply do."
    ],
    "Health & Safety": [
      "N95 mask चाहिए। Safety। 3M ya similar। BIS approved। {qty} pieces ya box। GST invoice do.",
      "Safety helmet चाहिए। Construction/industrial। ISI marked। UV stabilized। Ratchet। Per piece। Bulk price do.",
      "Safety gloves चाहिए। Industrial। Cut resistant ya leather। Sizes M-XXL। Per pair ya dozen do.",
      "Safety shoes चाहिए। Factory/construction। Steel toe। PU sole। Sizes 6-12। Per pair। GST do.",
      "First aid kit चाहिए। Office ya site। OSHA compliant। 50-100 items। Plastic case। Per piece। Price do.",
      "Hand sanitizer चाहिए। Office ya factory। 5L jar ya 100ml bottles। Alcohol based। FSSAI। Per liter do.",
      "Safety goggles चाहिए। Chemical/construction। Anti-fog। Clear lens। Per piece। Bulk order do.",
      "Ear plugs चाहिए। Noisy environment। Foam ya silicon। SNR 30+। Per pair ya box। Best price do.",
      "Fire extinguisher चाहिए। Office ya warehouse। CO2 ya ABC। 2-6kg। ISI marked। Per piece। GST do.",
      "Safety vest चाहिए। Construction ya security। High vis। Reflective strips। Per piece। Bulk rate do."
    ],
    "Logistics & Transport": [
      "Truck transport चाहिए। 14ft ya 20ft। Local ya outstation। GPS tracked। Experienced driver। Per trip ya ton.",
      "Packer mover चाहिए। 2BHK-3BHK shifting। 3 men team। Packing material। Insurance। Estimate HOKO पर do.",
      "Warehouse space चाहिए। Storage। 1000-10000 sqft। Industrial area। Power backup। Per sqft rate do.",
      "Container storage चाहिए। 20ft ya 40ft। Dry ya reefer। CSC certified। 24/7 security। Per month do.",
      "Cold storage चाहिए। Perishable। Temperature controlled। -18 to +5 C। Per sqft ya pallet। GST do.",
      "Shared warehouse चाहिए। Small business। 100-500 sqft। PEB structure। Loading bay। Flexible lease do.",
      "ODC transport चाहिए। Heavy machinery। Trailer ya low bed। Route survey। NOC। Per trip। Best quote do.",
      "Local delivery van चाहिए। Last mile। Pickup ya mini truck। Daily runs। Monthly contract। Rate do.",
      "International shipping चाहिए। Export ya import। 20ft ya 40ft container। CFS ya door to door। Quote do.",
      "Courier service चाहिए। Documents ya small parcels। Domestic ya international। DTD। Per kg ya piece। Best rate do."
    ],
    "Business Services": [
      "Digital marketing चाहिए। Online presence। SEO + social media। Monthly retainer। Results oriented। Portfolio do.",
      "Website development चाहिए। Company ya e-commerce। Custom design। Mobile responsive। 1 year support। Quote do.",
      "CA services चाहिए। Company registration। GST return। Audit। Monthly/annual। Professional fees। Best price do.",
      "Legal documentation चाहिए। Property ya business। Agreement ya sale deed। Advocate fees। Per matter do.",
      "IT support चाहिए। Office ya server। AMC ya on-call। Network। Hardware। Monthly contract। Best rate do.",
      "Software development चाहिए। Custom app ya web। ERP ya CRM। Per project ya man-month। Quote do.",
      "Content writing चाहिए। Website ya social media। SEO articles। Product descriptions। Per word ya project। Best rate do.",
      "Logo design चाहिए। Brand identity। 3-5 concepts। Revision included। Source files। Per design do.",
      "Video production चाहिए। Promo ya training। Corporate। Editing included। Per minute ya project। Quote do.",
      "Tax consultation चाहिए। Income ya GST। Return filing। Planning। Expert CA/CS। Per consultation do."
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
