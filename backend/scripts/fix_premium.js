/**
 * fix_premium.js
 * One-off script to manually set isPremium = true for a consumer
 * whose Stripe payment succeeded but webhook failed to fire.
 *
 * Usage:
 *   node scripts/fix_premium.js <email>
 *
 * Example:
 *   node scripts/fix_premium.js user@example.com
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const User     = require("../src/models/User");

const email = process.argv[2];

if (!email) {
  console.error("❌  Usage: node scripts/fix_premium.js <email>");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅  Connected to MongoDB");

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          isPremium:          true,
          subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true, select: "full_name email isPremium subscriptionExpiry" }
    );

    if (!user) {
      console.error(`❌  No user found with email: ${email}`);
    } else {
      console.log(`✅  Updated successfully:`);
      console.log(`    Name:    ${user.full_name}`);
      console.log(`    Email:   ${user.email}`);
      console.log(`    Premium: ${user.isPremium}`);
      console.log(`    Expiry:  ${user.subscriptionExpiry}`);
    }
  } catch (err) {
    console.error("❌  Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌  Disconnected from MongoDB");
  }
})();
