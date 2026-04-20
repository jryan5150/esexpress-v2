// Local smoke test: call the signoff function with a mock payload
// and verify PDF bytes come out. Skips email send (DEV_MODE=1).
process.env.DEV_MODE = "1";
import("./api/signoff.js").then(async ({ default: handler }) => {
  const mockReq = {
    method: "POST",
    body: {
      signeeName: "Jessica Handlin",
      signeeEmail: "jess@example.com",
      signeeTitle: "Dispatch Lead",
      typedSignature: "Jessica Handlin",
      checklist: [
        { key: "color", label: "Color language matches", checked: true },
        { key: "clear", label: "Every load clicks", checked: true, note: "confirmed" },
      ],
      answers: [
        { question: "Who confirms?", answer: "Only me for now" },
        { question: "Pink = built or pushed?", answer: "Same pink for both" },
      ],
      documentTitle: "ES Express Workbench — Test",
      documentSlug: "test-local",
    },
  };
  let statusCode = 0;
  let responseBody = null;
  const mockRes = {
    status(n) { statusCode = n; return this; },
    json(obj) { responseBody = obj; return this; },
  };
  await handler(mockReq, mockRes);
  console.log("Status:", statusCode);
  console.log("DevMode:", responseBody?.devMode);
  console.log("PDF bytes length:", responseBody?.pdfBase64?.length);
  console.log("Timestamp:", responseBody?.timestamp);
  if (responseBody?.pdfBase64) {
    const fs = await import("fs");
    fs.writeFileSync("/tmp/test-signoff.pdf", Buffer.from(responseBody.pdfBase64, "base64"));
    console.log("PDF written to /tmp/test-signoff.pdf");
    console.log("File size:", fs.statSync("/tmp/test-signoff.pdf").size, "bytes");
  }
});
