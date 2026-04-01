/**
 * JotForm Weight Ticket Service — Tests (Track 3.1)
 * ==================================================
 *
 * Focus on pure functions (extractWeightTicketFields, isAllowedPhotoUrl)
 * since matching and sync depend on a real database.
 * Export-existence checks cover DB-dependent functions.
 */

import { describe, it, expect } from "vitest";
import {
  extractWeightTicketFields,
  isAllowedPhotoUrl,
  matchSubmissionToLoad,
  syncWeightTickets,
  diagnostics,
  type JotFormSubmission,
  type ExtractedFields,
  type MatchResult,
  type SyncResult,
  type JotFormConfig,
} from "../../src/plugins/verification/services/jotform.service.js";

// ---------------------------------------------------------------------------
// Helpers — build JotForm submission fixtures
// ---------------------------------------------------------------------------

function buildSubmission(
  answers: JotFormSubmission["answers"] = {},
  overrides: Partial<JotFormSubmission> = {},
): JotFormSubmission {
  return {
    id: "12345",
    created_at: "2026-03-15 10:00:00",
    answers,
    ...overrides,
  };
}

function fullnameAnswer(
  first: string,
  last: string,
  qid = "1",
): JotFormSubmission["answers"] {
  return {
    [qid]: {
      type: "control_fullname",
      name: "driverName",
      text: "Driver Name",
      answer: { first, last },
    },
  };
}

function textAnswer(
  name: string,
  text: string,
  value: string,
  qid = "2",
): JotFormSubmission["answers"] {
  return {
    [qid]: {
      type: "control_textbox",
      name,
      text,
      answer: value,
    },
  };
}

function numberAnswer(
  name: string,
  text: string,
  value: string,
  qid = "3",
): JotFormSubmission["answers"] {
  return {
    [qid]: {
      type: "control_number",
      name,
      text,
      answer: value,
    },
  };
}

function fileAnswer(urls: unknown, qid = "5"): JotFormSubmission["answers"] {
  return {
    [qid]: {
      type: "control_fileupload",
      name: "uploadTicket",
      text: "Upload Weight Ticket",
      answer: urls,
    },
  };
}

