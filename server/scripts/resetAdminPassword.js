const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const Admin = require("../models/Admin");

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

function getArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

async function run() {
  const email = String(getArg("email") || "").trim().toLowerCase();
  const password = String(getArg("password") || "");
  const role = String(getArg("role") || "admin").trim();

  if (!email) {
    throw new Error("Missing --email");
  }
  if (!password || password.length < 8) {
    throw new Error("Missing/invalid --password (minimum 8 chars)");
  }
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    family: 4
  });

  let admin = await Admin.findOne({ email });
  if (!admin) {
    admin = await Admin.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      active: true,
      failedLoginCount: 0,
      lockUntil: null
    });
    console.log(`Created admin: ${admin.email}`);
  } else {
    admin.passwordHash = await bcrypt.hash(password, 10);
    admin.password = "";
    admin.active = true;
    admin.failedLoginCount = 0;
    admin.lockUntil = null;
    if (role) admin.role = role;
    await admin.save();
    console.log(`Updated admin: ${admin.email}`);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
