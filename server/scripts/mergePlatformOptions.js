const mongoose = require("mongoose");
const PlatformSettings = require("../models/PlatformSettings");

const DEFAULTS = {
  cities: ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune"],
  categories: [
    "Agriculture & Food Products",
    "Raw Materials (metals, minerals, chemicals)",
    "Consumer Electronics",
    "Electrical & Electronic Components",
    "Machinery & Industrial Equipment",
    "Automotive Parts & Vehicles",
    "Construction Materials & Tools",
    "Furniture & Home Furnishings",
    "Textiles, Apparel & Footwear",
    "Fashion Accessories & Jewelry",
    "Health, Medical & Pharmaceutical Products",
    "Beauty & Personal Care Products",
    "Household Goods & Appliances",
    "Packaging Materials",
    "Office Supplies & Stationery",
    "Sports, Leisure & Toys",
    "Gifts, Handicrafts & Promotional Items",
    "Energy, Power & Fuels",
    "Chemicals & Plastics",
    "Environmental & Recycling Products",
    "Manufacturing & Contract Production",
    "Trading, Import & Export Services",
    "Logistics, Transportation & Warehousing",
    "Installation, Maintenance & Repair",
    "Construction & Engineering Services",
    "IT Services & Software Development",
    "Digital Services (marketing, design, data)",
    "Financial & Accounting Services",
    "Legal & Compliance Services",
    "Consulting & Business Advisory",
    "Human Resources & Recruitment",
    "Education & Training",
    "Healthcare & Medical Services",
    "Marketing, Advertising & Media",
    "Research & Development (R&D)",
    "Quality Inspection & Testing",
    "Security & Facility Management",
    "Travel, Hospitality & Event Services",
    "Outsourcing & BPO Services",
    "Environmental, Safety & Sustainability Services"
  ],
  units: ["pcs", "kg", "litre", "service"],
  currencies: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"]
};

function mergeUnique(existing, defaults) {
  const set = new Set([...(existing || []), ...(defaults || [])]);
  return Array.from(set);
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("Missing MONGO_URI");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    family: 4
  });

  const current = await PlatformSettings.findOne();
  const merged = {
    cities: mergeUnique(current?.cities, DEFAULTS.cities),
    categories: mergeUnique(current?.categories, DEFAULTS.categories),
    units: mergeUnique(current?.units, DEFAULTS.units),
    currencies: mergeUnique(current?.currencies, DEFAULTS.currencies)
  };

  await PlatformSettings.findOneAndUpdate({}, merged, {
    upsert: true,
    new: true
  });

  console.log("Platform options merged");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
