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
  // ELECTRONICS & APPLIANCES (20 products)
  { category: "Electronics & Appliances", product: "LED Smart TV", brand: "Samsung", model: "55 inch 4K", type: "LED TV", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Smart LED, WiFi, 4K Ultra HD, HDR, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "LED Smart TV", brand: "LG", model: "43 inch Full HD", type: "LED TV", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Full HD, WebOS, HDR, WiFi, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "LED Smart TV", brand: "Sony", model: "65 inch 4K", type: "LED TV", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "4K HDR, Android TV, Acoustic Multi-Audio, 120Hz, 3 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Frost Free Refrigerator", brand: "Samsung", model: "253L", type: "Refrigerator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Frost Free, 5 Star Rating, Digital Inverter, 10 Year Compressor Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Frost Free Refrigerator", brand: "LG", model: "260L", type: "Refrigerator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Frost Free, Linear Compressor, 5 Star, Smart Diagnosis, 10 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Frost Free Refrigerator", brand: "Whirlpool", model: "280L", type: "Refrigerator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Frost Free, Intellisense, 6th Sense, 5 Star, Inverter Compressor, 10 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Split AC", brand: "Daikin", model: "1.5 Ton", type: "Split AC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Inverter, 5 Star Rating, PM2.5 Filter, Copper Coil, 5 Year Warranty on Compressor, GST Invoice" },
  { category: "Electronics & Appliances", product: "Split AC", brand: "Voltas", model: "1.5 Ton", type: "Split AC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Inverter, 3 Star Rating, High Ambient Cooling, Copper Coil, 5 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Split AC", brand: "LG", model: "2 Ton", type: "Split AC", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Inverter, 5 Star, Visi Cool, Dual Inverter, Ocean Black Protection, 10 Year Compressor Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Window AC", brand: "Samsung", model: "1.5 Ton", type: "Window AC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Easy Fix Installation, 3 Star, Quick Cooling, Digital Display, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Fully Automatic Washing Machine", brand: "LG", model: "7kg", type: "Washing Machine", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Front Load, 1400 RPM, 6 Motion DD, Steam Care, 10 Year Motor Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Fully Automatic Washing Machine", brand: "Samsung", model: "6.5kg", type: "Washing Machine", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Top Load, 680 RPM, Diamond Drum, Digital Inverter, 5 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Fully Automatic Washing Machine", brand: "Whirlpool", model: "7kg", type: "Washing Machine", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Top Load, 740 RPM, 6th Sense Technology, Hard Water Wash, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Semi Automatic Washing Machine", brand: "Samsung", model: "7kg", type: "Washing Machine", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Two Tub, 1300 RPM, Rust Proof Body, Collar Scrubber, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Laptop", brand: "Dell", model: "Inspiron 15", type: "Laptop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Intel i5 12th Gen, 8GB RAM, 512GB SSD, Windows 11, 2 Year On-site Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Laptop", brand: "HP", model: "15s", type: "Laptop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "AMD Ryzen 5, 16GB RAM, 512GB SSD, Windows 11, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Laptop", brand: "Lenovo", model: "IdeaPad 14", type: "Laptop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Intel i3 11th Gen, 8GB RAM, 256GB SSD, Windows 11, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Desktop Computer", brand: "HP", model: "Pavilion", type: "Desktop", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Intel i5, 8GB RAM, 1TB HDD, Windows 11, LED Monitor 21.5 inch, GST Invoice" },
  { category: "Electronics & Appliances", product: "All in One PC", brand: "Lenovo", model: "IdeaCentre", type: "AIO PC", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Intel i5, 8GB RAM, 512GB SSD, 23.8 inch FHD, Windows 11, GST Invoice" },
  { category: "Electronics & Appliances", product: "Smartphone", brand: "Samsung", model: "Galaxy S24", type: "Smartphone", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "8GB RAM, 256GB Storage, 5G, AI Camera, 1 Year Manufacturer Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Smartphone", brand: "Apple", model: "iPhone 15", type: "Smartphone", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "A16 Bionic, 128GB, 5G, USB-C, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Smartphone", brand: "OnePlus", model: "Nord CE 3", type: "Smartphone", unit: "pcs", qtyMin: 2, qtyMax: 15, specs: "8GB RAM, 128GB, 5G, 50MP Camera, OxygenOS, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Tablet", brand: "Samsung", model: "Galaxy Tab S9", type: "Tablet", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "11 inch AMOLED, 8GB RAM, 128GB, S Pen Included, 5G, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Headphones", brand: "Sony", model: "WH-1000XM5", type: "Headphones", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Wireless NC, 30hr Battery, Hi-Res Audio, Multipoint Connection, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Earbuds", brand: "Apple", model: "AirPods Pro 2", type: "Earbuds", unit: "pcs", qtyMin: 1, qtyMax: 20, specs: "Active Noise Cancellation, Transparency Mode, MagSafe Charging, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Bluetooth Speaker", brand: "JBL", model: "Flip 6", type: "Speaker", unit: "pcs", qtyMin: 2, qtyMax: 15, specs: "12hr Battery, IPX7 Waterproof, PartyBoost, Portable, GST Invoice" },
  { category: "Electronics & Appliances", product: "DSLR Camera", brand: "Canon", model: "EOS 1500D", type: "Camera", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "24.1MP, WiFi, Full HD, EF-S 18-55mm Lens, 2 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Gaming Console", brand: "Sony", model: "PlayStation 5", type: "Gaming Console", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "825GB SSD, 4K Gaming, Ray Tracing, DualSense Controller, 1 Year Warranty, GST Invoice" },
  { category: "Electronics & Appliances", product: "Projector", brand: "Epson", model: "EH-TW740", type: "Projector", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Full HD, 3300 Lumens, 3LCD, HDMI, 15000hr Lamp Life, GST Invoice" },
  { category: "Electronics & Appliances", product: "Power Bank", brand: "Mi", model: "20000mAh", type: "Power Bank", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "Fast Charging, 18W, Dual USB, Lithium Polymer, GST Invoice" },

  // FURNITURE & HOME (20 products)
  { category: "Furniture & Home", product: "King Size Bed", brand: "UrbanLadder", model: "6x6 feet", type: "Bed", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Sheesham Wood, Hydraulic Storage, Mattress Included, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Queen Size Bed", brand: "Wakefit", model: "5x6 feet", type: "Bed", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Sheesham Wood, Storage Option, Mattress Included, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Single Bed", brand: "Pepperfry", model: "3.5x6 feet", type: "Bed", unit: "pcs", qtyMin: 2, qtyMax: 10, specs: "Engineered Wood, PB Frame, 1 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "L-Shaped Sofa", brand: "Fabindia", model: "6 Seater", type: "Sofa", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Velvet Fabric, Solid Wood Frame, Cushion Included, 3 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "3 Seater Sofa", brand: "UrbanLadder", model: "Fabric", type: "Sofa", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Chenille Fabric, Wooden Legs, Cushion Included, 3 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Recliner Sofa", brand: "Lazyboy", model: "3 Seater", type: "Recliner", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Genuine Leather, Power Recline, USB Port, 3 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Dining Table Set", brand: null, model: "6 Chairs", type: "Dining Table", unit: "sets", qtyMin: 1, qtyMax: 3, specs: "Solid Wood, 6 Cushioned Chairs, Glass Top, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Dining Table Set", brand: null, model: "4 Chairs", type: "Dining Table", unit: "sets", qtyMin: 1, qtyMax: 5, specs: "Sheesham Wood, 4 Chairs, Marble Top, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Folding Dining Table", brand: null, model: "4 Seater", type: "Dining Table", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Engineered Wood, Space Saving, Foldable, 2 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Office Executive Chair", brand: "Godrej", model: "Ergo", type: "Chair", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "Ergonomic, Mesh Back, Adjustable Armrest, Lumbar Support, 3 Year Warranty, GST Invoice" },
  { category: "Furniture & Home", product: "Office Workstation", brand: "EBAO", model: "6 Seater", type: "Workstation", unit: "sets", qtyMin: 1, qtyMax: 10, specs: "L Shape, Engineered Wood, Cable Management, 3 Year Warranty, GST Invoice" },
  { category: "Furniture & Home", product: "Conference Table", brand: null, model: "8 Seater", type: "Table", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Sheesham Wood, 8 Seater, GSQ Certified, 3 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Modular Kitchen", brand: null, model: "L-Shape", type: "Kitchen", unit: "sets", qtyMin: 1, qtyMax: 2, specs: "BWP Plywood, Soft Close, Hettich Hardware, Counter Top Included, Delivery + Installation, GST Invoice" },
  { category: "Furniture & Home", product: "Modular Kitchen", brand: null, model: "Straight", type: "Kitchen", unit: "sets", qtyMin: 1, qtyMax: 3, specs: "BWP Plywood, Soft Close, SS Hardware, Granite Counter, Delivery + Installation, GST Invoice" },
  { category: "Furniture & Home", product: "TV Unit", brand: null, model: "Wall Mounted", type: "TV Unit", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Engineered Wood, Gloss Finish, Cable Management, 3 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Wardrobe", brand: "Godrej", model: "3 Door", type: "Wardrobe", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Engineered Wood, Mirror Included, Steel Channel, 5 Year Warranty, Delivery + Installation" },
  { category: "Furniture & Home", product: "Bookshelf", brand: "Flipkart", model: "5 Tier", type: "Shelf", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Engineered Wood, 5 Shelves, Easy Assembly, 2 Year Warranty, GST Invoice" },
  { category: "Furniture & Home", product: "Office Desk", brand: "IKEA", model: "HEMNES", type: "Desk", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Solid Wood, 2 Drawers, Cable Management, 2 Year Warranty, GST Invoice" },
  { category: "Furniture & Home", product: "Computer Desk", brand: null, model: "Compact", type: "Desk", unit: "pcs", qtyMin: 1, qtyMax: 15, specs: "Engineered Wood, Monitor Shelf, Keyboard Tray, 2 Year Warranty, GST Invoice" },
  { category: "Furniture & Home", product: "Storage Cabinet", brand: "Nilkamal", model: "6 Drawer", type: "Cabinet", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Plastic, 6 Drawers, Stackable, Wheels Included, 1 Year Warranty, GST Invoice" },

  // VEHICLES & PARTS (20 products)
  { category: "Vehicles & Parts", product: "Sedan Car", brand: "Maruti", model: "Swift Dzire", type: "Sedan", unit: "pcs", qtyMin: 1, qtyMax: 5, condition: "used", specs: "2022 Model, Petrol, 15000km Driven, Insurance Valid, Service Records, Transfer Included" },
  { category: "Vehicles & Parts", product: "SUV Vehicle", brand: "Toyota", model: "Innova Crysta", type: "SUV", unit: "pcs", qtyMin: 1, qtyMax: 3, condition: "used", specs: "2021 Model, Diesel, 45000km Driven, Top Model, Insurance Valid, Full Service History, Transfer Included" },
  { category: "Vehicles & Parts", product: "SUV Vehicle", brand: "Tata", model: "Nexon", type: "SUV", unit: "pcs", qtyMin: 1, qtyMax: 5, condition: "new", specs: "2024 Model, Petrol/Diesel, BS6, 5 Star Safety, Warranty 3 Years/100000km, Immediate Delivery, GST Invoice" },
  { category: "Vehicles & Parts", product: "Hatchback Car", brand: "Maruti", model: "Swift", type: "Hatchback", unit: "pcs", qtyMin: 1, qtyMax: 5, condition: "new", specs: "2024 Model, Petrol, BS6, 5 Star Safety, CNG Option, Warranty 2 Years/100000km, Immediate Delivery, GST Invoice" },
  { category: "Vehicles & Parts", product: "Compact SUV", brand: "Hyundai", model: "Creta", type: "SUV", unit: "pcs", qtyMin: 1, qtyMax: 3, condition: "used", specs: "2022 Model, Petrol, 25000km Driven, Top Model, Sunroof, Insurance Valid, Transfer Included" },
  { category: "Vehicles & Parts", product: "Two Wheeler", brand: "Honda", model: "Activa", type: "Scooter", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "2024 Model, Petrol, LED Headlamp, CBS/ABS, 5 Year Warranty, EMI Available, GST Invoice" },
  { category: "Vehicles & Parts", product: "Two Wheeler", brand: "TVS", model: "Apache", type: "Motorcycle", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "160cc, ABS, Bluetooth, Navigation, 5 Year Warranty, EMI Available, GST Invoice" },
  { category: "Vehicles & Parts", product: "Two Wheeler", brand: "Bajaj", model: "Pulsar", type: "Motorcycle", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "150cc, DTs-i Engine, LED Tail Lamp, 5 Year Warranty, EMI Available, GST Invoice" },
  { category: "Vehicles & Parts", product: "Electric Scooter", brand: "Ather", model: "450X", type: "Electric Scooter", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "3.7kWh Battery, 105km Range, Fast Charging, Connected Features, 3 Year Warranty, GST Invoice" },
  { category: "Vehicles & Parts", product: "Electric Scooter", brand: "Ola", model: "S1 Pro", type: "Electric Scooter", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "4kWh Battery, 181km Range, Hill Hold, 3 Year Warranty, GST Invoice" },
  { category: "Vehicles & Parts", product: "Tempo Traveller", brand: "Force", model: "12 Seater", type: "Tempo", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "2023 Model, Diesel, AC, Pushback Seats, Music System, GST Invoice" },
  { category: "Vehicles & Parts", product: "Mini Bus", brand: "Tata", model: "26 Seater", type: "Bus", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "2023 Model, Diesel, AC, Pushback Seats, Entertainment, GST Invoice" },
  { category: "Vehicles & Parts", product: "Car Battery", brand: "Exide", model: "55Ah", type: "Battery", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "12V, 55Ah, Maintenance Free, 3 Year Warranty, GST Invoice" },
  { category: "Vehicles & Parts", product: "Car Tyre", brand: "MRF", model: "185/65R15", type: "Tyre", unit: "pcs", qtyMin: 4, qtyMax: 20, specs: "All Season, 5mm Tread, Tubeless, 5 Year Warranty, GST Invoice" },
  { category: "Vehicles & Parts", product: "Motorcycle Helmet", brand: "Studds", model: "Champs Dualsport", type: "Helmet", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "DOT Certified, Visor Included, Anti Microbial, ISI Marked, GST Invoice" },
  { category: "Vehicles & Parts", product: "Car Seat Cover", brand: null, model: "Leatherette", type: "Seat Cover", unit: "sets", qtyMin: 1, qtyMax: 10, specs: "Premium Leatherette, Universal Fit, 7 Seater, Cushioning, GST Invoice" },
  { category: "Vehicles & Parts", product: "Car Music System", brand: "Sony", model: "XAV-AX5500", type: "Music System", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Apple CarPlay, Android Auto, Bluetooth, 6.95 inch, GST Invoice" },
  { category: "Vehicles & Parts", product: "Car GPS Tracker", brand: null, model: "4G", type: "Tracker", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "Real Time Tracking, Geo Fencing, Mobile App, 1 Year Subscription, GST Invoice" },
  { category: "Vehicles & Parts", product: "Vehicle Spare Parts Kit", brand: null, model: "Universal", type: "Spares", unit: "kits", qtyMin: 5, qtyMax: 50, specs: "Essential Spares, Engine Oil, Filters, Wipers, GST Invoice" },
  { category: "Vehicles & Parts", product: "Car Vacuum Cleaner", brand: "Xiaomi", model: "Jimmy JV51", type: "Vacuum", unit: "pcs", qtyMin: 2, qtyMax: 15, specs: "Cordless, 10000Pa, HEPA Filter, Multiple Attachments, GST Invoice" },

  // INDUSTRIAL MACHINERY (15 products)
  { category: "Industrial Machinery", product: "Three Phase Motor", brand: "ABB", model: "5HP", type: "Motor", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "3 Phase, 1440 RPM, F Class Insulation, IE3 Efficiency, Test Certificate, GST Invoice" },
  { category: "Industrial Machinery", product: "AC Motor", brand: "Siemens", model: "7.5HP", type: "Motor", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "3 Phase, 1450 RPM, TEFC, IE3 Premium, Warranty 2 Years, Test Certificate, GST Invoice" },
  { category: "Industrial Machinery", product: "Diesel Generator", brand: "Kirloskar", model: "25kVA", type: "Generator", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Silent Canopy, Sound Proof, ATS Panel, 250 Hours Runtime, Warranty 2 Years, GST Invoice" },
  { category: "Industrial Machinery", product: "Diesel Generator", brand: "Caterpillar", model: "50kVA", type: "Generator", unit: "pcs", qtyMin: 1, qtyMax: 2, specs: "Silent Canopy, Prime Power, ATS Compatible, Fuel Efficient, Warranty 2 Years, GST Invoice" },
  { category: "Industrial Machinery", product: "MIG Welding Machine", brand: "Miller", model: "400A", type: "Welder", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "400A Output, IGBT Based, Water Cooled Torch, Digital Display, 1 Year Warranty, GST Invoice" },
  { category: "Industrial Machinery", product: "ARC Welding Machine", brand: "Ador", model: "400A", type: "Welder", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "400A Output, Robust Design, Hot Start, Anti Stick, 1 Year Warranty, GST Invoice" },
  { category: "Industrial Machinery", product: "CNC Lathe", brand: "ACE", model: "CNC 200", type: "CNC Lathe", unit: "pcs", qtyMin: 1, qtyMax: 2, specs: "200mm Chuck, 8 Station Turret, Spindle Speed 50-3000 RPM, Siemens/Fanuc Controller, Training Included, GST Invoice" },
  { category: "Industrial Machinery", product: "CNC Milling Machine", brand: "Bfw", model: "VMC 850", type: "CNC Milling", unit: "pcs", qtyMin: 1, qtyMax: 2, specs: "800x500 Table, 12000 RPM, 4 Axis, Fanuc Controller, GST Invoice" },
  { category: "Industrial Machinery", product: "Industrial Pump", brand: "Kirloskar", model: "5HP", type: "Pump", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Centrifugal, Cast Iron, 2880 RPM, 50mm Outlet, 2 Year Warranty, GST Invoice" },
  { category: "Industrial Machinery", product: "Submersible Pump", brand: "CRI", model: "5HP", type: "Submersible", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Deep Well, Stainless Steel, 5HP, 2 Year Warranty, GST Invoice" },
  { category: "Industrial Machinery", product: "Air Compressor", brand: "Ingersoll Rand", model: "10HP", type: "Compressor", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Rotary Screw, Oil Free, 10 Bar, 500L Tank, Sound Proof, GST Invoice" },
  { category: "Industrial Machinery", product: "Pneumatic Drill", brand: "Bosch", model: "GSB 500", type: "Drill", unit: "pcs", qtyMin: 2, qtyMax: 10, specs: "500W, Keyless Chuck, Forward/Reverse, Variable Speed, GST Invoice" },
  { category: "Industrial Machinery", product: "Hydraulic Jack", brand: "Raja", model: "50 Ton", type: "Jack", unit: "pcs", qtyMin: 1, qtyMax: 5, specs: "Bottle Type, 50 Ton Capacity, Steel Construction, 1 Year Warranty, GST Invoice" },
  { category: "Industrial Machinery", product: "Forklift", brand: "Godrej", model: "3 Ton", type: "Forklift", unit: "pcs", qtyMin: 1, qtyMax: 3, specs: "Diesel, 3 Ton Capacity, Side Shift, 4 Way Valve, GST Invoice" },
  { category: "Industrial Machinery", product: "Conveyor Belt", brand: null, model: "1200mm Width", type: "Conveyor", unit: "meter", qtyMin: 10, qtyMax: 100, specs: "PVC Belt, Steel Frame, Adjustable Speed, GST Invoice" },

  // ELECTRICAL PARTS (15 products)
  { category: "Electrical Parts", product: "Copper Wire", brand: "Havells", model: "1.5sqmm 90mtr", type: "Wire", unit: "roll", qtyMin: 5, qtyMax: 50, specs: "FR Grade, HRFR, 1100V, ISI Marked, Copper 99.97% Pure, GST Invoice" },
  { category: "Electrical Parts", product: "Electric Wire", brand: "Polycab", model: "2.5sqmm 90mtr", type: "Wire", unit: "roll", qtyMin: 5, qtyMax: 50, specs: "FR Grade, HRFR, 1100V, ISI Marked, 100m Length, GST Invoice" },
  { category: "Electrical Parts", product: "Cable Wire", brand: "Finolex", model: "4sqmm 90mtr", type: "Wire", unit: "roll", qtyMin: 5, qtyMax: 30, specs: "FR Grade, 1100V, ISI Marked, 100m Length, GST Invoice" },
  { category: "Electrical Parts", product: "Armoured Cable", brand: "Havells", model: "3 Core 4sqmm", type: "Cable", unit: "meter", qtyMin: 50, qtyMax: 500, specs: "XLPE Insulated, SWA Armoured, 1100V, GST Invoice" },
  { category: "Electrical Parts", product: "Ball Bearing", brand: "SKF", model: "6205", type: "Bearing", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "Deep Groove, 25x52x15mm, Steel Shield, C3 Clearance, OEM Quality, GST Invoice" },
  { category: "Electrical Parts", product: "Ball Bearing", brand: "NTN", model: "6305", type: "Bearing", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "Deep Groove, 25x62x17mm, Open Type, High Speed, OEM Quality, GST Invoice" },
  { category: "Electrical Parts", product: "MCB Circuit Breaker", brand: "Havells", model: "32A", type: "MCB", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "Single Pole, C Curve, 10kA Breaking Capacity, ISI Marked, 2 Year Warranty, GST Invoice" },
  { category: "Electrical Parts", product: "MCB Distribution Board", brand: "Legrand", model: "12 Way", type: "DB", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "Metal Enclosure, 12 Modules, RCB Included, ISI Marked, GST Invoice" },
  { category: "Electrical Parts", product: "VFD Drive", brand: "ABB", model: "ACS550 10HP", type: "VFD", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "7.5kW, 3 Phase, 380-480V, Built-in EMC Filter, 2 Year Warranty, GST Invoice" },
  { category: "Electrical Parts", product: "PLC Controller", brand: "Allen Bradley", model: "1756", type: "PLC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "ControlLogix, 16 I/O, Ethernet/IP, 2MB Memory, Original OEM, GST Invoice" },
  { category: "Electrical Parts", product: "PLC Controller", brand: "Siemens", model: "S7-1200", type: "PLC", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "CPU 1214C, 14 I/O, PROFINET, TIA Portal Compatible, GST Invoice" },
  { category: "Electrical Parts", product: "Contactor", brand: "ABB", model: "25A 3 Pole", type: "Contactor", unit: "pcs", qtyMin: 5, qtyMax: 30, specs: "25A, 3 Pole, AC3 Duty, Auxiliary Contact, 2 Year Warranty, GST Invoice" },
  { category: "Electrical Parts", product: "Relay", brand: "Omron", model: "MY2N", type: "Relay", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "24VDC Coil, DPDT, 5A Contact, LED Indicator, GST Invoice" },
  { category: "Electrical Parts", product: "Servo Motor", brand: "Delta", model: "ASDA-B2", type: "Servo", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "1.5kW, 3000 RPM, CANopen, Low Cogging, 2 Year Warranty, GST Invoice" },
  { category: "Electrical Parts", product: "Industrial LED Light", brand: "Philips", model: "150W Highbay", type: "LED Light", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "150W, 15000 Lumens, IP65, 50000hr Life, GST Invoice" },

  // CONSTRUCTION MATERIALS (15 products)
  { category: "Construction Materials", product: "TMT Bar", brand: "Tata", model: "12mm Fe500", type: "TMT Bar", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "Fe500D, UTS 545+, Earthquake Resistant, Anti Corrosion, Mill Test Certificate, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "TMT Bar", brand: "JSW", model: "16mm Fe550", type: "TMT Bar", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "Fe550D, Superior Bendability, ISI Marked, Quality Certificate, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "TMT Bar", brand: "SAIL", model: "20mm Fe500", type: "TMT Bar", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "Fe500D, IS 1786 Compliant, Mill Test Certificate, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Cement", brand: "ACC", model: "53 Grade", type: "Cement", unit: "bags", qtyMin: 50, qtyMax: 500, specs: "OPC 53S, Initial Strength 27MPa, Low Heat of Hydration, ISI Marked, 6 Month Shelf Life, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Cement", brand: "Ultratech", model: "OPC 53", type: "Cement", unit: "bags", qtyMin: 50, qtyMax: 500, specs: "OPC 53 Grade, Superior Strength, Fast Setting, ISI Marked, Quality Guaranteed, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Cement", brand: "Ambuja", model: "PPC", type: "Cement", unit: "bags", qtyMin: 50, qtyMax: 500, specs: "PPC Grade, Eco-Friendly, Low Heat, Durability, Delivery Included, GST Invoice" },
  { category: "Construction Materials", product: "Steel Beam", brand: "JSW", model: "ISMB 200", type: "Steel Beam", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "Hot Rolled, IS 2062 E250, Test Certificate, Fabrication Available, GST Invoice" },
  { category: "Construction Materials", product: "Steel Channel", brand: "Tata", model: "ISMC 100", type: "Channel", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "Hot Rolled, IS 2062, 6m Length, Test Certificate, GST Invoice" },
  { category: "Construction Materials", product: "Aluminum Panel", brand: "Alstrong", model: "4mm ACP", type: "ACP Sheet", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "4mm Thickness, PVDF Coating, Fire Retardant, 2440x1220mm Sheet, 10 Year Warranty, GST Invoice" },
  { category: "Construction Materials", product: "Bricks", brand: null, model: "Red Clay", type: "Brick", unit: "pcs", qtyMin: 1000, qtyMax: 10000, specs: "230x115x75mm, Class A, Compressive Strength 10MPa, Uniform Shape, Delivery Available, GST Invoice" },
  { category: "Construction Materials", product: "Fly Ash Bricks", brand: null, model: "Standard", type: "Brick", unit: "pcs", qtyMin: 500, qtyMax: 5000, specs: "Eco-Friendly, 9x4x3 inch, Compressive Strength 10MPa, Uniform Size, GST Invoice" },
  { category: "Construction Materials", product: "AAC Blocks", brand: null, model: "600x200x200", type: "Block", unit: "pcs", qtyMin: 100, qtyMax: 1000, specs: "Autoclaved Aerated, Light Weight, Thermal Insulation, 4 Inch, GST Invoice" },
  { category: "Construction Materials", product: "Sand", brand: null, model: "River Sand", type: "Sand", unit: "ton", qtyMin: 5, qtyMax: 50, specs: "Cubic Delivered, Zone 2-3, Low Silt, Washed and Screened, Quality Report, Delivery Included" },
  { category: "Construction Materials", product: "Crushed Stone", brand: null, model: "20mm", type: "Aggregate", unit: "ton", qtyMin: 5, qtyMax: 100, specs: "20mm Aggregate, Well Graded, CBR Value 80+, Quality Report, Delivery Included" },
  { category: "Construction Materials", product: "Ready Mix Concrete", brand: null, model: "M25 Grade", type: "Concrete", unit: "cum", qtyMin: 50, qtyMax: 500, specs: "M25 Grade, 7 Day 25 MPa, Pump Ready, ISI Marked, On Site Delivery" },

  // RAW MATERIALS (10 products)
  { category: "Raw Materials", product: "Aluminum Ingot", brand: null, model: "Primary Grade", type: "Aluminum", unit: "ton", qtyMin: 1, qtyMax: 20, specs: "99.7% Pure, Ingot Form, LM6/LM24 Grade, Chemical Composition Report, GST Invoice" },
  { category: "Raw Materials", product: "Copper Scrap", brand: null, model: "Bare Bright", type: "Copper Scrap", unit: "kg", qtyMin: 100, qtyMax: 1000, specs: "99.9% Pure, No Insulation, Bright Bare Wire, Lab Test Report, GST Invoice" },
  { category: "Raw Materials", product: "Copper Rod", brand: "Luvata", model: "8mm", type: "Copper", unit: "kg", qtyMin: 100, qtyMax: 500, specs: "99.9% Pure, 8mm Diameter, ETP Grade, Annealed, Lab Test Report, GST Invoice" },
  { category: "Raw Materials", product: "MS Scrap", brand: null, model: "Heavy Melting", type: "MS Scrap", unit: "ton", qtyMin: 5, qtyMax: 50, specs: "HMS 1&2, 98% Metal Recovery, No Radiated, Lab Tested, GST Invoice" },
  { category: "Raw Materials", product: "Steel Scrap", brand: null, model: "Shredded", type: "Steel Scrap", unit: "ton", qtyMin: 5, qtyMax: 30, specs: "Shredded Form, ISRI 211-214, 98.5% Pure, No Contamination, GST Invoice" },
  { category: "Raw Materials", product: "Iron Ore", brand: null, model: "Fines 63%", type: "Iron Ore", unit: "ton", qtyMin: 100, qtyMax: 1000, specs: "Fe 63%+, Low Silica, Moisture 4% Max, Chrome 0.1% Max, Assay Report, GST Invoice" },
  { category: "Raw Materials", product: "Aluminum Scrap", brand: null, model: " UBC", type: "Aluminum Scrap", unit: "ton", qtyMin: 2, qtyMax: 20, specs: "Used Beverage Cans, 98.5% Pure, Bale Form, Lab Test Report, GST Invoice" },
  { category: "Raw Materials", product: "Zinc Ingot", brand: null, model: "SHG 99.995%", type: "Zinc", unit: "ton", qtyMin: 1, qtyMax: 10, specs: "SHG 99.995%, 1MT Ingots, ISO Certified, Chemical Report, GST Invoice" },
  { category: "Raw Materials", product: "Lead Ingot", brand: null, model: "Pure Grade", type: "Lead", unit: "ton", qtyMin: 1, qtyMax: 10, specs: "99.97% Pure, 25kg Ingots, Anti Corrosion, Lab Test Report, GST Invoice" },
  { category: "Raw Materials", product: "Brass Scrap", brand: null, model: "Honey", type: "Brass Scrap", unit: "kg", qtyMin: 50, qtyMax: 500, specs: "Honey Grade, 62% Copper, Clean, No Plating, Lab Test Report, GST Invoice" },

  // CHEMICALS & PLASTICS (10 products)
  { category: "Chemicals & Plastics", product: "HDPE Granules", brand: "Reliance", model: "Injection Grade", type: "HDPE", unit: "kg", qtyMin: 500, qtyMax: 5000, specs: "MFI 20, Natural Color, Food Grade, BIS Approved, Technical Data Sheet, GST Invoice" },
  { category: "Chemicals & Plastics", product: "PVC Resin", brand: "Finolex", model: "SG5", type: "PVC", unit: "kg", qtyMin: 500, qtyMax: 5000, specs: "K Value 67, Suspension Polymer, BIS Certified, Technical Data Sheet, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Polypropylene Granules", brand: "Reliance", model: "PP H110MA", type: "PP Granules", unit: "kg", qtyMin: 500, qtyMax: 5000, specs: "MFI 3, Homopolymer, Injection Molding Grade, BIS Approved, TDS Available, GST Invoice" },
  { category: "Chemicals & Plastics", product: "LDPE Film", brand: "Standard", model: "Film Grade", type: "LDPE", unit: "kg", qtyMin: 200, qtyMax: 2000, specs: "MFI 2, Natural, Blown Film Grade, Food Contact Approved, TDS Available, GST Invoice" },
  { category: "Chemicals & Plastics", product: "ABS Granules", brand: "LG Chem", model: "HF-6560", type: "ABS", unit: "kg", qtyMin: 200, qtyMax: 2000, specs: "High Flow, Impact Modified, Heat Resistant, OEM Grade, TDS Available, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Polycarbonate Sheet", brand: "Danpalon", model: "6mm", type: "Sheet", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "6mm Twin Wall, UV Protected, 99% Light Transmission, 10 Year Warranty, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Epoxy Resin", brand: "Araldite", model: "AW 106", type: "Resin", unit: "kg", qtyMin: 10, qtyMax: 100, specs: "Low Viscosity, Clear, 45 Min Pot Life, Industrial Grade, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Industrial Lubricant", brand: "Mobil", model: "DTE 26", type: "Oil", unit: "liter", qtyMin: 20, qtyMax: 200, specs: "Hydraulic Oil, ISO VG 68, Anti Wear, 5000hr Drain, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Sulfuric Acid", brand: null, model: "98%", type: "Acid", unit: "kg", qtyMin: 100, qtyMax: 1000, specs: "98% Pure, Industrial Grade, MSDS Available, GST Invoice" },
  { category: "Chemicals & Plastics", product: "Sodium Hydroxide", brand: null, model: "Flakes 98%", type: "Chemical", unit: "kg", qtyMin: 100, qtyMax: 1000, specs: "Caustic Soda Flakes, 98% Purity, Industrial Grade, GST Invoice" },

  // PACKAGING (10 products)
  { category: "Packaging", product: "Corrugated Box", brand: null, model: "5 Ply", type: "Box", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "5 Ply, Bursting Strength 12kg/cm2, Custom Sizes, Printing Available, MOQ 50, GST Invoice" },
  { category: "Packaging", product: "Corrugated Box", brand: null, model: "3 Ply", type: "Box", unit: "pcs", qtyMin: 100, qtyMax: 1000, specs: "3 Ply, Bursting Strength 8kg/cm2, Light Duty, Custom Sizes, MOQ 100, GST Invoice" },
  { category: "Packaging", product: "Stretch Film Roll", brand: null, model: "23 mic", type: "Film", unit: "roll", qtyMin: 10, qtyMax: 100, specs: "23 Micron, 500mm Width, 300m Length, Load Capacity 200kg, UV Stabilized, GST Invoice" },
  { category: "Packaging", product: "Bubble Wrap Roll", brand: null, model: "5mm Bubble", type: "Bubble Wrap", unit: "roll", qtyMin: 5, qtyMax: 50, specs: "5mm Bubble, 50m Length, 500mm Width, Lightweight, Recyclable, GST Invoice" },
  { category: "Packaging", product: "Packing Tape", brand: "3M", model: "Translucent", type: "Tape", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "48mm Width, 50m Length, Clear, Acrylic Adhesive, UV Resistant, GST Invoice" },
  { category: "Packaging", product: "Brown Tape", brand: "Champion", model: "48mm", type: "Tape", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "48mm Width, 65m Length, Brown Color, Hot Melt Adhesive, GST Invoice" },
  { category: "Packaging", product: "PP Woven Sacks", brand: null, model: "50kg", type: "Sacks", unit: "pcs", qtyMin: 100, qtyMax: 1000, specs: "PP Woven, 50kg Capacity, Laminated, Custom Print, GST Invoice" },
  { category: "Packaging", product: "Plastic Crates", brand: "Nilkamal", model: "Medium", type: "Crate", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "PP Plastic, 32L Capacity, Stackable, Ventilated, GST Invoice" },
  { category: "Packaging", product: "Pallet", brand: null, model: "Wooden 4 Way", type: "Pallet", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "Pine Wood, 4 Way Entry, ISPM 15 Compliant, Heat Treated, GST Invoice" },
  { category: "Packaging", product: "Metal Drum", brand: null, model: "200L", type: "Drum", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "MS Steel, 200L Capacity, Open Top, Lined/Unlined, Reconditioned, GST Invoice" },

  // TEXTILES & APPAREL (10 products)
  { category: "Textiles & Apparel", product: "Cotton Fabric", brand: "Raymond", model: "60 inch", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 500, specs: "100% Cotton, 60 inch Width, GSM 150, OEKO-TEX Certified, Color Fastness Guaranteed, GST Invoice" },
  { category: "Textiles & Apparel", product: "Polyester Fabric", brand: "Arvind", model: "58 inch", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 500, specs: "Polyester Blend, 58 inch Width, GSM 120, Wrinkle Resistant, Color Fastness Guaranteed, GST Invoice" },
  { category: "Textiles & Apparel", product: "Silk Fabric", brand: null, model: "Banarasi", type: "Fabric", unit: "meter", qtyMin: 10, qtyMax: 100, specs: "Pure Silk, 44 inch Width, Traditional Design, GST Invoice" },
  { category: "Textiles & Apparel", product: "Denim Fabric", brand: "Arvind", model: "14oz", type: "Fabric", unit: "meter", qtyMin: 50, qtyMax: 300, specs: "100% Cotton, 14oz Weight, Selvedge, Indigo, GST Invoice" },
  { category: "Textiles & Apparel", product: "Formal Shirts", brand: null, model: "Cotton Blend", type: "Shirt", unit: "pcs", qtyMin: 25, qtyMax: 250, specs: "65% Poly 35% Cotton, Regular Fit, Solid Colors, Sizes S-5XL, MOQ 25, GST Invoice" },
  { category: "Textiles & Apparel", product: "Industrial Workwear", brand: null, model: "Cotton", type: "Workwear", unit: "pcs", qtyMin: 25, qtyMax: 200, specs: "100% Cotton 12oz, Hi-Vis Options, EN ISO Certified, Sizes M-4XL, MOQ 25, GST Invoice" },
  { category: "Textiles & Apparel", product: "T-Shirts", brand: null, model: "Round Neck", type: "T-Shirt", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "100% Cotton, 180 GSM, Solid Colors, Sizes S-5XL, MOQ 50, GST Invoice" },
  { category: "Textiles & Apparel", product: "School Uniform Fabric", brand: null, model: "Poly Cotton", type: "Fabric", unit: "meter", qtyMin: 100, qtyMax: 1000, specs: "65/35 Poly Cotton, 110 GSM, School Colors, Durable, GST Invoice" },
  { category: "Textiles & Apparel", product: "Mattress", brand: "Sleepyhead", model: "Queen 8 inch", type: "Mattress", unit: "pcs", qtyMin: 1, qtyMax: 10, specs: "Memory Foam, 8 inch, Medium Firm, Removable Cover, 10 Year Warranty, GST Invoice" },
  { category: "Textiles & Apparel", product: "Curtains", brand: null, model: "Blackout", type: "Curtain", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "Blackout Fabric, 54 inch Width, Eyelet, Various Colors, GST Invoice" },

  // FOOD & AGRICULTURE (10 products)
  { category: "Food & Agriculture", product: "Basmati Rice", brand: "India Gate", model: "5kg", type: "Rice", unit: "kg", qtyMin: 50, qtyMax: 500, specs: "Extra Long Grain, 99.95% Purity, FSSAI Certified, Aroma Guaranteed, Non-Sticky, GST Invoice" },
  { category: "Food & Agriculture", product: "Wheat", brand: null, model: "Sharbati", type: "Wheat", unit: "kg", qtyMin: 100, qtyMax: 1000, specs: "Premium Sharbati, 99% Purity, Moisture 12% Max, FSSAI Certified, Clean and Sorted, GST Invoice" },
  { category: "Food & Agriculture", product: "Maize", brand: null, model: "Yellow", type: "Corn", unit: "kg", qtyMin: 100, qtyMax: 500, specs: "Yellow Maize, 12% Moisture, No Aflatoxin, FSSAI Certified, GST Invoice" },
  { category: "Food & Agriculture", product: "Organic Fertilizer", brand: "Godrej", model: "25kg", type: "Fertilizer", unit: "bags", qtyMin: 10, qtyMax: 100, specs: "Organic, NPK 10:5:5, 25kg Bag, FCO Certified, Bio-Fortified, GST Invoice" },
  { category: "Food & Agriculture", product: "NPK Fertilizer", brand: "IPL", model: "10-26-26", type: "Fertilizer", unit: "bags", qtyMin: 20, qtyMax: 200, specs: "NPK 10-26-26, 50kg Bag, Water Soluble, FCO Certified, GST Invoice" },
  { category: "Food & Agriculture", product: "Urea", brand: "NFL", model: "46% N", type: "Fertilizer", unit: "bags", qtyMin: 20, qtyMax: 200, specs: "46% Nitrogen, 50kg Bag, Granular, FCO Certified, GST Invoice" },
  { category: "Food & Agriculture", product: "Sprayer Pump", brand: "MAP", model: "16L", type: "Sprayer", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "16L Capacity, Battery Operated, 8 Bar Pressure, Adjustable Nozzle, 1 Year Warranty, GST Invoice" },
  { category: "Food & Agriculture", product: "Drip Irrigation Kit", brand: "Netafim", model: "1 Acre", type: "Irrigation", unit: "sets", qtyMin: 1, qtyMax: 10, specs: "1 Acre Setup, Drippers 4LPH, HDPE Pipes, Filter Included, GST Invoice" },
  { category: "Food & Agriculture", product: "Plywood", brand: "Greenply", model: "18mm BWR", type: "Plywood", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "BWR Grade, 18mm, Calibrated, 7 Ply, Boiling Water Resistant, GST Invoice" },
  { category: "Food & Agriculture", product: "Agricultural Pipes", brand: "Finolex", model: "4 inch", type: "Pipe", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "PVC, 4 inch Diameter, 6m Length, UV Stabilized, ISI Marked, GST Invoice" },

  // HEALTH & SAFETY (10 products)
  { category: "Health & Safety", product: "N95 Mask", brand: "3M", model: "VFM 100pcs", type: "Mask", unit: "pcs", qtyMin: 50, qtyMax: 500, specs: "N95 Grade, 4 Layer Protection, BIS Approved, 99% Bacterial Filtration, Comfortable Fit, GST Invoice" },
  { category: "Health & Safety", product: "N99 Mask", brand: "3M", model: "9210+", type: "Mask", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "N99 Grade, 4 Layer Protection, BIS Approved, 99% Particulate Filtration, GST Invoice" },
  { category: "Health & Safety", product: "Safety Helmet", brand: "Ultimate", model: "ISI Marked", type: "Helmet", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "IS 2925 Certified, UV Stabilized, Ratchet Adjustment, Electrical Insulation, 3 Year Shelf Life, GST Invoice" },
  { category: "Health & Safety", product: "Safety Shoes", brand: "Bata", model: "Grip Guard", type: "Shoes", unit: "pairs", qtyMin: 10, qtyMax: 100, specs: "Steel Toe Cap, PU Sole, Anti Skid, Oil Resistant, BIS Approved, GST Invoice" },
  { category: "Health & Safety", product: "Industrial Gloves", brand: "Midas", model: "Heavy Duty", type: "Gloves", unit: "pairs", qtyMin: 25, qtyMax: 200, specs: "Cut Level 5, PU Coated, Abrasion Resistant, Sizes M-XXL, EN388 Certified, GST Invoice" },
  { category: "Health & Safety", product: "Nitrile Gloves", brand: "Ansell", model: "TouchNTuff", type: "Gloves", unit: "pcs", qtyMin: 100, qtyMax: 1000, specs: "100 Count Box, Powder Free, 4 mil Thickness, Food Grade, GST Invoice" },
  { category: "Health & Safety", product: "First Aid Kit", brand: "Dukal", model: "OSHA", type: "First Aid", unit: "pcs", qtyMin: 5, qtyMax: 50, specs: "OSHA Compliant, 100 Items, Plastic Case, Wall Mountable, Refill Available, GST Invoice" },
  { category: "Health & Safety", product: "Safety Vest", brand: null, model: "Hi-Vis", type: "Vest", unit: "pcs", qtyMin: 20, qtyMax: 200, specs: "EN ISO 20471, Fluorescent Orange, Reflective Strips, Adjustable, GST Invoice" },
  { category: "Health & Safety", product: "Fire Extinguisher", brand: "Safe Pros", model: "5kg ABC", type: "Fire Safety", unit: "pcs", qtyMin: 2, qtyMax: 20, specs: "ABC Dry Powder, 5kg, BIS Approved, Wall Mounted, 5 Year Warranty, GST Invoice" },
  { category: "Health & Safety", product: "Safety Goggles", brand: "UVEX", model: "i-3", type: "Goggles", unit: "pcs", qtyMin: 10, qtyMax: 100, specs: "Anti Fog, Anti Scratch, Indirect Ventilation, EN166 Certified, GST Invoice" },

  // LOGISTICS & TRANSPORT (10 products)
  { category: "Logistics & Transport", product: "Packer and Mover Service", brand: null, model: "2BHK", type: "Service", unit: "service", qtyMin: 1, qtyMax: 3, specs: "Packing Material Included, 3 Men Team, Door to Door, Insurance Available, 10 Years Experience, GST Invoice" },
  { category: "Logistics & Transport", product: "Packer and Mover Service", brand: null, model: "3BHK", type: "Service", unit: "service", qtyMin: 1, qtyMax: 3, specs: "Premium Packing, 5 Men Team, Door to Door, Insurance Included, 10 Years Experience, GST Invoice" },
  { category: "Logistics & Transport", product: "Truck Transport", brand: null, model: "14ft", type: "Truck", unit: "trips", qtyMin: 1, qtyMax: 10, specs: "14ft Container, 4 Ton Capacity, GPS Tracked, Experienced Driver, Door Pickup, All India Permit, GST Invoice" },
  { category: "Logistics & Transport", product: "Truck Transport", brand: null, model: "20ft", type: "Truck", unit: "trips", qtyMin: 1, qtyMax: 10, specs: "20ft Container, 8 Ton Capacity, GPS Tracked, Experienced Driver, All India Permit, GST Invoice" },
  { category: "Logistics & Transport", product: "Container Storage", brand: null, model: "20ft", type: "Container", unit: "units", qtyMin: 1, qtyMax: 5, specs: "20ft Dry Container, CSC Certified, Pest Controlled, 24/7 Security, CCTV Surveillance, Flexible Tenure, GST Invoice" },
  { category: "Logistics & Transport", product: "Container Storage", brand: null, model: "40ft", type: "Container", unit: "units", qtyMin: 1, qtyMax: 3, specs: "40ft High Cube, CSC Certified, Climate Control Option, 24/7 Security, CCTV Surveillance, GST Invoice" },
  { category: "Logistics & Transport", product: "Warehouse Rental", brand: null, model: "5000sqft", type: "Warehouse", unit: "sqft", qtyMin: 1000, qtyMax: 10000, specs: "Industrial Area, PEB Structure, 20ft Ceiling Height, Loading Bay, Power Backup, 24/7 Security, GST Invoice" },
  { category: "Logistics & Transport", product: "Warehouse Rental", brand: null, model: "10000sqft", type: "Warehouse", unit: "sqft", qtyMin: 5000, qtyMax: 20000, specs: "Commercial Complex, RCC Structure, 15ft Ceiling, Loading Dock, Power 3 Phase, 24/7 Security, GST Invoice" },
  { category: "Logistics & Transport", product: "Cold Storage", brand: null, model: "100sqft", type: "Cold Storage", unit: "sqft", qtyMin: 100, qtyMax: 1000, specs: "-18C to +5C, Temperature Controlled, 24/7 Monitoring, Power Backup, GST Invoice" },
  { category: "Logistics & Transport", product: "Flight Cargo Service", brand: null, model: "Door to Door", type: "Cargo", unit: "kg", qtyMin: 10, qtyMax: 500, specs: "Air Freight, Door to Door, Tracking Available, 48hr Delivery, GST Invoice" },

  // BUSINESS SERVICES (10 products)
  { category: "Business Services", product: "Management Consulting", brand: null, model: "Strategic", type: "Consulting", unit: "hours", qtyMin: 10, qtyMax: 100, specs: "Industry Expert, Strategy Development, Market Analysis, Implementation Support, Progress Reports, GST Invoice" },
  { category: "Business Services", product: "Financial Audit", brand: null, model: "Statutory", type: "Audit", unit: "service", qtyMin: 1, qtyMax: 5, specs: "CA Certified, Statutory Audit, Balance Sheet Review, Tax Compliance, GST Invoice" },
  { category: "Business Services", product: "Digital Marketing", brand: null, model: "Monthly Package", type: "Marketing", unit: "month", qtyMin: 1, qtyMax: 6, specs: "SEO + SMM + PPC, Monthly Reports, Dedicated Account Manager, Social Media Management, GST Invoice" },
  { category: "Business Services", product: "Social Media Marketing", brand: null, model: "Content Creation", type: "Marketing", unit: "posts", qtyMin: 10, qtyMax: 50, specs: "15 Posts Monthly, Graphics, Captions, Hashtag Strategy, Engagement Report, GST Invoice" },
  { category: "Business Services", product: "Website Development", brand: null, model: "E-commerce", type: "Development", unit: "project", qtyMin: 1, qtyMax: 3, specs: "Custom Design, Payment Gateway, Inventory Management, Mobile Responsive, 1 Year Support, GST Invoice" },
  { category: "Business Services", product: "Website Development", brand: null, model: "Business", type: "Development", unit: "project", qtyMin: 1, qtyMax: 5, specs: "5 Pages, Responsive Design, Contact Form, SEO Optimized, 6 Month Support, GST Invoice" },
  { category: "Business Services", product: "App Development", brand: null, model: "Android", type: "Development", unit: "project", qtyMin: 1, qtyMax: 3, specs: "Native Android, Custom Features, Play Store Ready, 1 Year Support, GST Invoice" },
  { category: "Business Services", product: "Legal Documentation", brand: null, model: "Corporate", type: "Legal", unit: "service", qtyMin: 1, qtyMax: 5, specs: "ROC Compliance, MOA/AOA Drafting, Share Registry, Annual Compliance, CA Verified, GST Invoice" },
  { category: "Business Services", product: "Trademark Registration", brand: null, model: "Logo", type: "IPR", unit: "service", qtyMin: 1, qtyMax: 3, specs: "TM Application, Search Report, Filing, Government Fees Included, 18 Months Timeline, GST Invoice" },
  { category: "Business Services", product: "ISO Certification", brand: null, model: "9001:2015", type: "Certification", unit: "service", qtyMin: 1, qtyMax: 2, specs: "QMS Certification, Documentation Support, Internal Audit, 3 Year Validity, GST Invoice" },

  // SERVICES & MAINTENANCE (10 products)
  { category: "Services & Maintenance", product: "Wedding Catering", brand: null, model: "100 plates", type: "Catering", unit: "plates", qtyMin: 50, qtyMax: 500, specs: "North Indian + South Indian, 5 Star Quality, Trained Staff, Live Counter, Hall Decoration, GST Invoice" },
  { category: "Services & Maintenance", product: "Corporate Catering", brand: null, model: "Buffet", type: "Catering", unit: "plates", qtyMin: 20, qtyMax: 200, specs: "Multi Cuisine, Professional Setup, Trained Staff, Eco Friendly, GST Invoice" },
  { category: "Services & Maintenance", product: "Corporate Event", brand: null, model: "50 persons", type: "Event", unit: "event", qtyMin: 1, qtyMax: 5, specs: "Venue Selection, Invitation Design, Catering, Photography, AV Equipment, GST Invoice" },
  { category: "Services & Maintenance", product: "Wedding Event", brand: null, model: "500 guests", type: "Event", unit: "event", qtyMin: 1, qtyMax: 2, specs: "Complete Planning, Venue, Decor, Catering, Photography, Entertainment, GST Invoice" },
  { category: "Services & Maintenance", product: "Interior Design", brand: null, model: "Full House", type: "Interior", unit: "project", qtyMin: 1, qtyMax: 3, specs: "2BHK/3BHK, Modular Kitchen, Wardrobes, False Ceiling, Civil Work Included, 3 Year Warranty, GST Invoice" },
  { category: "Services & Maintenance", product: "Interior Design", brand: null, model: "Office", type: "Interior", unit: "project", qtyMin: 1, qtyMax: 5, specs: "Workstations, Meeting Rooms, Reception, False Ceiling, Lighting, 3 Year Warranty, GST Invoice" },
  { category: "Services & Maintenance", product: "AC Repair Service", brand: null, model: "Split/Window", type: "Service", unit: "service", qtyMin: 5, qtyMax: 50, specs: "Gas Refilling, PCB Repair, Coil Cleaning, 90 Day Warranty, Genuine Parts, Trained Technician, GST Invoice" },
  { category: "Services & Maintenance", product: "AC AMC Service", brand: null, model: "Annual", type: "AMC", unit: "units", qtyMin: 2, qtyMax: 20, specs: "2 Services Yearly, Gas Top Up, Filter Cleaning, Priority Support, Genuine Parts, GST Invoice" },
  { category: "Services & Maintenance", product: "Pest Control Service", brand: null, model: "Full Home", type: "Pest Control", unit: "service", qtyMin: 1, qtyMax: 5, specs: "Cockroach, Termite, Ant Treatment, 1 Year Warranty, Government Approved, GST Invoice" },
  { category: "Services & Maintenance", product: "Housekeeping Service", brand: null, model: "Monthly", type: "Housekeeping", unit: "months", qtyMin: 1, qtyMax: 12, specs: "Daily Cleaning, Trained Staff, All Equipment, Supplies Included, GST Invoice" }
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
      "Looking for {product}. Need it for home use - living room ya bedroom. Brand preferred. Best price with GST. Submit on HOKO.",
      "We need {product}. For office/business use. Good brand needed. Quick delivery. Share your best price on HOKO.",
      "In need of {product}. Setting up new home. Premium quality with warranty a must. GST invoice mandatory. Price on HOKO.",
      "Require {product} urgently. Old one stopped working. Need replacement ASAP. Home delivery preferred. HOKO pe price do.",
      "Want {product} for studies/work. Brand new with official warranty. Best price. Submit on HOKO.",
      "On the lookout for {product}. Home ya office use. Good brand. GST invoice. Share price on HOKO.",
      "We're looking for {product}. New setup. Premium quality. Warranty included. Best price on HOKO.",
      "Searching for {product}. Replacement needed. Old model not working. Home delivery. Price on HOKO."
    ],
    "Furniture & Home": [
      "Looking for {product}. New house furnishing. Living room use. Quality furniture with delivery. Submit on HOKO.",
      "We need {product}. Bedroom furniture. Good quality. Storage wala preferred. Best dealer price. Submit on HOKO.",
      "In need of {product}. Home decoration. Modern design. Premium finish. Photos and price. Submit on HOKO.",
      "Require {product} for office/home office. Good quality needed. Budget flexible. Share price on HOKO.",
      "Want {product} for rental apartment. Affordable options. Quality furniture. Share options on HOKO.",
      "Looking for {product}. Living room furnishing. Good quality. Delivery needed. Best price on HOKO.",
      "We need {product}. Bedroom setup. Storage furniture. Premium quality. Price on HOKO."
    ],
    "Vehicles & Parts": [
      "Looking for {product}. For daily commute. Well maintained pre-owned. Best price. Submit on HOKO.",
      "We need {product}. Family use. Service history mandatory. Clean vehicle. Best price. Submit on HOKO.",
      "In need of {product}. Business use. Reliable vehicle. Good condition. Transfer included. Price on HOKO.",
      "Require {product}. First vehicle. Budget flexible. Safe and reliable. Best price. Submit on HOKO.",
      "Want {product}. Pre-owned vehicle. Low km driven. Insurance valid. Well maintained. Price on HOKO.",
      "Looking for {product}. Daily use. Well maintained. Best deal. Submit on HOKO.",
      "We need {product}. Family car. Service records. Best price on HOKO."
    ],
    "Industrial Machinery": [
      "Looking for {product}. Factory/industrial use. Heavy duty. Reliable brand. Technical specs. Submit on HOKO.",
      "We need {product}. Production line. Quality machinery with warranty. Installation required. Quote on HOKO.",
      "In need of {product}. Plant maintenance. Test run mandatory. Quality guarantee. Share price on HOKO.",
      "Require {product}. New setup. Efficient machinery. IE3 efficiency preferred. Complete pricing. Submit on HOKO.",
      "Want {product}. Industrial use. Technical specifications. Test certificates. Best price. HOKO pe quote do.",
      "Looking for {product}. Manufacturing unit. Heavy duty machinery. Quote on HOKO.",
      "We need {product}. Production facility. Quality equipment. Best price on HOKO."
    ],
    "Electrical Parts": [
      "Looking for {product}. Electrical project. ISI marked products mandatory. Competitive price. Submit on HOKO.",
      "We need {product}. Factory maintenance. Consistent quality essential. Bulk pricing available. HOKO pe price do.",
      "In need of {product}. Construction site. Reliable parts. Good quality. GST invoice. Price on HOKO.",
      "Require {product}. New building wiring. Multiple pieces. GST invoice mandatory. Per unit price. HOKO.",
      "Want {product}. Trial order to check quality. Technical datasheet. Share price on HOKO.",
      "Looking for {product}. Electrical work. ISI marked. Best price. Submit on HOKO.",
      "We need {product}. Wiring project. Quality parts. GST invoice. Price on HOKO."
    ],
    "Construction Materials": [
      "Looking for {product}. House/building construction. Quality materials with delivery. Certificate. Submit on HOKO.",
      "We need {product}. Ongoing project. Bulk order. Site delivery mandatory. Best price. HOKO pe quote do.",
      "In need of {product}. New construction. Quality material. Site delivery. GST invoice. Price on HOKO.",
      "Require {product}. Commercial project. Reliable supplier. Consistent quality. GST mandatory. Submit on HOKO.",
      "Want {product}. Building work. Quality materials. Timely delivery essential. Best price. HOKO.",
      "Looking for {product}. Construction site. Quality material. Delivery needed. Price on HOKO.",
      "We need {product}. House build. Bulk order. Best price on HOKO."
    ],
    "Services & Maintenance": [
      "Looking for {product}. Event/celebration planning. Experienced team. Budget flexible. Share packages on HOKO.",
      "We need {product}. Office/home service. Professional service. Quality work. Best price. Submit on HOKO.",
      "In need of {product}. Renovation/interior work. Creative team. Portfolio required. Quote on HOKO.",
      "Require {product} urgently. Professional service. Warranty preferred. Service charges. HOKO pe do.",
      "Want {product}. Regular maintenance. Experienced team. Good reviews. Best price. Submit on HOKO.",
      "Looking for {product}. Event planning. Experienced vendor. Budget flexible. HOKO pe do.",
      "We need {product}. Repair/maintenance. Professional. Best price. Submit on HOKO."
    ],
    "Raw Materials": [
      "Looking for {product}. Manufacturing unit. Consistent quality. Monthly orders possible. GST invoice. HOKO pe price do.",
      "We need {product}. Factory raw material. High volume. Competitive rates. Quality certificate. Submit on HOKO.",
      "In need of {product}. Production requirement. Test sample required. Bulk order. Best price. HOKO.",
      "Require {product}. Regular manufacturing. Quality material. Timely delivery. GST invoice. Price on HOKO.",
      "Want {product}. Production use. Consistent quality essential. Long-term supplier interested. HOKO pe quote do.",
      "Looking for {product}. Bulk order. Industrial use. Quality material. GST invoice. HOKO pe do.",
      "We need {product}. Manufacturing. Monthly supply. Best price on HOKO."
    ],
    "Chemicals & Plastics": [
      "Looking for {product}. Plastic manufacturing. Consistent quality. BIS certified. Per kg rate. Submit on HOKO.",
      "We need {product}. Industrial use. Quality material. Test sample. Delivery included. Price on HOKO.",
      "In need of {product}. Production line. Quality granules/resin. Technical specs. Best price. HOKO.",
      "Require {product}. Manufacturing. Monthly orders. Quality consistency. GST invoice. Price do HOKO pe.",
      "Want {product}. Industrial grade. Safety data sheet. Competitive pricing. Submit on HOKO.",
      "Looking for {product}. Plastic industry. Consistent quality. Best price. HOKO pe do.",
      "We need {product}. Manufacturing unit. Bulk order. Quality material. Price on HOKO."
    ],
    "Packaging": [
      "Looking for {product}. Product packaging. Monthly requirement. Quality important. Bulk pricing. HOKO pe price do.",
      "We need {product}. Urgent order. Quick delivery. Good quality. Per piece/roll price. Submit on HOKO.",
      "In need of {product}. Shipping/warehousing. Consistent quality. Monthly orders. Competitive rates. HOKO.",
      "Require {product}. Manufacturing packaging. Custom printing available. Samples and price. HOKO pe do.",
      "Want {product}. Food-grade packaging. Safety compliance. Quality material. Best price. Submit on HOKO.",
      "Looking for {product}. Packaging material. Bulk order. Quality needed. Best price on HOKO.",
      "We need {product}. Shipping boxes/film. Monthly order. Price on HOKO."
    ],
    "Textiles & Apparel": [
      "Looking for {product}. Retail/shop use. Good quality fabric. Per meter rate. GST invoice. Submit on HOKO.",
      "We need {product}. E-commerce/business use. Bulk order. Fast delivery. Competitive price. HOKO pe do.",
      "In need of {product}. Office/school uniform. Multiple sizes. Per piece rate. Bulk pricing. Submit on HOKO.",
      "Require {product}. Manufacturing use. Regular monthly orders. Quality consistency. Best price. HOKO.",
      "Want {product}. Boutique/designer use. Premium quality. Unique designs. Sample first. Price on HOKO.",
      "Looking for {product}. Fabric for clothing. Good quality. Best price. Submit on HOKO.",
      "We need {product}. Bulk order. Textile. Competitive rates. HOKO pe do."
    ],
    "Food & Agriculture": [
      "Looking for {product}. Restaurant/daily cooking. Consistent quality. FSSAI certified. Best wholesale. HOKO pe do.",
      "We need {product}. Distribution/business. Bulk order. Clean quality. FSSAI mandatory. Price on HOKO.",
      "In need of {product}. Wedding/celebration. Premium quality. Bulk order. Delivery included. Submit on HOKO.",
      "Require {product}. Retail/resale. Wholesale rate. Good margin. Clean stock. Best price. HOKO.",
      "Want {product}. Hotel/catering. Daily requirement. Fresh stock. Regular supply. Price on HOKO.",
      "Looking for {product}. Food business. Bulk order. FSSAI certified. Best price on HOKO.",
      "We need {product}. Daily cooking. Quality grains. Regular supply. HOKO pe do."
    ],
    "Health & Safety": [
      "Looking for {product}. Factory/industrial. ISI marked mandatory. Bulk order. Per piece rate. HOKO pe do.",
      "We need {product}. Construction site. Safety equipment. OSHA compliant. Multiple pieces. Price on HOKO.",
      "In need of {product}. Office/workplace. Safety supplies. Quality products. Bulk pricing. Submit on HOKO.",
      "Require {product}. Hospital/medical. Quality medical-grade. Certification mandatory. Catalog. HOKO pe price do.",
      "Want {product}. School/public place. Safety equipment. BIS/ISO marked. Best price. Submit on HOKO.",
      "Looking for {product}. Safety gear. Bulk order. ISI marked. Best price on HOKO.",
      "We need {product}. Factory safety. PPE items. Quality products. Price on HOKO."
    ],
    "Logistics & Transport": [
      "Looking for {product}. Material transport. Reliable service. GPS tracked. Experienced driver. Per trip. HOKO.",
      "We need {product}. House/office shifting. Professional team. Packing material. Insurance. Estimate. HOKO pe do.",
      "In need of {product}. Warehouse/storage. Industrial area. Power backup. Per sqft rate. Submit on HOKO.",
      "Require {product}. Container storage. 20ft/40ft. CSC certified. 24/7 security. Per month. HOKO pe rate do.",
      "Want {product}. Cold storage. Perishables. Temperature controlled. Per sqft/pallet. GST invoice. HOKO.",
      "Looking for {product}. Transport service. Reliable. GPS tracked. Best rates on HOKO.",
      "We need {product}. Storage space. Warehouse. Industrial area. HOKO pe rate do."
    ],
    "Business Services": [
      "Looking for {product}. Business growth. Experienced consultant. Track record. Budget flexible. HOKO pe approach do.",
      "We need {product}. Online presence. SEO + marketing. Monthly retainer. Results oriented. Submit on HOKO.",
      "In need of {product}. Website/app development. Custom design. Mobile responsive. 1 year support. Quote. HOKO.",
      "Require {product}. Company registration. Legal compliance. CA/CS services. Professional fees. Submit on HOKO.",
      "Want {product}. IT services. AMC or on-call. Network/hardware. Monthly contract. Best rate. HOKO pe do.",
      "Looking for {product}. Professional services. Experienced team. Best approach. Submit on HOKO.",
      "We need {product}. Business support. Quality service. Best rates. HOKO pe do."
    ]
  },
  hinglish: {
    "Electronics & Appliances": [
      "Looking for {product}. Ghar ke liye chahiye - living room ya bedroom. Brand preferred. GST ke saath best price. HOKO pe do.",
      "We need {product}. Office/business ke liye. Good brand chahiye. Jaldi delivery. Best price share karo HOKO pe.",
      "In need of {product}. New home setup kar rahe hain. Premium quality with warranty zaroor. GST invoice mandatory. HOKO pe price do.",
      "Require {product} urgently. Purana kharab ho gaya. Jaldi replacement chahiye. Home delivery preferred. HOKO pe price do.",
      "Want {product} for studies/work. Brand new with official warranty. Best price. HOKO pe submit karo.",
      "On the lookout for {product}. Home ya office use. Good brand. GST invoice. Share price on HOKO.",
      "We're looking for {product}. New setup. Premium quality. Warranty included. Best price on HOKO.",
      "Searching for {product}. Replacement needed. Old model not working. Home delivery. Price on HOKO."
    ],
    "Furniture & Home": [
      "Looking for {product}. New house furnish karna hai. Living room ke liye. Quality furniture with delivery. HOKO pe do.",
      "We need {product}. Bedroom furniture. Good quality. Storage wala preferred. Best dealer price. HOKO pe do.",
      "In need of {product}. Home decoration. Modern design. Premium finish. Photos aur price share karo HOKO pe.",
      "Require {product} for office/home office. Good quality needed. Budget flexible. Share price on HOKO.",
      "Want {product} for rental apartment. Affordable options. Quality furniture. Share options on HOKO.",
      "Looking for {product}. Living room furnishing. Good quality. Delivery needed. Best price on HOKO.",
      "We need {product}. Bedroom setup. Storage furniture. Premium quality. Price on HOKO."
    ],
    "Vehicles & Parts": [
      "Looking for {product}. Daily commute ke liye. Well maintained pre-owned. Best price. HOKO pe do.",
      "We need {product}. Family use ke liye. Service history mandatory. Clean vehicle. Best price. HOKO pe do.",
      "In need of {product}. Business use ke liye. Reliable vehicle. Good condition. Transfer included. Price on HOKO.",
      "Require {product}. First vehicle. Budget flexible. Safe and reliable. Best price. HOKO pe submit karo.",
      "Want {product}. Pre-owned vehicle. Low km driven. Insurance valid. Well maintained. Price on HOKO.",
      "Looking for {product}. Daily use. Well maintained. Best deal. Submit on HOKO.",
      "We need {product}. Family car. Service records. Best price on HOKO."
    ],
    "Industrial Machinery": [
      "Looking for {product}. Factory/industrial use. Heavy duty. Reliable brand. Technical specs. HOKO pe do.",
      "We need {product}. Production line ke liye. Quality machinery with warranty. Installation required. Quote HOKO pe do.",
      "In need of {product}. Plant maintenance. Test run mandatory. Quality guarantee. Share price on HOKO.",
      "Require {product}. New setup. Efficient machinery. IE3 efficiency preferred. Complete pricing. HOKO pe do.",
      "Want {product}. Industrial requirement. Technical specifications. Test certificates. Best price. HOKO pe quote do.",
      "Looking for {product}. Manufacturing unit. Heavy duty machinery. Quote on HOKO.",
      "We need {product}. Production facility. Quality equipment. Best price on HOKO."
    ],
    "Electrical Parts": [
      "Looking for {product}. Electrical project. ISI marked products mandatory. Competitive price. HOKO pe do.",
      "We need {product}. Factory maintenance. Consistent quality essential. Bulk pricing available. HOKO pe price do.",
      "In need of {product}. Construction site. Reliable parts. Good quality. GST invoice. Price on HOKO.",
      "Require {product}. New building wiring. Multiple pieces. GST invoice mandatory. Per unit price. HOKO.",
      "Want {product}. Trial order to check quality. Technical datasheet. Share price on HOKO.",
      "Looking for {product}. Electrical work. ISI marked. Best price. Submit on HOKO.",
      "We need {product}. Wiring project. Quality parts. GST invoice. Price on HOKO."
    ],
    "Construction Materials": [
      "Looking for {product}. House/building construction. Quality materials with delivery. Certificate. HOKO pe do.",
      "We need {product}. Ongoing project. Bulk order. Site delivery mandatory. Best price. HOKO pe quote do.",
      "In need of {product}. New construction. Quality material. Site delivery. GST invoice. Price on HOKO.",
      "Require {product}. Commercial project. Reliable supplier. Consistent quality. GST mandatory. HOKO pe do.",
      "Want {product}. Building work. Quality materials. Timely delivery essential. Best price. HOKO.",
      "Looking for {product}. Construction site. Quality material. Delivery needed. Price on HOKO.",
      "We need {product}. House build. Bulk order. Best price on HOKO."
    ],
    "Services & Maintenance": [
      "Looking for {product}. Event/celebration planning. Experienced team. Budget flexible. Packages HOKO pe do.",
      "We need {product}. Office/home service. Professional service. Quality work. Best price. HOKO pe do.",
      "In need of {product}. Renovation/interior work. Creative team. Portfolio required. Quote HOKO pe do.",
      "Require {product} urgently. Professional service. Warranty preferred. Service charges. HOKO pe do.",
      "Want {product}. Regular maintenance. Experienced team. Good reviews. Best price. HOKO pe submit karo.",
      "Looking for {product}. Event planning. Experienced vendor. Budget flexible. HOKO pe do.",
      "We need {product}. Repair/maintenance. Professional. Best price. Submit on HOKO."
    ],
    "Raw Materials": [
      "Looking for {product}. Manufacturing unit. Consistent quality. Monthly orders possible. GST invoice. HOKO pe price do.",
      "We need {product}. Factory raw material. High volume. Competitive rates. Quality certificate. HOKO pe do.",
      "In need of {product}. Production requirement. Test sample required. Bulk order. Best price. HOKO.",
      "Require {product}. Regular manufacturing. Quality material. Timely delivery. GST invoice. Price on HOKO.",
      "Want {product}. Production use. Consistent quality essential. Long-term supplier interested. HOKO pe quote do.",
      "Looking for {product}. Bulk order. Industrial use. Quality material. GST invoice. HOKO pe do.",
      "We need {product}. Manufacturing. Monthly supply. Best price on HOKO."
    ],
    "Chemicals & Plastics": [
      "Looking for {product}. Plastic manufacturing. Consistent quality. BIS certified. Per kg rate. HOKO pe do.",
      "We need {product}. Industrial use. Quality material. Test sample. Delivery included. Price on HOKO.",
      "In need of {product}. Production line. Quality granules ya resin. Technical specs. Best price. HOKO.",
      "Require {product}. Manufacturing. Monthly orders. Quality consistency. GST invoice. Price do HOKO pe.",
      "Want {product}. Industrial grade. Safety data sheet. Competitive pricing. HOKO pe submit karo.",
      "Looking for {product}. Plastic industry. Consistent quality. Best price. HOKO pe do.",
      "We need {product}. Manufacturing unit. Bulk order. Quality material. Price on HOKO."
    ],
    "Packaging": [
      "Looking for {product}. Product packaging. Monthly requirement. Quality important. Bulk pricing. HOKO pe price do.",
      "We need {product}. Urgent order. Quick delivery. Good quality. Per piece ya roll price. HOKO pe do.",
      "In need of {product}. Shipping/warehousing. Consistent quality. Monthly orders. Competitive rates. HOKO.",
      "Require {product}. Manufacturing packaging. Custom printing available. Samples and price. HOKO pe do.",
      "Want {product}. Food-grade packaging. Safety compliance. Quality material. Best price. HOKO pe submit karo.",
      "Looking for {product}. Packaging material. Bulk order. Quality needed. Best price on HOKO.",
      "We need {product}. Shipping boxes ya film. Monthly order. Price on HOKO."
    ],
    "Textiles & Apparel": [
      "Looking for {product}. Retail/shop use. Good quality fabric. Per meter rate. GST invoice. HOKO pe do.",
      "We need {product}. E-commerce/business use. Bulk order. Fast delivery. Competitive price. HOKO pe do.",
      "In need of {product}. Office/school uniform. Multiple sizes. Per piece rate. Bulk pricing. HOKO pe do.",
      "Require {product}. Manufacturing use. Regular monthly orders. Quality consistency. Best price. HOKO.",
      "Want {product}. Boutique/designer use. Premium quality. Unique designs. Sample first. Price on HOKO.",
      "Looking for {product}. Fabric for clothing. Good quality. Best price. Submit on HOKO.",
      "We need {product}. Bulk order. Textile. Competitive rates. HOKO pe do."
    ],
    "Food & Agriculture": [
      "Looking for {product}. Restaurant/daily cooking. Consistent quality. FSSAI certified. Best wholesale. HOKO pe do.",
      "We need {product}. Distribution/business. Bulk order. Clean quality. FSSAI mandatory. Price on HOKO.",
      "In need of {product}. Wedding/celebration. Premium quality. Bulk order. Delivery included. HOKO pe do.",
      "Require {product}. Retail/resale. Wholesale rate. Good margin. Clean stock. Best price. HOKO.",
      "Want {product}. Hotel/catering. Daily requirement. Fresh stock. Regular supply. Price on HOKO.",
      "Looking for {product}. Food business. Bulk order. FSSAI certified. Best price on HOKO.",
      "We need {product}. Daily cooking. Quality grains. Regular supply. HOKO pe do."
    ],
    "Health & Safety": [
      "Looking for {product}. Factory/industrial. ISI marked mandatory. Bulk order. Per piece rate. HOKO pe do.",
      "We need {product}. Construction site. Safety equipment. OSHA compliant. Multiple pieces. Price on HOKO.",
      "In need of {product}. Office/workplace. Safety supplies. Quality products. Bulk pricing. HOKO pe do.",
      "Require {product}. Hospital/medical. Quality medical-grade. Certification mandatory. Catalog. HOKO pe price do.",
      "Want {product}. School/public place. Safety equipment. BIS ya ISO marked. Best price. HOKO pe do.",
      "Looking for {product}. Safety gear. Bulk order. ISI marked. Best price on HOKO.",
      "We need {product}. Factory safety. PPE items. Quality products. Price on HOKO."
    ],
    "Logistics & Transport": [
      "Looking for {product}. Material transport. Reliable service. GPS tracked. Experienced driver. Per trip. HOKO.",
      "We need {product}. House/office shifting. Professional team. Packing material. Insurance. Estimate. HOKO pe do.",
      "In need of {product}. Warehouse/storage. Industrial area. Power backup. Per sqft rate. HOKO pe do.",
      "Require {product}. Container storage. 20ft ya 40ft. CSC certified. 24/7 security. Per month. HOKO pe rate do.",
      "Want {product}. Cold storage. Perishables. Temperature controlled. Per sqft ya pallet. GST invoice. HOKO.",
      "Looking for {product}. Transport service. Reliable. GPS tracked. Best rates on HOKO.",
      "We need {product}. Storage space. Warehouse. Industrial area. HOKO pe rate do."
    ],
    "Business Services": [
      "Looking for {product}. Business growth. Experienced consultant. Track record. Budget flexible. HOKO pe approach do.",
      "We need {product}. Online presence. SEO ya marketing. Monthly retainer. Results oriented. HOKO pe do.",
      "In need of {product}. Website ya app development. Custom design. Mobile responsive. 1 year support. Quote. HOKO.",
      "Require {product}. Company registration. Legal compliance. CA ya CS services. Professional fees. HOKO pe do.",
      "Want {product}. IT services. AMC ya on-call. Network ya hardware. Monthly contract. Best rate. HOKO pe do.",
      "Looking for {product}. Professional services. Experienced team. Best approach. Submit on HOKO.",
      "We need {product}. Business support. Quality service. Best rates. HOKO pe do."
    ]
  },
  hindi: {
    "Electronics & Appliances": [
      "Looking for {product}. Ghar ke liye चाहिए - living room ya bedroom। Brand preferred। GST ke saath best price। HOKO पर do।",
      "We need {product}. Office ya business ke liye। Good brand चाहिए। Jaldi delivery। Best price share करो HOKO पर।",
      "In need of {product}. New home setup कर रहे hain। Premium quality with warranty जरूर। GST invoice mandatory। HOKO पर price do।",
      "Require {product} urgently। Old काम करना बंद कर दिया। Jaldi replacement चाहिए। Home delivery preferred। HOKO पर price do।",
      "Want {product} for studies ya work। Brand new with official warranty। Best price। HOKO पर submit करो।",
      "On the lookout for {product}. Home ya office use। Good brand। GST invoice। Share price on HOKO।",
      "We're looking for {product}. New setup। Premium quality। Warranty included। Best price on HOKO।",
      "Searching for {product}. Replacement needed। Old model not working। Home delivery। Price on HOKO।"
    ],
    "Furniture & Home": [
      "Looking for {product}. New house furnish करना hai। Living room ke liye। Quality furniture with delivery। HOKO पर do।",
      "We need {product}. Bedroom furniture। Good quality। Storage वाला preferred। Best dealer price। HOKO पर do।",
      "In need of {product}. Home decoration। Modern design। Premium finish। Photos aur price share करो HOKO पर।",
      "Require {product} for office ya home office। Good quality needed। Budget flexible। Share price on HOKO।",
      "Want {product} for rental apartment। Affordable options। Quality furniture। Share options on HOKO।",
      "Looking for {product}. Living room furnishing। Good quality। Delivery needed। Best price on HOKO।",
      "We need {product}. Bedroom setup। Storage furniture। Premium quality। Price on HOKO।"
    ],
    "Vehicles & Parts": [
      "Looking for {product}. Daily commute ke liye। Well maintained pre-owned। Best price। HOKO पर do।",
      "We need {product}. Family use ke liye। Service history mandatory। Clean vehicle। Best price। HOKO पर do।",
      "In need of {product}. Business use ke liye। Reliable vehicle। Good condition। Transfer included। Price on HOKO।",
      "Require {product}. First vehicle। Budget flexible। Safe and reliable। Best price। HOKO पर submit करो।",
      "Want {product}. Pre-owned vehicle। Low km driven। Insurance valid। Well maintained। Price on HOKO।",
      "Looking for {product}. Daily use। Well maintained। Best deal। Submit on HOKO।",
      "We need {product}. Family car। Service records। Best price on HOKO।"
    ],
    "Industrial Machinery": [
      "Looking for {product}. Factory ya industrial use। Heavy duty। Reliable brand। Technical specs। HOKO पर do।",
      "We need {product}. Production line ke liye। Quality machinery with warranty। Installation required। Quote HOKO पर do।",
      "In need of {product}. Plant maintenance। Test run mandatory। Quality guarantee। Share price on HOKO।",
      "Require {product}. New setup। Efficient machinery। IE3 efficiency preferred। Complete pricing। HOKO पर do।",
      "Want {product}. Industrial requirement। Technical specifications। Test certificates। Best price। HOKO पर quote do।",
      "Looking for {product}. Manufacturing unit। Heavy duty machinery। Quote on HOKO।",
      "We need {product}. Production facility। Quality equipment। Best price on HOKO।"
    ],
    "Electrical Parts": [
      "Looking for {product}. Electrical project। ISI marked products mandatory। Competitive price। HOKO पर do।",
      "We need {product}. Factory maintenance। Consistent quality essential। Bulk pricing available। HOKO पर price do।",
      "In need of {product}. Construction site। Reliable parts। Good quality। GST invoice। Price on HOKO।",
      "Require {product}. New building wiring। Multiple pieces। GST invoice mandatory। Per unit price। HOKO।",
      "Want {product}. Trial order to check quality। Technical datasheet। Share price on HOKO।",
      "Looking for {product}. Electrical work। ISI marked। Best price। Submit on HOKO।",
      "We need {product}. Wiring project। Quality parts। GST invoice। Price on HOKO।"
    ],
    "Construction Materials": [
      "Looking for {product}. House ya building construction। Quality materials with delivery। Certificate। HOKO पर do।",
      "We need {product}. Ongoing project। Bulk order। Site delivery mandatory। Best price। HOKO पर quote do।",
      "In need of {product}. New construction। Quality material। Site delivery। GST invoice। Price on HOKO।",
      "Require {product}. Commercial project। Reliable supplier। Consistent quality। GST mandatory। HOKO पर do।",
      "Want {product}. Building work। Quality materials। Timely delivery essential। Best price। HOKO।",
      "Looking for {product}. Construction site। Quality material। Delivery needed। Price on HOKO।",
      "We need {product}. House build। Bulk order। Best price on HOKO।"
    ],
    "Services & Maintenance": [
      "Looking for {product}. Event ya celebration planning। Experienced team। Budget flexible। Packages HOKO पर do।",
      "We need {product}. Office ya home service। Professional service। Quality work। Best price। HOKO पर do।",
      "In need of {product}. Renovation ya interior work। Creative team। Portfolio required। Quote HOKO पर do।",
      "Require {product} urgently। Professional service। Warranty preferred। Service charges। HOKO पर do।",
      "Want {product}. Regular maintenance। Experienced team। Good reviews। Best price। HOKO पर submit करो।",
      "Looking for {product}. Event planning। Experienced vendor। Budget flexible। HOKO पर do।",
      "We need {product}. Repair ya maintenance। Professional। Best price। Submit on HOKO।"
    ],
    "Raw Materials": [
      "Looking for {product}. Manufacturing unit। Consistent quality। Monthly orders possible। GST invoice। HOKO पर price do।",
      "We need {product}. Factory raw material। High volume। Competitive rates। Quality certificate। HOKO पर do।",
      "In need of {product}. Production requirement। Test sample required। Bulk order। Best price। HOKO।",
      "Require {product}. Regular manufacturing। Quality material। Timely delivery। GST invoice। Price on HOKO।",
      "Want {product}. Production use। Consistent quality essential। Long-term supplier interested। HOKO पर quote do।",
      "Looking for {product}. Bulk order। Industrial use। Quality material। GST invoice। HOKO पर do।",
      "We need {product}. Manufacturing। Monthly supply। Best price on HOKO।"
    ],
    "Chemicals & Plastics": [
      "Looking for {product}. Plastic manufacturing। Consistent quality। BIS certified। Per kg rate। HOKO पर do।",
      "We need {product}. Industrial use। Quality material। Test sample। Delivery included। Price on HOKO।",
      "In need of {product}. Production line। Quality granules ya resin। Technical specs। Best price। HOKO।",
      "Require {product}. Manufacturing। Monthly orders। Quality consistency। GST invoice। Price do HOKO pe।",
      "Want {product}. Industrial grade। Safety data sheet। Competitive pricing। HOKO pe submit करो।",
      "Looking for {product}. Plastic industry। Consistent quality। Best price। HOKO pe do।",
      "We need {product}. Manufacturing unit। Bulk order। Quality material। Price on HOKO।"
    ],
    "Packaging": [
      "Looking for {product}. Product packaging। Monthly requirement। Quality important। Bulk pricing। HOKO pe price do।",
      "We need {product}. Urgent order। Quick delivery। Good quality। Per piece ya roll price। HOKO pe do।",
      "In need of {product}. Shipping ya warehousing। Consistent quality। Monthly orders। Competitive rates। HOKO।",
      "Require {product}. Manufacturing packaging। Custom printing available। Samples and price। HOKO pe do।",
      "Want {product}. Food-grade packaging। Safety compliance। Quality material। Best price। HOKO pe submit करो।",
      "Looking for {product}. Packaging material। Bulk order। Quality needed। Best price on HOKO।",
      "We need {product}. Shipping boxes ya film। Monthly order। Price on HOKO।"
    ],
    "Textiles & Apparel": [
      "Looking for {product}. Retail ya shop use। Good quality fabric। Per meter rate। GST invoice। HOKO pe do।",
      "We need {product}. E-commerce ya business use। Bulk order। Fast delivery। Competitive price। HOKO pe do।",
      "In need of {product}. Office ya school uniform। Multiple sizes। Per piece rate। Bulk pricing। HOKO pe do।",
      "Require {product}. Manufacturing use। Regular monthly orders। Quality consistency। Best price। HOKO।",
      "Want {product}. Boutique ya designer use। Premium quality। Unique designs। Sample first। Price on HOKO।",
      "Looking for {product}. Fabric for clothing। Good quality। Best price। Submit on HOKO।",
      "We need {product}. Bulk order। Textile। Competitive rates। HOKO pe do।"
    ],
    "Food & Agriculture": [
      "Looking for {product}. Restaurant ya daily cooking। Consistent quality। FSSAI certified। Best wholesale। HOKO pe do।",
      "We need {product}. Distribution ya business। Bulk order। Clean quality। FSSAI mandatory। Price on HOKO।",
      "In need of {product}. Wedding ya celebration। Premium quality। Bulk order। Delivery included। HOKO pe do।",
      "Require {product}. Retail ya resale। Wholesale rate। Good margin। Clean stock। Best price। HOKO।",
      "Want {product}. Hotel ya catering। Daily requirement। Fresh stock। Regular supply। Price on HOKO।",
      "Looking for {product}. Food business। Bulk order। FSSAI certified। Best price on HOKO।",
      "We need {product}. Daily cooking। Quality grains। Regular supply। HOKO pe do।"
    ],
    "Health & Safety": [
      "Looking for {product}. Factory ya industrial। ISI marked mandatory। Bulk order। Per piece rate। HOKO pe do।",
      "We need {product}. Construction site। Safety equipment। OSHA compliant। Multiple pieces। Price on HOKO।",
      "In need of {product}. Office ya workplace। Safety supplies। Quality products। Bulk pricing। HOKO pe do।",
      "Require {product}. Hospital ya medical। Quality medical-grade। Certification mandatory। Catalog। HOKO pe price do।",
      "Want {product}. School ya public place। Safety equipment। BIS ya ISO marked। Best price। HOKO pe do।",
      "Looking for {product}. Safety gear। Bulk order। ISI marked। Best price on HOKO।",
      "We need {product}. Factory safety। PPE items। Quality products। Price on HOKO।"
    ],
    "Logistics & Transport": [
      "Looking for {product}. Material transport। Reliable service। GPS tracked। Experienced driver। Per trip। HOKO।",
      "We need {product}. House ya office shifting। Professional team। Packing material। Insurance। Estimate। HOKO pe do।",
      "In need of {product}. Warehouse ya storage। Industrial area। Power backup। Per sqft rate। HOKO pe do।",
      "Require {product}. Container storage। 20ft ya 40ft। CSC certified। 24/7 security। Per month। HOKO pe rate do।",
      "Want {product}. Cold storage। Perishables। Temperature controlled। Per sqft ya pallet। GST invoice। HOKO।",
      "Looking for {product}. Transport service। Reliable। GPS tracked। Best rates on HOKO।",
      "We need {product}. Storage space। Warehouse। Industrial area। HOKO pe rate do।"
    ],
    "Business Services": [
      "Looking for {product}. Business growth। Experienced consultant। Track record। Budget flexible। HOKO pe approach do।",
      "We need {product}. Online presence। SEO ya marketing। Monthly retainer। Results oriented। HOKO pe do।",
      "In need of {product}. Website ya app development। Custom design। Mobile responsive। 1 year support। Quote। HOKO।",
      "Require {product}. Company registration। Legal compliance। CA ya CS services। Professional fees। HOKO pe do।",
      "Want {product}. IT services। AMC ya on-call। Network ya hardware। Monthly contract। Best rate। HOKO pe do।",
      "Looking for {product}. Professional services। Experienced team। Best approach। Submit on HOKO।",
      "We need {product}. Business support। Quality service। Best rates। HOKO pe do।"
    ]
  }
};

const CATEGORY_GROUPS = {
  general: {
    weight: 0.50,
    categories: [
      "Electronics & Appliances",
      "Furniture & Home",
      "Vehicles & Parts"
    ]
  },
  industrial: {
    weight: 0.30,
    categories: [
      "Industrial Machinery",
      "Electrical Parts",
      "Construction Materials",
      "Raw Materials",
      "Chemicals & Plastics"
    ]
  },
  services: {
    weight: 0.15,
    categories: [
      "Logistics & Transport",
      "Business Services",
      "Services & Maintenance"
    ]
  },
  other: {
    weight: 0.05,
    categories: [
      "Food & Agriculture",
      "Health & Safety",
      "Textiles & Apparel",
      "Packaging"
    ]
  }
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
  const allCategories = Object.values(CATEGORY_GROUPS).flatMap(g => g.categories);
  return allCategories;
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
  const rand = Math.random();
  let cumulative = 0;
  let selectedGroup = "general";
  
  for (const [groupKey, group] of Object.entries(CATEGORY_GROUPS)) {
    cumulative += group.weight;
    if (rand < cumulative) {
      selectedGroup = groupKey;
      break;
    }
  }
  
  const group = CATEGORY_GROUPS[selectedGroup];
  const category = randomItem(group.categories);
  return category;
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

async function getRecentCityCategories(days = 15) {
  const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recent = await DummyRequirement.find({
    createdAt: { $gte: daysAgo }
  }).select("city category product").lean();
  return new Set(recent.map(r => `${r.city}|${r.category}|${r.product}`));
}

async function generateDummyRequirements(count = 3) {
  const citiesFallback = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata", "Ahmedabad", "Surat", "Jaipur"];
  
  const cities = await getCities();
  if (!Array.isArray(cities) || cities.length === 0) {
    cities = citiesFallback;
  }
  
  const adminCategories = await getCategories();
  const recentCombos = await getRecentCityCategories(15);
  
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
      
      let productData;
      let attempts = 0;
      let comboKey;
      
      do {
        productData = getRandomProduct(platformCategory);
        comboKey = `${city}|${productData.category}|${productData.product}`;
        attempts++;
        if (attempts > 10) break;
      } while (recentCombos.has(comboKey));
      
      if (attempts > 10 && recentCombos.has(comboKey)) {
        continue;
      }
      
      const effectiveCategory = productData.category;
      const quantity = getQuantityForProduct(productData);
      const unit = productData.unit;
      const condition = productData.condition || randomItem(["new", "used"]);
      const baseProductName = productData.brand 
        ? `${productData.brand} ${productData.model} ${productData.product}` 
        : `${productData.model} ${productData.product}`;
      
      const TITLE_PREFIXES = [
        "Looking for",
        "We need",
        "In need of",
        "Want",
        "Urgent - Need",
        "Need immediately",
        "Wanted",
        "Wanted urgently",
        "Buyer looking for",
        "Requirement for"
      ];
      const titlePrefix = randomItem(TITLE_PREFIXES);
      const productName = `${titlePrefix} ${baseProductName}`;
      const details = generateDetail(baseProductName, quantity, unit, productData.specs, effectiveCategory);
      
      try {
        const offerInvitedFrom = effectiveCategory.includes("Raw Materials") || effectiveCategory.includes("Chemicals") || effectiveCategory.includes("Industrial") || effectiveCategory.includes("Electrical") ? "anywhere" : "city";
        
        const dummy = await DummyRequirement.create({
          product: productName,
          quantity: quantity,
          unit: unit,
          city: String(city),
          category: effectiveCategory,
          isDummy: true,
          status: "new",
          details: details,
          reqType: effectiveCategory
        });
        
        const requirement = await Requirement.create({
          buyerId: dummyBuyer._id,
          city: String(city),
          category: effectiveCategory,
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
        console.log(`[DummyReq] Generated: ${city} | ${effectiveCategory} | ${productName} | Qty: ${quantity} ${unit}`);
        
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
