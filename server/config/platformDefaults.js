const DEFAULT_TERMS_CONTENT = [
  "By using hoko, you agree to these Terms & Conditions.",
  "hoko is a marketplace platform connecting buyers and sellers. You are responsible for all negotiations, pricing, delivery, and payments.",
  "You must provide accurate information and use the platform responsibly. Impersonation, fraud, or misuse is strictly prohibited.",
  "Abusive, hateful, or harassing language is not allowed in chat or messages. Violations may result in suspension or permanent removal from the platform.",
  "Sellers must ensure their business details are truthful and buyers must post genuine requirements. Any abuse may result in account restrictions.",
  "You are responsible for complying with all applicable laws, taxes, and regulations related to your transactions.",
  "hoko may update these terms at any time. Continued use of the platform indicates acceptance of the updated terms."
].join("\n\n");

const DEFAULT_CITIES = [
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Surat",
  "Jaipur",
  "Lucknow",
  "Kanpur",
  "Nagpur",
  "Indore",
  "Thane",
  "Bhopal",
  "Visakhapatnam",
  "Patna",
  "Vadodara",
  "Ghaziabad",
  "Ludhiana",
  "Agra",
  "Nashik",
  "Faridabad",
  "Meerut",
  "Rajkot",
  "Kalyan-Dombivli",
  "Vasai-Virar",
  "Varanasi",
  "Srinagar",
  "Aurangabad",
  "Dhanbad",
  "Amritsar",
  "Navi Mumbai",
  "Allahabad",
  "Ranchi",
  "Howrah",
  "Coimbatore",
  "Jabalpur",
  "Gwalior",
  "Vijayawada",
  "Jodhpur",
  "Madurai",
  "Raipur",
  "Kota",
  "Guwahati",
  "Chandigarh",
  "Solapur",
  "Hubli-Dharwad",
  "Mysore",
  "Tiruchirappalli",
  "Bareilly",
  "Aligarh",
  "Tiruppur",
  "Moradabad",
  "Jalandhar",
  "Bhubaneswar",
  "Salem",
  "Warangal",
  "Guntur",
  "Bhiwandi",
  "Saharanpur",
  "Gorakhpur",
  "Bikaner",
  "Amravati",
  "Noida",
  "Jamshedpur",
  "Bhilai",
  "Cuttack",
  "Firozabad",
  "Kochi",
  "Nellore",
  "Bhavnagar",
  "Dehradun",
  "Durgapur",
  "Asansol",
  "Rourkela",
  "Nanded",
  "Kolhapur",
  "Ajmer",
  "Akola",
  "Gulbarga",
  "Jamnagar",
  "Ujjain",
  "Loni",
  "Siliguri",
  "Jhansi",
  "Ulhasnagar",
  "Jammu",
  "Sangli-Miraj",
  "Mangalore",
  "Erode",
  "Belgaum",
  "Ambattur",
  "Tirunelveli",
  "Malegaon",
  "Gaya",
  "Udaipur",
  "Kakinada",
  "Davanagere"
];

const DEFAULT_CATEGORIES = [
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
];

const DEFAULT_UNITS = ["pcs", "kg", "litre", "service"];
const DEFAULT_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"];

const DEFAULT_NOTIFICATIONS = {
  enabled: true,
  cities: [],
  categories: []
};
const DEFAULT_WHATSAPP_CAMPAIGN = {
  enabled: false,
  cities: [],
  categories: []
};
const DEFAULT_EMAIL_NOTIFICATIONS = {
  enabled: false,
  adminCopy: true,
  events: {
    newOfferToBuyer: true,
    requirementUpdatedToSellers: true,
    reverseAuctionToSellers: true
  }
};

const DEFAULT_MODERATION_RULES = {
  enabled: true,
  keywords: ["whatsapp", "call me", "direct deal"],
  blockPhone: true,
  blockLinks: true
};

const DEFAULT_SELECTIONS = {
  city: "user_default",
  category: "user_default"
};

function mergeUnique(existing = [], defaults = []) {
  const set = new Set([...(Array.isArray(existing) ? existing : []), ...defaults]);
  return Array.from(set);
}

function pickValid(options, value, fallback = "") {
  const target = String(value || "").trim();
  if (!target) return String(fallback || "");
  const match = (Array.isArray(options) ? options : []).find(
    (item) => String(item || "").trim().toLowerCase() === target.toLowerCase()
  );
  return match || String(fallback || "");
}

function sanitizeSelections(rawSelections, merged) {
  const source = rawSelections || {};
  const cityMode = String(source.city || "").trim().toLowerCase();
  const categoryMode = String(source.category || "").trim().toLowerCase();
  return {
    city:
      cityMode === "all" || cityMode === "user_default"
        ? cityMode
        : "user_default",
    category:
      categoryMode === "all" || categoryMode === "user_default"
        ? categoryMode
        : "user_default"
  };
}

function buildOptionsResponse(doc) {
  const raw = doc ? (typeof doc.toObject === "function" ? doc.toObject() : doc) : null;
  const merged = {
    cities: mergeUnique(raw?.cities, DEFAULT_CITIES),
    categories: mergeUnique(raw?.categories, DEFAULT_CATEGORIES),
    units: mergeUnique(raw?.units, DEFAULT_UNITS),
    currencies: mergeUnique(raw?.currencies, DEFAULT_CURRENCIES)
  };

  return {
    ...(raw || {}),
    cities: merged.cities,
    categories: merged.categories,
    units: merged.units,
    currencies: merged.currencies,
    defaults: sanitizeSelections(raw?.defaults || DEFAULT_SELECTIONS, merged),
    notifications: raw?.notifications || DEFAULT_NOTIFICATIONS,
    emailNotifications: {
      ...DEFAULT_EMAIL_NOTIFICATIONS,
      ...(raw?.emailNotifications || {}),
      events: {
        ...DEFAULT_EMAIL_NOTIFICATIONS.events,
        ...(raw?.emailNotifications?.events || {})
      }
    },
    whatsAppCampaign: raw?.whatsAppCampaign || DEFAULT_WHATSAPP_CAMPAIGN,
    moderationRules: raw?.moderationRules || DEFAULT_MODERATION_RULES,
    termsAndConditions: raw?.termsAndConditions || {
      content: DEFAULT_TERMS_CONTENT
    }
  };
}

module.exports = {
  DEFAULT_TERMS_CONTENT,
  DEFAULT_CITIES,
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS,
  DEFAULT_CURRENCIES,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_EMAIL_NOTIFICATIONS,
  DEFAULT_WHATSAPP_CAMPAIGN,
  DEFAULT_MODERATION_RULES,
  DEFAULT_SELECTIONS,
  mergeUnique,
  buildOptionsResponse
};
