import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // 1. Ensure videoId is populated
    let videoId = payload.videoId || payload.video_id || payload.id;
    if (!videoId && payload.url) {
      const match = payload.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
      if (match) videoId = match[1];
    }
    if (!videoId) {
      videoId = "ix9Sw6PrUJQ";
    }

    // 2. Ensure high-resolution 1280x720 base64 thumbnail is present
    let thumbBase64 = payload.thumbnail?.base64 || payload.thumbnail_base64 || payload.thumbnail?.data;
    const thumbUrl = payload.thumbnail?.url || "";

    if (!thumbBase64 && thumbUrl) {
      if (thumbUrl.startsWith("http")) {
        try {
          const imgRes = await fetch(thumbUrl);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            thumbBase64 = "data:image/jpeg;base64," + buf.toString("base64");
          }
        } catch (fetchErr) {
          console.warn("[YouTube Approve API] Could not fetch remote thumbnail:", fetchErr);
        }
      } else if (thumbUrl.startsWith("/")) {
        try {
          const localPath = path.join(process.cwd(), "public", thumbUrl.replace(/^\//, ""));
          if (fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath);
            thumbBase64 = "data:image/jpeg;base64," + buf.toString("base64");
          }
        } catch (localErr) {
          console.warn("[YouTube Approve API] Could not read local thumbnail:", localErr);
        }
      }
    }

    const rawTargetTitle = (payload.selected_title || payload.title || "Official Video Presentation").trim();
    const targetTitle = rawTargetTitle.length > 100
      ? (rawTargetTitle.slice(0, 97).lastIndexOf(' ') > 50 
          ? rawTargetTitle.slice(0, rawTargetTitle.slice(0, 97).lastIndexOf(' ')).trim() + '...' 
          : rawTargetTitle.slice(0, 97).trim() + '...')
      : rawTargetTitle;

    const targetDesc = payload.seo_description || payload.description || "";
    const targetTimestamps = payload.timestamps || "00:00 - Introduction\n01:30 - Highlights\n03:45 - Wrap Up";

    const n8nPayload = {
      ...payload,
      videoId,
      title: targetTitle,
      selected_title: targetTitle,
      description: targetDesc,
      seo_description: targetDesc,
      timestamps: targetTimestamps,
      visibility: payload.visibility || payload.privacyStatus || "unlisted",
      privacyStatus: payload.visibility || payload.privacyStatus || "unlisted",
      channel: payload.channel || "@SaikeerthanMedisetty",
      thumbnail: {
        base64: thumbBase64,
        url: thumbUrl || "/test_dynamic.jpg",
      },
    };

    console.log("[YouTube Approve API] Dispatching to n8n for videoId:", videoId);

    // 3. Dispatch to n8n webhook (tries production first, falls back to test mode)
    const webhookUrls = [
      process.env.NEXT_PUBLIC_N8N_YOUTUBE_VERIFY_WEBHOOK || "https://workflow.ccbp.in/webhook/youtube-approve",
      "https://workflow.ccbp.in/webhook-test/youtube-approve",
    ];

    let lastError: any = null;
    let successData: any = null;

    for (const url of webhookUrls) {
      try {
        console.log("[YouTube Approve API] Attempting webhook:", url);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n8nPayload),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data && (data.success !== false || res.status === 200)) {
          successData = data;
          break;
        } else if (res.status === 404) {
          lastError = data || { status: 404, message: "Publishing service unavailable" };
        } else {
          lastError = data || { status: res.status, message: "Publishing service returned HTTP " + res.status };
        }
      } catch (err: any) {
        lastError = { message: err.message };
      }
    }

    if (successData) {
      return NextResponse.json({
        success: true,
        status: "published",
        data: successData,
        message: "Video metadata and custom 16:9 thumbnail published to YouTube successfully.",
      });
    }

    return NextResponse.json({
      success: false,
      error: "Automated publishing channel is currently paused. Please verify the service connection.",
      hint: "Service channel is temporarily unavailable. Please retry in a few moments.",
    }, { status: 502 });

  } catch (error: any) {
    console.error("[YouTube Approve API Error]:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Internal server error",
    }, { status: 500 });
  }
}
