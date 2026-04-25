import api from "./api";

let optionsCache = null;
let optionsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

const DEFAULT_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune",
  "Ahmedabad", "Surat", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore",
  "Thane", "Bhopal", "Visakhapatnam", "Patna", "Vadodara", "Ghaziabad",
  "Noida", "Coimbatore", "Chandigarh", "Jodhpur", "Madurai", "Kochi"
];

const DEFAULT_CATEGORIES = [
  "Electronics & Appliances", "Furniture & Home", "Vehicles & Parts",
  "Industrial Machinery", "Electrical Parts", "Construction Materials",
  "Services & Maintenance", "Raw Materials", "Chemicals & Plastics",
  "Packaging", "Textiles & Apparel", "Food & Agriculture",
  "Health & Safety", "Logistics & Transport", "Business Services"
];

export async function fetchOptions(forceRefresh = true) {
  const now = Date.now();
  if (!forceRefresh && optionsCache && (now - optionsCacheTime) < CACHE_DURATION) {
    return optionsCache;
  }
  try {
    const res = await api.get("/meta/options");
    optionsCache = {
      cities: DEFAULT_CITIES,
      categories: DEFAULT_CATEGORIES,
      ...res.data
    };
    optionsCacheTime = now;
    return optionsCache;
  } catch (err) {
    console.warn("[fetchOptions] Failed, using defaults:", err.message);
    return {
      cities: DEFAULT_CITIES,
      categories: DEFAULT_CATEGORIES
    };
  }
}