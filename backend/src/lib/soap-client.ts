import { XMLParser } from "fast-xml-parser";
import { HttpError } from "./errors.js";

export interface SoapConfig {
  endpoint: string;
  namespace: string;
  authHeader?: { sKey: string };
  timeoutMs?: number;
}

export function buildSoapEnvelope(
  method: string,
  params: Record<string, unknown>,
  config: SoapConfig,
): string {
  const authBlock = config.authHeader
    ? `<soap:Header><AuthSoapHeader xmlns="${config.namespace}"><sKey>${config.authHeader.sKey}</sKey></AuthSoapHeader></soap:Header>`
    : "";

  const paramXml = Object.entries(params)
    .map(([k, v]) => `<${k}>${escapeXml(String(v ?? ""))}</${k}>`)
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  ${authBlock}
  <soap:Body>
    <${method} xmlns="${config.namespace}">
      ${paramXml}
    </${method}>
  </soap:Body>
</soap:Envelope>`;
}

export async function callSoap(
  method: string,
  params: Record<string, unknown>,
  config: SoapConfig,
): Promise<string> {
  const envelope = buildSoapEnvelope(method, params, config);

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `${config.namespace}${method}`,
    },
    body: envelope,
    signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
  });

  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, body);
  return body;
}

// --- XML Parser (singleton, stateless) ---

const soapParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false, // keeps "007" as string, not number
  trimValues: true,
  isArray: (name) => ["item", "error", "result"].includes(name),
});

// Discriminated union return type
type SoapSuccess = { success: true; body: Record<string, unknown> };
type SoapFault = { success: false; faultCode: string; faultString: string };
export type SoapResult = SoapSuccess | SoapFault;

export function parseSoapResponse(xml: string): SoapResult {
  const doc = soapParser.parse(xml);
  const body = doc?.Envelope?.Body;
  if (!body) throw new Error("No SOAP Body in response");

  const fault = body?.Fault;
  if (fault) {
    return {
      success: false,
      faultCode: fault.faultcode ?? "Unknown",
      faultString: fault.faultstring ?? "",
    };
  }
  return { success: true, body };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
