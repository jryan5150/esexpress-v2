import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

function getStorage(): Storage {
  if (storage) return storage;

  const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (keyJson) {
    const credentials = JSON.parse(Buffer.from(keyJson, "base64").toString());
    storage = new Storage({ credentials });
  } else {
    storage = new Storage();
  }
  return storage;
}

export async function uploadScreenshot(
  base64Data: string,
  userId: number,
): Promise<string> {
  if (!base64Data) throw new Error("Empty screenshot data");

  const bucketName = process.env.GCS_FEEDBACK_BUCKET;
  if (!bucketName) throw new Error("GCS_FEEDBACK_BUCKET not configured");

  const raw = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");

  const filename = `feedback/${userId}/${Date.now()}.jpg`;
  const bucket = getStorage().bucket(bucketName);
  const file = bucket.file(filename);

  await file.save(buffer, {
    contentType: "image/jpeg",
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  return `https://storage.googleapis.com/${bucketName}/${filename}`;
}
