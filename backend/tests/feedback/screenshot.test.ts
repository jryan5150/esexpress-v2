import { describe, it, expect } from "vitest";

describe("Screenshot Service", () => {
  it("exports uploadScreenshot function", async () => {
    const mod =
      await import("../../src/plugins/feedback/services/screenshot.service.js");
    expect(typeof mod.uploadScreenshot).toBe("function");
  });

  it("rejects empty base64 input", async () => {
    const { uploadScreenshot } =
      await import("../../src/plugins/feedback/services/screenshot.service.js");
    await expect(uploadScreenshot("", 1)).rejects.toThrow(
      "Empty screenshot data",
    );
  });
});
