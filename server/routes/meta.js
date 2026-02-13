const express = require("express");
const PlatformSettings = require("../models/PlatformSettings");

const router = express.Router();

const DEFAULT_TERMS_CONTENT = [
  "By using hoko, you agree to these Terms & Conditions.",
  "hoko is a marketplace platform connecting buyers and sellers. You are responsible for all negotiations, pricing, delivery, and payments.",
  "You must provide accurate information and use the platform responsibly. Impersonation, fraud, or misuse is strictly prohibited.",
  "Abusive, hateful, or harassing language is not allowed in chat or messages. Violations may result in suspension or permanent removal from the platform.",
  "Sellers must ensure their business details are truthful and buyers must post genuine requirements. Any abuse may result in account restrictions.",
  "You are responsible for complying with all applicable laws, taxes, and regulations related to your transactions.",
  "hoko may update these terms at any time. Continued use of the platform indicates acceptance of the updated terms."
].join("\n\n");

router.get("/options", async (req, res) => {
  const doc = await PlatformSettings.findOne();
  res.json(
    doc || {
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
      currencies: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"],
      termsAndConditions: {
        content: DEFAULT_TERMS_CONTENT
      }
    }
  );
});

module.exports = router;
