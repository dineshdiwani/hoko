const mongoose = require("mongoose");
const PlatformSettings = require("../models/PlatformSettings");
const {
  DEFAULT_CITIES,
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS,
  DEFAULT_CURRENCIES,
  mergeUnique
} = require("../config/platformDefaults");

const DEFAULTS = {
  cities: DEFAULT_CITIES,
  categories: DEFAULT_CATEGORIES,
  units: DEFAULT_UNITS,
  currencies: DEFAULT_CURRENCIES
};

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
