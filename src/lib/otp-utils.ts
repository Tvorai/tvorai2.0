import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.OTP_VERIFY_SECRET || "default_secret_for_otp_verification_123456";

export function signVerificationToken(phone: string): string {
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  const data = `${phone}:${expiresAt}`;
  const signature = createHmac("sha256", SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${signature}`).toString("base64");
}

export function verifyVerificationToken(token: string): { phone: string } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [phone, expiresAtStr, signature] = decoded.split(":");
    const expiresAt = parseInt(expiresAtStr, 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return null;
    }

    const data = `${phone}:${expiresAtStr}`;
    const expectedSignature = createHmac("sha256", SECRET).update(data).digest("hex");

    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    return { phone };
  } catch (e) {
    return null;
  }
}
