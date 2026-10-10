import nodemailer from "nodemailer";

interface SendOtpEmailParams {
  to: string;
  otp: string;
}

/**
 * Enterprise Email Dispatcher for Nexia Security.
 * Dispatches verification OTPs via direct Gmail SMTP or n8n Webhook.
 * Guarantees zero OTP exposure to the client-side frontend.
 */
export async function sendOtpEmail({ to, otp }: SendOtpEmailParams): Promise<{ sent: boolean; method: string; error?: string }> {
  const normTo = to.trim().toLowerCase();
  let dispatched = false;
  let methodUsed = "none";

  // 1. Method A: Direct SMTP via Nodemailer (if credentials configured in .env.local)
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  if (gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      await transporter.sendMail({
        from: `"Nexia Security" <${gmailUser}>`,
        to: normTo,
        subject: "Nexia Security: Your 6-Digit Password Recovery Code",
        text: `Your Nexia security verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background-color: #0B0F17; color: #FFFFFF; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #FFFFFF; margin: 0; font-size: 20px;">Nexia Security Gate</h2>
              <p style="color: #94A3B8; font-size: 13px; margin-top: 4px;">Password Recovery Request</p>
            </div>
            <p style="color: #E2E8F0; font-size: 14px; line-height: 1.6;">Hello,</p>
            <p style="color: #94A3B8; font-size: 14px; line-height: 1.6;">We received a request to reset your password for your Nexia workspace (<strong>${normTo}</strong>). Enter the verification code below to proceed:</p>
            <div style="background: rgba(94, 106, 210, 0.15); border: 1px solid rgba(94, 106, 210, 0.4); border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #818CF8; font-family: monospace;">${otp}</span>
            </div>
            <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 0;">This security code will expire in 10 minutes. If you did not make this request, you can safely ignore this email.</p>
          </div>
        `,
      });

      console.log(`📧 [Nexia Mailer] OTP successfully dispatched to ${normTo} via Gmail SMTP.`);
      return { sent: true, method: "smtp" };
    } catch (smtpErr: any) {
      console.warn("Direct SMTP notice:", smtpErr.message);
    }
  }

  // 2. Method B: n8n Webhook Dispatch (Active workflow)
  const webhookUrl = process.env.N8N_EMAIL_WEBHOOK;
  if (webhookUrl && webhookUrl.startsWith("http") && !webhookUrl.includes("placeholder.com")) {
    try {
      const emailPayload = {
        to: normTo,
        recipient: normTo,
        email: normTo,
        subject: "Nexia Security: Your 6-Digit Password Recovery Code",
        body: `Your Nexia security verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.\n\n--\nNexia Security Team • Executive Platform`,
        message: `Your Nexia security verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.\n\n--\nNexia Security Team • Executive Platform`,
        text: `Your Nexia security verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.\n\n--\nNexia Security Team • Executive Platform`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background-color: #0B0F17; color: #FFFFFF; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #FFFFFF; margin: 0; font-size: 20px;">Nexia Security Gate</h2>
              <p style="color: #94A3B8; font-size: 13px; margin-top: 4px;">Password Recovery Request</p>
            </div>
            <p style="color: #E2E8F0; font-size: 14px; line-height: 1.6;">Hello,</p>
            <p style="color: #94A3B8; font-size: 14px; line-height: 1.6;">We received a request to reset your password for your Nexia workspace (<strong>${normTo}</strong>). Enter the verification code below to proceed:</p>
            <div style="background: rgba(94, 106, 210, 0.15); border: 1px solid rgba(94, 106, 210, 0.4); border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #818CF8; font-family: monospace;">${otp}</span>
            </div>
            <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 0;">This security code will expire in 10 minutes. If you did not make this request, you can safely ignore this email.</p>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center; color: #64748B; font-size: 11px;">
              Nexia Platform • Enterprise Security Gate
            </div>
          </div>
        `,
        otp,
        action: "send",
        type: "password_reset",
        appendAttribution: false,
        options: {
          appendAttribution: false,
        },
        timestamp: new Date().toISOString(),
      };

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailPayload),
      });

      if (res.ok) {
        dispatched = true;
        methodUsed = "n8n_webhook";
        console.log(`📧 [Nexia Mailer] OTP dispatched to ${normTo} via n8n email webhook.`);
      } else {
        console.warn(`[Nexia Mailer] Webhook returned status ${res.status}`);
      }
    } catch (webhookErr: any) {
      console.warn("Webhook email dispatch notice:", webhookErr.message);
    }
  }

  return { sent: dispatched, method: methodUsed };
}
