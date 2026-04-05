/**
 * One-time setup script: generates the single shared QR code for the wedding.
 * All guests receive the same QR � entry tracking is done per-device.
 *
 * Usage:  npm run generate
 * Output: wedding-qr.png  (print or share via WhatsApp)
 *         wedding-qr.html (preview in browser)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";

async function main() {
  const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  const SCAN_URL = `${BASE_URL}/scan`;
  const OUT_DIR = path.resolve("generated");

  // Ensure the output folder exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating QR code pointing to: ${SCAN_URL}`);

  const opts = {
    errorCorrectionLevel: "H" as const,
    width: 600,
    margin: 2,
    color: { dark: "#1a1a2e", light: "#fffdf7" },
  };

  // Save as PNG
  const pngPath = path.join(OUT_DIR, "wedding-qr.png");
  await QRCode.toFile(pngPath, SCAN_URL, { ...opts, type: "png" });

  // Save as self-contained HTML for easy browser preview / forwarding
  const dataUrl = await QRCode.toDataURL(SCAN_URL, opts);
  const htmlPath = path.join(OUT_DIR, "wedding-qr.html");
  fs.writeFileSync(
    htmlPath,
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wedding QR Code</title>
  <style>
    body { display:flex; flex-direction:column; align-items:center;
           justify-content:center; min-height:100vh; background:#fffdf7;
           font-family:sans-serif; padding:2rem; }
    img  { width:280px; height:280px; }
    p    { color:#1a1a2e; margin-top:1rem; font-size:.9rem; }
  </style>
</head>
<body>
  <img src="${dataUrl}" alt="Wedding Entry QR Code" />
  <p>Scan to enter</p>
  <p style="color:#6b7280;font-size:.75rem">${SCAN_URL}</p>
</body>
</html>`,
  );

  console.log(`\u2705  PNG  saved: ${pngPath}`);
  console.log(`\u2705  HTML saved: ${htmlPath}`);
  console.log("\nShare wedding-qr.png in your WhatsApp group.");
  console.log(
    "Every guest uses the same QR � each DEVICE can only enter once.",
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