function datetimeAnswer(
  value: string,
  qid = "6",
): JotFormSubmission["answers"] {
  return {
    [qid]: {
      type: "control_datetime",
      name: "submittedDate",
      text: "Submitted Date",
      answer: value,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Export existence checks
// ═══════════════════════════════════════════════════════════════════

describe("JotForm Service — exports", () => {
  it("exports extractWeightTicketFields function", () => {
    expect(typeof extractWeightTicketFields).toBe("function");
  });

  it("exports isAllowedPhotoUrl function", () => {
    expect(typeof isAllowedPhotoUrl).toBe("function");
  });

  it("exports matchSubmissionToLoad function", () => {
    expect(typeof matchSubmissionToLoad).toBe("function");
  });

  it("exports syncWeightTickets function", () => {
    expect(typeof syncWeightTickets).toBe("function");
  });

  it("exports diagnostics function", () => {
    expect(typeof diagnostics).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════
// isAllowedPhotoUrl
// ═══════════════════════════════════════════════════════════════════

describe("isAllowedPhotoUrl", () => {
  it("accepts HTTPS URL from hairpintrucking.jotform.com", () => {
    expect(
      isAllowedPhotoUrl(
        "https://hairpintrucking.jotform.com/uploads/photo.jpg",
      ),
    ).toBe(true);
  });

  it("accepts HTTPS URL from www.jotform.com", () => {
    expect(isAllowedPhotoUrl("https://www.jotform.com/uploads/photo.jpg")).toBe(
      true,
    );
  });

  it("accepts HTTPS URL from files.propx.com", () => {
    expect(isAllowedPhotoUrl("https://files.propx.com/images/ticket.png")).toBe(
      true,
    );
  });

  it("accepts HTTPS URL from storage.googleapis.com", () => {
    expect(
      isAllowedPhotoUrl("https://storage.googleapis.com/bucket/file.jpg"),
    ).toBe(true);
  });

  it("accepts HTTP URL from allowed domain", () => {
    expect(
      isAllowedPhotoUrl("http://hairpintrucking.jotform.com/uploads/photo.jpg"),
    ).toBe(true);
  });

  it("rejects URL from unknown domain", () => {
    expect(isAllowedPhotoUrl("https://evil.com/malware.exe")).toBe(false);
  });

  it("rejects FTP URL even from allowed domain", () => {
    expect(
      isAllowedPhotoUrl("ftp://hairpintrucking.jotform.com/file.jpg"),
    ).toBe(false);
  });

  it("rejects data: URL", () => {
    expect(isAllowedPhotoUrl("data:image/png;base64,abc")).toBe(false);
  });

  it("rejects javascript: URL", () => {
    expect(isAllowedPhotoUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedPhotoUrl("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isAllowedPhotoUrl(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isAllowedPhotoUrl(undefined)).toBe(false);
  });

  it("rejects non-string value", () => {
    expect(isAllowedPhotoUrl(42)).toBe(false);
  });

  it("rejects invalid URL string", () => {
    expect(isAllowedPhotoUrl("not-a-url")).toBe(false);
  });

  it("rejects URL with subdomain impersonation", () => {
    expect(
      isAllowedPhotoUrl(
        "https://hairpintrucking.jotform.com.evil.com/photo.jpg",
      ),
    ).toBe(false);
  });

  it("accepts subdomain of allowed domain", () => {
    expect(
      isAllowedPhotoUrl("https://cdn.storage.googleapis.com/bucket/file.jpg"),
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — driver name
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — driver name", () => {
  it("extracts driver name from control_fullname", () => {
    const sub = buildSubmission({ ...fullnameAnswer("Anthony", "Davis") });
    expect(extractWeightTicketFields(sub).driverName).toBe("Anthony Davis");
  });

  it("handles first name only", () => {
    const sub = buildSubmission({ ...fullnameAnswer("Anthony", "") });
    expect(extractWeightTicketFields(sub).driverName).toBe("Anthony");
  });

  it("handles last name only", () => {
    const sub = buildSubmission({ ...fullnameAnswer("", "Davis") });
    expect(extractWeightTicketFields(sub).driverName).toBe("Davis");
  });

  it("returns null when no fullname control", () => {
    const sub = buildSubmission({});
    expect(extractWeightTicketFields(sub).driverName).toBeNull();
  });

  it("returns null when answer is empty object", () => {
    const sub = buildSubmission({
      "1": {
        type: "control_fullname",
        name: "driver",
        text: "Driver Name",
        answer: {},
      },
    });
    expect(extractWeightTicketFields(sub).driverName).toBeNull();
  });

  it("returns null when answer is null", () => {
    const sub = buildSubmission({
      "1": {
        type: "control_fullname",
        name: "driver",
        text: "Driver Name",
        answer: null,
      },
    });
    expect(extractWeightTicketFields(sub).driverName).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — truck number
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — truck number", () => {
  it("extracts truck number from text field with 'truck' in label", () => {
    const sub = buildSubmission({
      ...textAnswer("truckNumber", "Truck #", "T-101"),
    });
    expect(extractWeightTicketFields(sub).truckNo).toBe("T-101");
  });

  it("extracts truck number when 'truck' is in name", () => {
    const sub = buildSubmission({
      ...textAnswer("truck", "Vehicle Number", "T-202"),
    });
    expect(extractWeightTicketFields(sub).truckNo).toBe("T-202");
  });

  it("returns null when no truck field", () => {
    const sub = buildSubmission({});
    expect(extractWeightTicketFields(sub).truckNo).toBeNull();
  });

  it("extracts from field with 'Truck No' label", () => {
    const sub = buildSubmission({
      ...textAnswer("vehicleNo", "Truck No", "T-303"),
    });
    expect(extractWeightTicketFields(sub).truckNo).toBe("T-303");
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — BOL number
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — BOL number", () => {
  it("extracts from field labeled 'BOL'", () => {
    const sub = buildSubmission({
      ...textAnswer("bolNumber", "BOL #", "BOL-12345"),
    });
    expect(extractWeightTicketFields(sub).bolNo).toBe("BOL-12345");
  });

  it("extracts from field labeled 'Ticket'", () => {
    const sub = buildSubmission({
      ...textAnswer("ticketNo", "Ticket Number", "TK-999"),
    });
    expect(extractWeightTicketFields(sub).bolNo).toBe("TK-999");
  });

  it("extracts from field labeled 'Bill'", () => {
    const sub = buildSubmission({
      ...textAnswer("billNo", "Bill of Lading", "BL-555"),
    });
    expect(extractWeightTicketFields(sub).bolNo).toBe("BL-555");
  });

  it("extracts from field with 'bol' in name", () => {
    const sub = buildSubmission({
      ...textAnswer("bol", "Enter Number", "BOL-777"),
    });
    expect(extractWeightTicketFields(sub).bolNo).toBe("BOL-777");
  });

  it("extracts from field with 'ticket' in name", () => {
    const sub = buildSubmission({
      ...textAnswer("ticketNumber", "Enter Number", "TK-888"),
    });
    expect(extractWeightTicketFields(sub).bolNo).toBe("TK-888");
  });

  it("returns null when no BOL field", () => {
    const sub = buildSubmission({});
    expect(extractWeightTicketFields(sub).bolNo).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — load number
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — load number", () => {
  it("extracts load number from textbox with 'Load Number' label", () => {
    const sub = buildSubmission({
      ...textAnswer("loadNum", "Load Number", "LD-1001"),
    });
    expect(extractWeightTicketFields(sub).loadNo).toBe("LD-1001");
  });

  it("extracts load number from textbox with 'Load No' label", () => {
    const sub = buildSubmission({
      ...textAnswer("loadNo", "Load No", "LD-2002"),
    });
    expect(extractWeightTicketFields(sub).loadNo).toBe("LD-2002");
  });

  it("extracts load number from textbox with 'load' in name", () => {
    const sub = buildSubmission({
      ...textAnswer("load", "Enter Number", "LD-3003"),
    });
    expect(extractWeightTicketFields(sub).loadNo).toBe("LD-3003");
  });

  it("extracts load number from number control", () => {
    const sub = buildSubmission({
      ...numberAnswer("loadNumber", "Load Number", "4004"),
    });
    expect(extractWeightTicketFields(sub).loadNo).toBe("4004");
  });

  it("returns null when no load number field", () => {
    const sub = buildSubmission({});
    expect(extractWeightTicketFields(sub).loadNo).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — weight
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — weight", () => {
  it("extracts weight from text field labeled 'weight'", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "weight",
        text: "Weight (lbs)",
        answer: "44500",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(44500);
  });

  it("extracts weight from number field", () => {
    const sub = buildSubmission({
      ...numberAnswer("weight", "Weight", "22500"),
    });
    expect(extractWeightTicketFields(sub).weight).toBe(22500);
  });

  it("extracts weight from spinner field", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_spinner",
        name: "weight",
        text: "Weight",
        answer: "18000",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(18000);
  });

  it("handles comma-formatted weight", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "netWeight",
        text: "Weight (lbs)",
        answer: "44,500",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(44500);
  });

  it("handles space-formatted weight", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "weight",
        text: "Weight",
        answer: "44 500",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(44500);
  });

  it("accepts zero weight", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "weight",
        text: "Weight",
        answer: "0",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(0);
  });

  it("returns null weight when no weight field", () => {
    const sub = buildSubmission({});
    expect(extractWeightTicketFields(sub).weight).toBeNull();
  });

  it("returns null for invalid weight text", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "weight",
        text: "Weight",
        answer: "N/A",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBeNull();
  });

  it("rejects negative weight", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "weight",
        text: "Weight",
        answer: "-500",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBeNull();
  });

  it("matches weight by 'lbs' in text label", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "amount",
        text: "Total (lbs)",
        answer: "33000",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(33000);
  });

  it("matches weight by 'tons' in text label", () => {
    const sub = buildSubmission({
      "3": {
        type: "control_textbox",
        name: "amount",
        text: "Amount (tons)",
        answer: "22.5",
      },
    });
    expect(extractWeightTicketFields(sub).weight).toBe(22.5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — photos
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — photos", () => {
  it("extracts array of allowed URLs from file upload", () => {
    const urls = [
      "https://hairpintrucking.jotform.com/uploads/photo1.jpg",
      "https://hairpintrucking.jotform.com/uploads/photo2.jpg",
    ];
    const sub = buildSubmission({ ...fileAnswer(urls) });
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual(urls);
    expect(result.photoUrl).toBe(urls[0]);
  });

  it("handles single string URL", () => {
    const url = "https://hairpintrucking.jotform.com/uploads/photo.jpg";
    const sub = buildSubmission({ ...fileAnswer(url) });
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual([url]);
    expect(result.photoUrl).toBe(url);
  });

  it("filters out non-HTTP URLs", () => {
    const urls = [
      "https://hairpintrucking.jotform.com/photo.jpg",
      "",
      "not-a-url",
      "https://hairpintrucking.jotform.com/photo2.jpg",
    ];
    const sub = buildSubmission({ ...fileAnswer(urls) });
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual([
      "https://hairpintrucking.jotform.com/photo.jpg",
      "https://hairpintrucking.jotform.com/photo2.jpg",
    ]);
  });

  it("filters out URLs from disallowed domains", () => {
    const urls = [
      "https://hairpintrucking.jotform.com/photo.jpg",
      "https://evil.com/malware.exe",
      "https://storage.googleapis.com/bucket/ticket.jpg",
    ];
    const sub = buildSubmission({ ...fileAnswer(urls) });
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual([
      "https://hairpintrucking.jotform.com/photo.jpg",
      "https://storage.googleapis.com/bucket/ticket.jpg",
    ]);
  });

  it("returns empty array when no file upload", () => {
    const sub = buildSubmission({});
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual([]);
    expect(result.photoUrl).toBeNull();
  });

  it("filters out null values in URL array", () => {
    const urls = [
      null,
      "https://hairpintrucking.jotform.com/photo.jpg",
      undefined,
    ];
    const sub = buildSubmission({ ...fileAnswer(urls) });
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual([
      "https://hairpintrucking.jotform.com/photo.jpg",
    ]);
  });

  it("filters out non-string values in URL array", () => {
    const urls = [
      42,
      "https://hairpintrucking.jotform.com/photo.jpg",
      { url: "nope" },
    ];
    const sub = buildSubmission({ ...fileAnswer(urls) });
    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toEqual([
      "https://hairpintrucking.jotform.com/photo.jpg",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — datetime
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — datetime", () => {
  it("parses submittedAt from created_at", () => {
    const sub = buildSubmission({}, { created_at: "2026-03-15 14:30:00" });
    const result = extractWeightTicketFields(sub);
    expect(result.submittedAt).toBeInstanceOf(Date);
    expect(result.submittedAt!.getFullYear()).toBe(2026);
  });

  it("overrides submittedAt from control_datetime answer", () => {
    const sub = buildSubmission(
      { ...datetimeAnswer("2026-04-01 08:00:00") },
      { created_at: "2026-03-15 14:30:00" },
    );
    const result = extractWeightTicketFields(sub);
    expect(result.submittedAt).toBeInstanceOf(Date);
    expect(result.submittedAt!.getMonth()).toBe(3); // April = month 3
  });

  it("returns null when created_at is invalid", () => {
    const sub = buildSubmission({}, { created_at: "not-a-date" });
    const result = extractWeightTicketFields(sub);
    expect(result.submittedAt).toBeNull();
  });

  it("returns null when created_at is empty", () => {
    const sub = buildSubmission({}, { created_at: "" });
    const result = extractWeightTicketFields(sub);
    expect(result.submittedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — edge cases
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — edge cases", () => {
  it("handles submission with no answers key", () => {
    const sub = {
      id: "1",
      created_at: "2026-01-01",
    } as unknown as JotFormSubmission;
    const result = extractWeightTicketFields(sub);
    expect(result.driverName).toBeNull();
    expect(result.bolNo).toBeNull();
    expect(result.truckNo).toBeNull();
    expect(result.weight).toBeNull();
    expect(result.imageUrls).toEqual([]);
  });

  it("handles empty answers object", () => {
    const sub = buildSubmission({});
    const result = extractWeightTicketFields(sub);
    expect(result.driverName).toBeNull();
    expect(result.truckNo).toBeNull();
    expect(result.bolNo).toBeNull();
    expect(result.loadNo).toBeNull();
    expect(result.weight).toBeNull();
    expect(result.photoUrl).toBeNull();
    expect(result.imageUrls).toEqual([]);
  });

  it("handles unknown control types gracefully", () => {
    const sub = buildSubmission({
      "99": {
        type: "control_unknown_widget",
        name: "mystery",
        text: "What is this?",
        answer: "something",
      },
    });
    const result = extractWeightTicketFields(sub);
    // Should not throw, just skip unknown types
    expect(result.driverName).toBeNull();
  });

  it("handles answer with missing name and text", () => {
    const sub = buildSubmission({
      "1": {
        type: "control_textbox",
        answer: "some value",
      },
    });
    // Should not throw
    const result = extractWeightTicketFields(sub);
    expect(result).toBeDefined();
  });

  it("handles non-string answer in textbox gracefully", () => {
    const sub = buildSubmission({
      "1": {
        type: "control_textbox",
        name: "truck",
        text: "Truck #",
        answer: 12345,
      },
    });
    const result = extractWeightTicketFields(sub);
    // Non-string answer treated as empty string
    expect(result.truckNo).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════
// extractWeightTicketFields — full submission
// ═══════════════════════════════════════════════════════════════════

describe("extractWeightTicketFields — full submission", () => {
  it("extracts all fields from a realistic submission", () => {
    const sub = buildSubmission({
      ...fullnameAnswer("John", "Smith"),
      ...textAnswer("truckNo", "Truck #", "T-500", "2"),
      ...textAnswer("bolNumber", "BOL Number", "BOL-12345", "3"),
      "4": {
        type: "control_textbox",
        name: "weight",
        text: "Weight (lbs)",
        answer: "44,500",
      },
      ...fileAnswer(
        ["https://hairpintrucking.jotform.com/uploads/ticket.jpg"],
        "5",
      ),
    });

    const result = extractWeightTicketFields(sub);
    expect(result.driverName).toBe("John Smith");
    expect(result.truckNo).toBe("T-500");
    expect(result.bolNo).toBe("BOL-12345");
    expect(result.weight).toBe(44500);
    expect(result.photoUrl).toBe(
      "https://hairpintrucking.jotform.com/uploads/ticket.jpg",
    );
    expect(result.imageUrls).toHaveLength(1);
    expect(result.submittedAt).toBeInstanceOf(Date);
  });

  it("extracts submission with load number instead of BOL", () => {
    const sub = buildSubmission({
      ...fullnameAnswer("Jane", "Doe"),
      ...textAnswer("loadNum", "Load Number", "LD-999", "2"),
      ...numberAnswer("weight", "Net Weight", "22000", "3"),
      ...fileAnswer(["https://files.propx.com/images/ticket.png"], "4"),
    });

    const result = extractWeightTicketFields(sub);
    expect(result.driverName).toBe("Jane Doe");
    expect(result.loadNo).toBe("LD-999");
    expect(result.bolNo).toBeNull();
    expect(result.weight).toBe(22000);
    expect(result.photoUrl).toBe("https://files.propx.com/images/ticket.png");
  });

  it("extracts submission with multiple photos", () => {
    const sub = buildSubmission({
      ...fullnameAnswer("Mike", "Johnson"),
      ...textAnswer("bol", "BOL #", "BOL-555", "2"),
      ...fileAnswer(
        [
          "https://hairpintrucking.jotform.com/uploads/front.jpg",
          "https://hairpintrucking.jotform.com/uploads/back.jpg",
          "https://storage.googleapis.com/bucket/extra.jpg",
        ],
        "3",
      ),
    });

    const result = extractWeightTicketFields(sub);
    expect(result.imageUrls).toHaveLength(3);
    expect(result.photoUrl).toBe(
      "https://hairpintrucking.jotform.com/uploads/front.jpg",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// diagnostics
// ═══════════════════════════════════════════════════════════════════

describe("diagnostics", () => {
  it("returns feature diagnostic structure", () => {
    const diag = diagnostics();
    expect(diag.name).toBe("jotform");
    expect(["healthy", "degraded", "error"]).toContain(diag.status);
    expect(diag.stats).toBeDefined();
    expect(diag.checks).toBeInstanceOf(Array);
    expect(diag.checks.length).toBeGreaterThan(0);
  });

  it("reports api-key check", () => {
    const diag = diagnostics();
    const apiKeyCheck = diag.checks.find((c) => c.name === "api-key");
    expect(apiKeyCheck).toBeDefined();
  });

  it("reports last-sync check", () => {
    const diag = diagnostics();
    const syncCheck = diag.checks.find((c) => c.name === "last-sync");
    expect(syncCheck).toBeDefined();
  });

  it("includes form ID in stats", () => {
    const diag = diagnostics();
    expect(diag.stats.formId).toBe("240655800307047");
  });

  it("includes allowed photo domains in stats", () => {
    const diag = diagnostics();
    expect(diag.stats.allowedPhotoDomains).toBeInstanceOf(Array);
    expect((diag.stats.allowedPhotoDomains as string[]).length).toBeGreaterThan(
      0,
    );
  });
});
