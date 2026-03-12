const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const uri = process.env.MONGO_URI;

console.log(`Attempting to connect to: ${uri}\n...`);

mongoose.connect(uri)
    .then(() => {
        console.log("✅ Connection Successful!");
        process.exit(0);
    })
    .catch(err => {
        console.log("❌ Connection Failed:");
        console.log(err.message || err);
        process.exit(1);
    });
