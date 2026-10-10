import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { findFallbackUser, setFallbackOtp } from "@/lib/fallbackAuth";
import { sendOtpEmail } from "@/lib/email";

// ─── POST /api/auth/forgot-password ─────────────────────────
// Generates a 6-digit numeric OTP, stores it with expiration,
// and dispatches it directly to the user's Gmail inbox.
// The code is strictly NEVER returned in the API response.
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const normEmail = email.trim().toLowerCase();

    // 1. Generate 6-digit secure numeric verification code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let userFound = false;

    // 2. Update MongoDB Atlas in-place with OTP
    try {
      const db = await getDb();
      if (db) {
        const usersCollection = db.collection("users");
        const existingUser = await usersCollection.findOne({ email: normEmail });

        if (existingUser) {
          userFound = true;
          await usersCollection.updateOne(
            { email: normEmail },
            {
              $set: {
                resetOtp: otp,
                resetOtpExpires: expiryDate,
                updatedAt: new Date(),
              },
            }
          );
        }
      }
    } catch (dbErr: any) {
      console.warn("MongoDB forgot-password notice:", dbErr.message);
    }

    // 3. Fallback Auth Store resilience
    if (!userFound) {
      const fallbackUser = await findFallbackUser(normEmail);
      if (fallbackUser) {
        userFound = true;
      }
    }

    await setFallbackOtp(normEmail, otp);

    if (!userFound) {
      return NextResponse.json(
        { error: "No account found with this email. Please check the spelling or create an account." },
        { status: 404 }
      );
    }

    // 4. Dispatch verification code directly to user's Gmail
    await sendOtpEmail({ to: normEmail, otp });

    // Server-side audit log only (never exposed to client)
    console.log(`🔐 [Nexia Security] OTP dispatched to Gmail for ${normEmail}. (Expires in 10 mins)`);

    // 5. Return success notice WITHOUT exposing the code to the frontend
    return NextResponse.json(
      {
        success: true,
        message: `A 6-digit verification code has been dispatched to ${normEmail}. Please check your Gmail inbox (or spam folder).`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Forgot-password route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process password recovery request." },
      { status: 500 }
    );
  }
}
