// POST /api/signoff
// Accepts a sign-off payload, generates a timestamped PDF, and emails
// both parties via Microsoft Graph. Returns { success, timestamp, messageId }.
//
// Env vars (set in Vercel project settings):
//   GRAPH_TENANT_ID        — Azure AD tenant id
//   GRAPH_CLIENT_ID        — App registration client id
//   GRAPH_CLIENT_SECRET    — App registration client secret
//   SIGN_OFF_FROM_EMAIL    — Address to send FROM (e.g. jryan@lexcom.com)
//   SIGN_OFF_CC            — Comma-separated CC list (e.g. bryan@lexcom.com,jared@lexcom.com)
//   DEV_MODE               — If "1", skips Graph send and returns the PDF inline
//
// Required Azure app permission: Mail.Send (Application), admin consented.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const {
    signeeName,
    signeeEmail,
    signeeTitle,
    checklist,
    answers,
    typedSignature,
    documentTitle,
    documentSlug,
  } = payload ?? {};

  if (
    !signeeName ||
    !signeeEmail ||
    !typedSignature ||
    typedSignature.trim().toLowerCase() !== signeeName.trim().toLowerCase()
  ) {
    return res.status(400).json({
      error:
        "Name, email, and typed signature are required. Signature must match name.",
    });
  }

  const timestamp = new Date().toISOString();
  const humanDate = new Date(timestamp).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "full",
    timeStyle: "long",
  });

  const pdfBytes = await buildPdf({
    signeeName,
    signeeEmail,
    signeeTitle: signeeTitle ?? "",
    checklist: checklist ?? [],
    answers: answers ?? [],
    typedSignature,
    timestamp,
    humanDate,
    documentTitle:
      documentTitle ?? "ES Express Workbench — Design Sign-off",
    documentSlug: documentSlug ?? "jess-2026-04-17",
  });

  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
  const messageId = `signoff-${Date.now()}`;

  if (process.env.DEV_MODE === "1") {
    return res.status(200).json({
      success: true,
      timestamp,
      messageId,
      devMode: true,
      note: "DEV_MODE=1 — PDF returned inline, no email sent.",
      pdfBase64,
    });
  }

  try {
    const graphMessageId = await sendViaGraph({
      to: signeeEmail,
      ccList: (process.env.SIGN_OFF_CC ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      from: process.env.SIGN_OFF_FROM_EMAIL,
      subject: `[Signed ${humanDate}] ${documentTitle ?? "ES Express Workbench Sign-off"}`,
      bodyHtml: buildEmailHtml({
        signeeName,
        humanDate,
        documentTitle:
          documentTitle ?? "ES Express Workbench — Design Sign-off",
      }),
      attachmentName: `signoff-${documentSlug ?? "jess"}-${timestamp.slice(0, 10)}.pdf`,
      attachmentBase64: pdfBase64,
    });

    return res.status(200).json({
      success: true,
      timestamp,
      messageId: graphMessageId,
    });
  } catch (err) {
    console.error("[signoff] graph send failed", err);
    return res.status(500).json({
      error: "Failed to send confirmation email",
      detail: err instanceof Error ? err.message : String(err),
      timestamp,
    });
  }
}

/**
 * Build a clean, legal-ish PDF capturing the sign-off. Two pages max:
 *   p1 — Title, signee, timestamp, typed signature, checklist summary
 *   p2 — Open question answers (if any), legal footer
 */
