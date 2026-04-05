/**
 * Database connection — currently a no-op while using filesystem storage.
 * TO RESTORE MONGODB: uncomment the mongoose block below and remove the stub.
 */

// import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  // ── Filesystem mode ──────────────────────────────────────────
  // No connection needed. Data is stored in data/scans.json.
  console.log("✅ Using filesystem storage (data/scans.json)");

  // ── MongoDB mode (restore when ready) ────────────────────────
  // const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/wedding_qr";
  // try {
  //   await mongoose.connect(uri);
  //   console.log("✅ MongoDB connected:", mongoose.connection.host);
  //   mongoose.connection.on("error", (err) => console.error("❌ MongoDB error:", err));
  //   mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
  // } catch (error) {
  //   console.error("❌ Failed to connect to MongoDB:", error);
  //   process.exit(1);
  // }
}
