/**
 * Base email layout — wraps any email body with consistent header/footer
 * branding. All notification templates should route their content through
 * `renderEmailLayout` so the chrome stays in one place.
 *
 * Keep this minimal and table-based for maximum email-client compatibility
 * (Outlook desktop still renders like it's 2003).
 */

export interface EmailLayoutOpts {
  /** Inner HTML for the email body (already sanitized / trusted). */
  content: string;
  /** Optional preview text shown in inbox list before the user opens. */
  previewText?: string;
}

export function renderEmailLayout(opts: EmailLayoutOpts): string {
  const preview = opts.previewText ?? "";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ES Express Platform</title>
  </head>
  <body style="margin:0;padding:0;background:#0a0c0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0c0f;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#12151a;border:1px solid #1f2430;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #1f2430;">
                <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:600;">ES Express Platform</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px;">Dispatch operations</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#f8fafc;font-size:15px;line-height:1.6;">
                ${opts.content}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #1f2430;font-size:11px;color:#64748b;">
                Sent by Lexcom Systems Group on behalf of ES Express LLC.<br/>
                This is an automated message — do not reply directly.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Minimal HTML-escape for user-supplied strings rendered inside the layout. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