async function buildPdf({
  signeeName,
  signeeEmail,
  signeeTitle,
  checklist,
  answers,
  typedSignature,
  timestamp,
  humanDate,
  documentTitle,
  documentSlug,
}) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const purple = rgb(0.427, 0.157, 0.851);
  const text1 = rgb(0.117, 0.106, 0.094);
  const text2 = rgb(0.29, 0.271, 0.251);
  const text3 = rgb(0.541, 0.51, 0.475);
  const border = rgb(0.8, 0.77, 0.73);
  const greenCheck = rgb(0.133, 0.773, 0.369);

  let page = doc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();
  const margin = 54;

  // ─ Header bar
  page.drawRectangle({
    x: 0,
    y: height - 88,
    width,
    height: 88,
    color: purple,
  });
  page.drawText("ES EXPRESS · WORKBENCH SIGN-OFF", {
    x: margin,
    y: height - 42,
    size: 11,
    font: helvBold,
    color: rgb(1, 1, 1),
    characterSpacing: 1.5,
  });
  page.drawText(documentTitle, {
    x: margin,
    y: height - 66,
    size: 16,
    font: helvBold,
    color: rgb(1, 1, 1),
  });

  // ─ Signee block
  let y = height - 130;
  drawLabel(page, "SIGNED BY", margin, y, helvBold, text3);
  y -= 16;
  page.drawText(signeeName, {
    x: margin,
    y,
    size: 18,
    font: helvBold,
    color: text1,
  });
  y -= 16;
  if (signeeTitle) {
    page.drawText(signeeTitle, {
      x: margin,
      y,
      size: 11,
      font: helv,
      color: text2,
    });
    y -= 14;
  }
  page.drawText(signeeEmail, {
    x: margin,
    y,
    size: 10,
    font: helv,
    color: text2,
  });
  y -= 20;

  // ─ Timestamp box
  drawLabel(page, "TIMESTAMP (AMERICA/CHICAGO)", margin, y, helvBold, text3);
  y -= 14;
  page.drawText(humanDate, {
    x: margin,
    y,
    size: 11,
    font: helvBold,
    color: text1,
  });
  y -= 12;
  page.drawText(`UTC · ${timestamp}`, {
    x: margin,
    y,
    size: 9,
    font: helv,
    color: text3,
  });
  y -= 20;

  // ─ Typed signature
  drawLabel(page, "TYPED SIGNATURE", margin, y, helvBold, text3);
  y -= 14;
  page.drawText(typedSignature, {
    x: margin,
    y,
    size: 22,
    font: helvOblique,
    color: purple,
  });
  y -= 8;
  page.drawLine({
    start: { x: margin, y: y - 4 },
    end: { x: margin + 320, y: y - 4 },
    thickness: 0.6,
    color: text3,
  });
  y -= 22;

  // ─ Checklist
  if (checklist && checklist.length > 0) {
    drawLabel(page, "SIGN-OFF CHECKLIST", margin, y, helvBold, text3);
    y -= 18;
    for (const item of checklist) {
      const checked = !!item.checked;
      // Box — filled green when checked, empty outline otherwise
      page.drawRectangle({
        x: margin,
        y: y - 4,
        width: 10,
        height: 10,
        borderColor: checked ? greenCheck : border,
        borderWidth: 1,
        color: checked ? greenCheck : rgb(1, 1, 1),
      });
      if (checked) {
        // Draw a simple check shape with two lines (WinAnsi can't encode ✓)
        page.drawLine({
          start: { x: margin + 1.8, y: y + 0.5 },
          end: { x: margin + 4, y: y - 2 },
          thickness: 1.3,
          color: rgb(1, 1, 1),
        });
        page.drawLine({
          start: { x: margin + 4, y: y - 2 },
          end: { x: margin + 8.5, y: y + 3 },
          thickness: 1.3,
          color: rgb(1, 1, 1),
        });
      }
      const label = item.label ?? "";
      page.drawText(truncate(label, 82), {
        x: margin + 18,
        y: y - 2,
        size: 10,
        font: checked ? helvBold : helv,
        color: checked ? text1 : text2,
      });
      if (item.note) {
        y -= 14;
        page.drawText(truncate(item.note, 90), {
          x: margin + 18,
          y: y - 2,
          size: 9,
          font: helvOblique,
          color: text3,
        });
      }
      y -= 18;
      if (y < 100) break;
    }
    y -= 10;
  }

  // Footer p1
  drawPageFooter(page, 1, margin, helv, text3);

  // ─ Page 2: answers
  if (answers && answers.length > 0) {
    page = doc.addPage([612, 792]);
    const { width: w2, height: h2 } = page.getSize();
    page.drawRectangle({
      x: 0,
      y: h2 - 48,
      width: w2,
      height: 48,
      color: purple,
    });
    page.drawText("OPEN QUESTION ANSWERS", {
      x: margin,
      y: h2 - 30,
      size: 12,
      font: helvBold,
      color: rgb(1, 1, 1),
      characterSpacing: 1.2,
    });
    let y2 = h2 - 80;
    for (const a of answers) {
      if (y2 < 100) break;
      drawLabel(page, `Q · ${a.question ?? ""}`, margin, y2, helvBold, purple);
      y2 -= 14;
      const answer = a.answer ?? "(no answer)";
      const lines = wrapText(answer, 80);
      for (const line of lines) {
        if (y2 < 80) break;
        page.drawText(line, {
          x: margin,
          y: y2,
          size: 10,
          font: helv,
          color: text1,
        });
        y2 -= 13;
      }
      y2 -= 10;
    }
    drawPageFooter(page, 2, margin, helv, text3);
  }

  // Legal footer on last page
  const lastPage = doc.getPages()[doc.getPages().length - 1];
  lastPage.drawLine({
    start: { x: margin, y: 74 },
    end: { x: width - margin, y: 74 },
    thickness: 0.5,
    color: border,
  });
  lastPage.drawText(
    "This document records an electronic approval of the referenced design mockup. The typed signature above,",
    {
      x: margin,
      y: 62,
      size: 8,
      font: helv,
      color: text3,
    },
  );
  lastPage.drawText(
    "in combination with the timestamp, constitutes the signee's assent to proceed with implementation.",
    {
      x: margin,
      y: 52,
      size: 8,
      font: helv,
      color: text3,
    },
  );
  lastPage.drawText(`Document slug: ${documentSlug}`, {
    x: margin,
    y: 38,
    size: 8,
    font: helvOblique,
    color: text3,
  });

  return doc.save();
}

