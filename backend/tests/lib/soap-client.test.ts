import { describe, it, expect } from "vitest";
import {
  buildSoapEnvelope,
  parseSoapResponse,
} from "../../src/lib/soap-client.js";

describe("SOAP Client", () => {
  const baseConfig = {
    endpoint: "http://example.com",
    namespace: "http://www.example.com/",
  };

  describe("buildSoapEnvelope", () => {
    it("builds a valid SOAP envelope with method and params", () => {
      const xml = buildSoapEnvelope(
        "GetSession",
        { userId: "test" },
        baseConfig,
      );
      expect(xml).toContain('<GetSession xmlns="http://www.example.com/">');
      expect(xml).toContain("<userId>test</userId>");
      expect(xml).toContain("soap:Envelope");
      expect(xml).toContain('<?xml version="1.0"');
    });

    it("includes auth header when sKey provided", () => {
      const xml = buildSoapEnvelope(
        "PostDispatch",
        {},
        {
          ...baseConfig,
          authHeader: { sKey: "abc-123" },
        },
      );
      expect(xml).toContain("<sKey>abc-123</sKey>");
      expect(xml).toContain("AuthSoapHeader");
    });

    it("omits auth header when no sKey", () => {
      const xml = buildSoapEnvelope("GetSession", {}, baseConfig);
      expect(xml).not.toContain("AuthSoapHeader");
      expect(xml).not.toContain("sKey");
    });

    it("escapes XML special characters in param values", () => {
      const xml = buildSoapEnvelope(
        "Test",
        { name: "A & B <C> \"D\" 'E'" },
        baseConfig,
      );
      expect(xml).toContain("A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;");
    });

    it("handles null/undefined param values gracefully", () => {
      const xml = buildSoapEnvelope(
        "Test",
        { a: null, b: undefined },
        baseConfig,
      );
      expect(xml).toContain("<a></a>");
      expect(xml).toContain("<b></b>");
    });

    it("serializes multiple params in order", () => {
      const xml = buildSoapEnvelope(
        "Multi",
        { first: "1", second: "2", third: "3" },
        baseConfig,
      );
      const firstIdx = xml.indexOf("<first>");
      const secondIdx = xml.indexOf("<second>");
      const thirdIdx = xml.indexOf("<third>");
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });
  });

  describe("parseSoapResponse", () => {
    it("parses successful SOAP response", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <GetSessionResponse>
              <sKey>test-key-123</sKey>
            </GetSessionResponse>
          </soap:Body>
        </soap:Envelope>`;
      const result = parseSoapResponse(xml);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.body).toHaveProperty("GetSessionResponse");
      }
    });

    it("parses SOAP fault response", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <soap:Fault>
              <faultcode>Server</faultcode>
              <faultstring>Invalid session</faultstring>
            </soap:Fault>
          </soap:Body>
        </soap:Envelope>`;
      const result = parseSoapResponse(xml);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.faultCode).toBe("Server");
        expect(result.faultString).toBe("Invalid session");
      }
    });

    it("handles namespace-prefixed responses (removeNSPrefix)", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <tns:Envelope xmlns:tns="http://schemas.xmlsoap.org/soap/envelope/">
          <tns:Body>
            <tns:PostDispatchResponse>
              <tns:Result>true</tns:Result>
            </tns:PostDispatchResponse>
          </tns:Body>
        </tns:Envelope>`;
      const result = parseSoapResponse(xml);
      expect(result.success).toBe(true);
    });

    it("throws on missing SOAP Body", () => {
      expect(() => parseSoapResponse("<html>Not XML</html>")).toThrow(
        "No SOAP Body",
      );
    });

    it("preserves string values without numeric coercion", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <Response>
              <code>007</code>
              <id>00123</id>
            </Response>
          </soap:Body>
        </soap:Envelope>`;
      const result = parseSoapResponse(xml);
      expect(result.success).toBe(true);
      if (result.success) {
        const resp = result.body.Response as Record<string, unknown>;
        expect(resp.code).toBe("007");
        expect(resp.id).toBe("00123");
      }
    });
  });
});
