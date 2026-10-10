import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  findFallbackUser,
  verifyFallbackOtp,
  updateFallbackPassword,
  clearFallbackOtp,
} from "@/lib/fallbackAuth";
import bcrypt from "bcryptjs";

// ─── POST /api/auth/reset-password ─────────────────────────
// Zero-Waste Password Reset: Replaces old password in-place
// and removes temporary OTP fields so zero extra DB space is consumed.
export async function POST(req: NextRequest) {
  try {
    const { email, otp, newPassword } = await req.json();

    // 1. Validate inputs
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email address is required." },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== "string" || otp.trim().length !== 6) {
      return NextResponse.json(
        { error: "Please provide a valid 6-digit verification code." },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const normEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    let updatedInMongo = false;
    let updatedInFallback = false;

    // 2. Process MongoDB Atlas First
    try {
      const db = await getDb();
      if (db) {
        const usersCollection = db.collection("users");
        const existingUser = await usersCollection.findOne({ email: normEmail });

        if (existingUser) {
          // Verify OTP match and expiration
          const storedOtp = existingUser.resetOtp;
          const expiresAt = existingUser.resetOtpExpires ? new Date(existingUser.resetOtpExpires) : null;
          const now = new Date();

          if (!storedOtp || storedOtp !== cleanOtp) {
            // Check if fallback OTP matches (resilience)
            const fallbackValid = await verifyFallbackOtp(normEmail, cleanOtp);
            if (!fallbackValid) {
              return NextResponse.json(
                { error: "Invalid verification code. Please check and try again." },
                { status: 400 }
              );
            }
          } else if (expiresAt && now > expiresAt) {
            return NextResponse.json(
              { error: "Verification code has expired. Please request a new code." },
              { status: 400 }
            );
          }

          // Zero-Waste In-Place Update:
          // $set overwrites the password string in-place
          // $unset strips resetOtp and resetOtpExpires so no redundant space is kept
          const hashedPassword = await bcrypt.hash(newPassword, 12);
          await usersCollection.updateOne(
            { email: normEmail },
            {
              $set: {
                password: hashedPassword,
                updatedAt: new Date(),
              },
              $unset: {
                resetOtp: "",
                resetOtpExpires: "",
              },
            }
          );
          updatedInMongo = true;
        }
      }
    } catch (dbErr: any) {
      console.warn("MongoDB reset-password notice:", dbErr.message);
    }

    // 3. Fallback Auth Store (Zero-Downtime Resilience)
    const fallbackOtpValid = await verifyFallbackOtp(normEmail, cleanOtp);
    const fallbackUser = await findFallbackUser(normEmail);

    if (fallbackOtpValid || updatedInMongo || fallbackUser) {
      // Sync or update fallback cache
      await updateFallbackPassword(normEmail, newPassword);
      await clearFallbackOtp(normEmail);
      updatedInFallback = true;
    }

    if (!updatedInMongo && !updatedInFallback) {
      return NextResponse.json(
        { error: "Invalid or expired verification code. Please request a new code." },
        { status: 400 }
      );
    }

    console.log(`✅ [Nexia Security] Password updated in-place for ${normEmail} (0 residual bytes).`);

    return NextResponse.json(
      {
        success: true,
        message: "Password updated successfully! You can now sign in with your new password.",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Reset-password route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }
}
