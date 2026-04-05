import mongoose, { Document, Schema } from "mongoose";

export interface IScanRecord extends Document {
  scanNonce: string; // one-time UUID generated per page load — prevents double-admission on double-tap
  ipAddress: string;
  userAgent: string;
  admittedAt: Date;
}

const ScanRecordSchema = new Schema<IScanRecord>({
  scanNonce: {
    type: String,
    required: true,
    unique: true, // ← atomic guard: same page-load nonce can only insert once
    index: true,
  },
  ipAddress: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  admittedAt: { type: Date, default: Date.now },
});

export const ScanRecord = mongoose.model<IScanRecord>(
  "ScanRecord",
  ScanRecordSchema,
);
