import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";

export interface QRPayload {
  ticketId: string;
  deviceKey: string;
  ts: number; // issued timestamp (unix ms)
}

/** Generate a unique ticket ID in format: wedding-<shortUUID> */
export function generateTicketId(): string {
  const short = uuidv4().replace(/-/g, "").substring(0, 12).toUpperCase();
  return `wedding-${short}`;
}

/**
 * Generate a device-bound key embedded in the QR.
 * Allows detecting if someone screenshots the QR and tries to reuse it
 * from a different device (soft-check — see controller).
 */
export function generateDeviceKey(): string {
  return uuidv4().replace(/-/g, "").substring(0, 16).toUpperCase();
}

/** Build the scan URL embedded inside the QR code. */
export function buildScanUrl(
  baseUrl: string,
  ticketId: string,
  deviceKey: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({ ticketId, deviceKey, ts: Date.now() }),
  ).toString("base64url");
  return `${baseUrl}/api/tickets/scan?t=${payload}`;
}

/** Decode the scan URL token back into QRPayload. */
export function decodeScanToken(token: string): QRPayload {
  try {
    const json = Buffer.from(token, "base64url").toString("utf-8");
    return JSON.parse(json) as QRPayload;
  } catch {
    throw new Error("Invalid or tampered QR token");
  }
}

export interface GenerateQROptions {
  baseUrl: string;
  ticketId: string;
  deviceKey: string;
  guestName: string;
  weddingName?: string;
  weddingDate?: string;
}

/** Generate a QR Code as a base64 PNG data URL (embeddable in <img> or shareable via WhatsApp). */
export async function generateQRDataUrl(
  options: GenerateQROptions,
): Promise<string> {
  const { baseUrl, ticketId, deviceKey } = options;
  const scanUrl = buildScanUrl(baseUrl, ticketId, deviceKey);

  return QRCode.toDataURL(scanUrl, {
    errorCorrectionLevel: "H",
    type: "image/png",
    width: 400,
    margin: 2,
    color: {
      dark: "#1a1a2e", // deep navy
      light: "#fffdf7", // warm white
    },
  });
}

/** Generate QR Code as SVG string (useful for server-side rendering / printing). */
export async function generateQRSvg(
  options: GenerateQROptions,
): Promise<string> {
  const { baseUrl, ticketId, deviceKey } = options;
  const scanUrl = buildScanUrl(baseUrl, ticketId, deviceKey);

  return QRCode.toString(scanUrl, {
    type: "svg",
    errorCorrectionLevel: "H",
    width: 400,
    margin: 2,
  });
}
