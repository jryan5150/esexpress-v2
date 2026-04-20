/**
 * Tiny test — fetch ONE PropX ticket image to validate creds + connectivity.
 */
import { PropxClient } from "../src/plugins/ingestion/services/propx.service.js";

const apiKey = process.env.PROPX_API_KEY;
if (!apiKey) {
  console.error("PROPX_API_KEY required");
  process.exit(1);
}

const client = new PropxClient({
  apiKey,
  baseUrl: process.env.PROPX_BASE_URL,
});

// Pick a recent PropX load ID — use one we know exists. Will pull one
// from the DB if the user passed it as $1, else hardcode a sample.
const sourceId = process.argv[2] || "test-id";

console.log(`Fetching ticket image for load ${sourceId}…`);
const start = Date.now();
try {
  const image = await client.getLoadTicketImage(sourceId);
  const elapsed = Date.now() - start;
  console.log(
    `Done in ${elapsed}ms.`,
    image
      ? `${image.buffer.length} bytes, ${image.contentType}`
      : "null (no image)",
  );
} catch (err) {
  const elapsed = Date.now() - start;
  console.error(`FAILED in ${elapsed}ms:`, err);
}
process.exit(0);