function drawLabel(page, text, x, y, font, color) {
  page.drawText(text, {
    x,
    y,
    size: 9,
    font,
    color,
    characterSpacing: 0.8,
  });
}

function drawPageFooter(page, n, margin, font, color) {
  page.drawText(`Page ${n} · ES Express Workbench Sign-off`, {
    x: margin,
    y: 20,
    size: 8,
    font,
    color,
  });
}

function truncate(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function wrapText(s, maxChars) {
  const words = s.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 10);
}

function buildEmailHtml({ signeeName, humanDate, documentTitle }) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1e1b18; line-height: 1.55">
    <p>Hi team,</p>
    <p>
      <strong>${escapeHtml(signeeName)}</strong> signed off on
      <em>${escapeHtml(documentTitle)}</em> at
      <strong>${escapeHtml(humanDate)}</strong> (Central).
    </p>
    <p>
      The signed PDF is attached. It captures the checklist choices,
      answers to the open questions, and the typed signature with
      timestamp.
    </p>
    <p>
      This approval unblocks the next phase of the Workbench build on
      <code>feature/workbench-v5</code>. The decision record at
      <code>docs/superpowers/decisions/2026-04-17-jessica-pcs-green-light-workflow.md</code>
      will be appended with this sign-off record.
    </p>
    <p style="color:#8a8279; font-size: 12px; margin-top: 24px">
      Sent automatically by the ES Express sign-off portal.
    </p>
  </body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Acquire a Graph access token using client-credentials flow. */
async function getGraphToken() {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Missing Graph env vars. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET.",
    );
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Send an email via Microsoft Graph with an attached PDF. */
async function sendViaGraph({
  to,
  ccList,
  from,
  subject,
  bodyHtml,
  attachmentName,
  attachmentBase64,
}) {
  if (!from) {
    throw new Error("SIGN_OFF_FROM_EMAIL env var not set.");
  }
  const token = await getGraphToken();
  const message = {
    message: {
      subject,
      body: { contentType: "HTML", content: bodyHtml },
      toRecipients: [{ emailAddress: { address: to } }],
      ccRecipients: ccList.map((addr) => ({ emailAddress: { address: addr } })),
      attachments: [
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachmentName,
          contentType: "application/pdf",
          contentBytes: attachmentBase64,
        },
      ],
    },
    saveToSentItems: true,
  };
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );
  if (!res.ok && res.status !== 202) {
    const text = await res.text();
    throw new Error(`Graph send failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.headers.get("request-id") ?? `graph-${Date.now()}`;
}
