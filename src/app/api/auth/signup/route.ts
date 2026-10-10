import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { findFallbackUser, createFallbackUser } from "@/lib/fallbackAuth";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ─── POST /api/auth/signup ───────────────────────────────
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
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }
    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
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
        const existingUser = await usersCollection.findOne({ email: normEmail });
        
        if (existingUser) {
          return NextResponse.json(
            { error: "An account with this email already exists." },
            { status: 409 }
          );
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const result = await usersCollection.insertOne({
          email: normEmail,
          password: hashedPassword,
          displayName: normEmail.split("@")[0],
          createdAt: new Date(),
        });

        // Also save to fallback store for offline safety
        await createFallbackUser(normEmail, password, normEmail.split("@")[0]);

        const token = jwt.sign(
          {
            userId: result.insertedId.toString(),
            email: normEmail,
          },
          jwtSecret,
          { expiresIn: "7d" }
        );

        return NextResponse.json({
          success: true,
          token,
          user: {
            id: result.insertedId.toString(),
            email: normEmail,
            displayName: normEmail.split("@")[0],
          },
        });
      }
    } catch (dbErr: any) {
      console.warn("MongoDB signup error, falling back to resilient local store:", dbErr.message);
    }

    // ── 2. Resilient Fallback Auth ───────────────────────
    const existingFallback = await findFallbackUser(normEmail);
    if (existingFallback) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const newUser = await createFallbackUser(normEmail, password, normEmail.split("@")[0]);

    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
      },
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Unable to create account. Please check your details and try again." },
      { status: 400 }
    );
  }
}
