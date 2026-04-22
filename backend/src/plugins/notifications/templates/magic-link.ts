/**
 * Magic-link email template.
 *
 * Keep the copy boring and skimmable — dispatchers open this from their phone
 * at 6am and need to tap-through in <2 seconds.
 */

import { renderEmailLayout, escapeHtml } from "./layout.js";

export interface MagicLinkEmailOpts {
  name: string | null;
  link: string;
  expiresInMinutes: number;
}

export function renderMagicLinkEmail(opts: MagicLinkEmailOpts): {
  subject: string;
  html: string;
} {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  const safeLink = escapeHtml(opts.link);

  const content = `
    <p style="margin:0 0 20px;">${greeting}</p>
    <p style="margin:0 0 24px;">Tap the button below to sign in to ES Express. This link expires in <strong>${opts.expiresInMinutes} minutes</strong> and can only be used once.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
      <tr>
        <td style="background:#ff6b2c;border-radius:8px;">
          <a href="${safeLink}" style="display:inline-block;padding:14px 28px;color:#0a0c0f;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:0.02em;">
            Sign in to ES Express
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">If the button doesn't work, copy this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;color:#64748b;word-break:break-all;">${safeLink}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">If you didn't request this, you can safely ignore this email — no one can sign in without the link.</p>
  `;

  return {
    subject: "Your ES Express sign-in link",
    html: renderEmailLayout({
      content,
      previewText: `Sign-in link for ES Express — expires in ${opts.expiresInMinutes} minutes.`,
    }),
  };
}
