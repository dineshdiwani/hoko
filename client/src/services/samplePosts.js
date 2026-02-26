const DOMAIN_TEMPLATES = [
  {
    domain: "General Domestic Items",
    products: [
      ["Stainless Steel Utensil Set", "Kitchen utility set for residential use"],
      ["Ceiling Fans", "Energy-efficient fans for apartment handover"],
      ["Water Purifier Filters", "Replacement filters for household maintenance"],
      ["LED Tube Lights", "Bulk lights for residential interiors"]
    ]
  },
  {
    domain: "Industrial Items",
    products: [
      ["Industrial Safety Helmets", "Safety-compliant helmets for site teams"],
      ["Hydraulic Hose Assemblies", "High-pressure hose line replacements"],
      ["MS Fasteners", "Machine-grade fasteners for fabrication units"],
      ["Packaging Pallet Wrap", "Industrial wrapping rolls for dispatch"]
    ]
  },
  {
    domain: "Engineering Consultancy Services",
    products: [
      ["Plant Layout Consultancy", "Workflow and utility layout optimization"],
      ["Electrical Load Audit", "Demand optimization and compliance review"],
      ["Structural Safety Review", "Consultancy for retrofit and expansion"],
      ["Process Improvement Advisory", "Cycle-time and quality optimization"]
    ]
  },
  {
    domain: "Consumer Electronics",
    products: [
      ["Business Laptops", "Office deployment with warranty support"],
      ["Smart TVs", "Bulk procurement for hospitality usage"],
      ["CCTV Surveillance Kits", "Retail and warehouse monitoring setup"],
      ["Barcode Scanners", "Inventory and POS scanning devices"]
    ]
  }
];

function hashCode(input) {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function fakeBuyerName(city, index) {
  return `Buyer ${city.split(" ")[0]}-${String(index + 1).padStart(2, "0")}`;
}

function chooseCategory(categories, index) {
  const safe = Array.isArray(categories) ? categories.filter(Boolean) : [];
  if (!safe.length) return "General";
  return safe[index % safe.length];
}

export function generateSamplePostsForCity(city, categories = [], count = 50) {
  const base = hashCode(city);
  const items = [];

  for (let i = 0; i < count; i += 1) {
    const domainGroup = DOMAIN_TEMPLATES[(base + i) % DOMAIN_TEMPLATES.length];
    const variant = domainGroup.products[(base + i * 3) % domainGroup.products.length];
    const [product, baseDetail] = variant;
    const offerCount = (base + i) % 8;
    const createdAt = new Date(Date.now() - ((base + i) % 27) * 24 * 60 * 60 * 1000);
    const quantity = String(((base + i) % 90) + 10);
    const unit = domainGroup.domain.includes("Services") ? "service" : "pcs";

    items.push({
      _id: `sample-${city}-${i}`,
      isSample: true,
      buyerName: fakeBuyerName(city, i),
      city,
      category: chooseCategory(categories, i),
      productName: product,
      product,
      quantity,
      unit,
      details: `${baseDetail}. Domain: ${domainGroup.domain}.`,
      createdAt: createdAt.toISOString(),
      offerCount,
      reverseAuction: { active: false, lowestPrice: null },
      reverseAuctionActive: false,
      attachments: []
    });
  }

  return items;
}
