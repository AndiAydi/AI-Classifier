/**
 * MongoDB connection via Mongoose
 */
const mongoose = require("mongoose");
const config = require("./env");

mongoose.set("strictQuery", true);

async function connect() {
  try {
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✓ MongoDB connected → ${maskUri(config.mongodb.uri)}`);
  } catch (err) {
    console.error("✗ MongoDB connection failed:", err.message);
    console.error("  Tip: jalankan `docker compose up -d` dulu untuk start MongoDB.");
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠ MongoDB disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("✓ MongoDB reconnected");
  });
}

function maskUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect, mongoose };
