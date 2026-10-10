import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { formatUserName } from "@/lib/utils";
import { findFallbackUser } from "@/lib/fallbackAuth";

// ─── GET /api/auth/me ────────────────────────────────────
// Verifies JWT token and restores session
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No token provided." },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET || "omni-agent-secret-key-change-in-production-2026";

    // ── Verify token ───────────────────────────────────
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    // Invalidate any spurious test tokens (e.g., legacy nuthi)
    if (decoded?.email && decoded.email.toLowerCase().includes('nuthi')) {
      try {
        const db = await getDb();
        if (db) {
          await db.collection("users").deleteMany({ email: { $regex: /nuthi/i } });
        }
      } catch {}
      return NextResponse.json(
        { error: "Test session revoked. Please sign in with your account." },
        { status: 401 }
      );
    }

    // ── 1. Try MongoDB Atlas ───────────────────────────
    try {
      const db = await getDb();
      if (db) {
        const { ObjectId } = await import("mongodb");
        if (ObjectId.isValid(decoded.userId)) {
          const user = await db
            .collection("users")
            .findOne(
              { _id: new ObjectId(decoded.userId) },
              { projection: { password: 0 } }
            );

          if (user) {
            return NextResponse.json({
              user: {
                id: user._id.toString(),
                email: user.email,
                displayName: formatUserName(user.displayName, user.email),
                createdAt: user.createdAt || new Date(),
              },
            });
          }
        }
      }
    } catch (dbErr: any) {
      console.warn("MongoDB fetch in /api/auth/me bypassed:", dbErr.message);
    }

    // ── 2. Check local fallback auth store ─────────────
    const fallbackUser = await findFallbackUser(decoded.email);
    if (fallbackUser) {
      return NextResponse.json({
        user: {
          id: fallbackUser.id,
          email: fallbackUser.email,
          displayName: formatUserName(fallbackUser.displayName, fallbackUser.email),
          createdAt: fallbackUser.createdAt,
        },
      });
    }

    // Unrecognized or deleted session
    return NextResponse.json(
      { error: "Session expired or user not recognized. Please sign in." },
      { status: 401 }
    );
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      { error: "Invalid or expired token." },
      { status: 401 }
    );
  }
}
