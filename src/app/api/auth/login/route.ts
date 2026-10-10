import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyFallbackPassword } from "@/lib/fallbackAuth";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { formatUserName } from "@/lib/utils";

// ─── POST /api/auth/login ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    // ── Validation ─────────────────────────────────────
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const normEmail = String(email).trim().toLowerCase();
    const jwtSecret = process.env.JWT_SECRET || "omni-agent-secret-key-change-in-production-2026";

    // ── 1. Try MongoDB Atlas First ─────────────────────
    try {
      const db = await getDb();
      if (db) {
        const usersCollection = db.collection("users");
        const user = await usersCollection.findOne({ email: normEmail });
        
        if (user) {
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return NextResponse.json(
              { error: "Incorrect password. Please try again." },
              { status: 401 }
            );
          }

          const token = jwt.sign(
            {
              userId: user._id.toString(),
              email: user.email,
            },
            jwtSecret,
            { expiresIn: "7d" }
          );

          return NextResponse.json({
            success: true,
            token,
            user: {
              id: user._id.toString(),
              email: user.email,
              displayName: formatUserName(user.displayName, user.email),
            },
          });
        }
      }
    } catch (dbErr: any) {
      console.warn("MongoDB query error during login, proceeding to fallback:", dbErr.message);
    }

    // ── 2. Resilient Fallback Auth (Zero-Downtime) ───────
    const { valid, user } = await verifyFallbackPassword(normEmail, password);

    if (valid && user) {
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
        },
        jwtSecret,
        { expiresIn: "7d" }
      );

      return NextResponse.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: formatUserName(user.displayName, user.email),
        },
      });
    }

    if (user && !valid) {
      return NextResponse.json(
        { error: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "No account found with this email. Click 'Create an account' below to sign up." },
      { status: 401 }
    );
  } catch (error: any) {
    console.error("Login route error:", error);
    return NextResponse.json(
      { error: "Unable to process login. Please try again or create an account." },
      { status: 400 }
    );
  }
}
