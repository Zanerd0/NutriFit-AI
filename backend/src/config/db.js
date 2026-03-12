// src/config/db.js
const dns = require("dns");
const mongoose = require("mongoose");
const env = require("./env"); // Import validated env

// Force Node.js to use Google's public DNS — fixes SRV lookup failures
// on systems where the default DNS resolver can't resolve mongodb+srv:// URIs
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const printMongoHelp = (error, mongoUri) => {
  const message = error?.message || "Unknown MongoDB connection error";

  // Atlas SRV lookups can fail on some DNS/network setups.
  if (/querySrv|ENOTFOUND|ECONNREFUSED/i.test(message) && mongoUri.startsWith("mongodb+srv://")) {
    console.error("❌ MongoDB DNS lookup failed for an SRV URI.");
    console.error("This is usually a DNS/network issue, not an app code issue.");
    console.error("Try these fixes:");
    console.error("1) In Atlas, use 'Connect > Drivers > Show all connection string options' and copy the non-SRV URI (mongodb://...).");
    console.error("2) Ensure your current network/IP is whitelisted in Atlas Network Access.");
    console.error("3) Verify DNS works in your environment (try another network/VPN off).\n");
    return;
  }

  if (/authentication failed|bad auth/i.test(message)) {
    console.error("❌ MongoDB authentication failed. Check username/password in MONGO_URI.");
    return;
  }

  console.error(`❌ MongoDB connection error: ${message}`);
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, { family: 4 });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    printMongoHelp(error, env.MONGO_URI);
    process.exit(1);
  }
};

module.exports = connectDB;