#!/usr/bin/env ts-node

import fs from "fs/promises";
import path from "path";
import { generateKeyPair, exportJWK, importJWK } from "jose";
import type { JWK } from "jose";
import { input, select } from "@inquirer/prompts";
import {
  ACMEClient,
  createAcmeCsr,
  directory,
  resolveAndValidateAcmeTxtAuthoritative,
  type ACMEAuthorization,
  type ACMEOrder,
  type CryptoKeyPair,
} from "../src/index.js";
import type { webcrypto } from "crypto";

const ARTIFACTS_DIR = path.join(process.cwd(), 'tmp');
const ACCOUNT_KEY_FILE = path.join(ARTIFACTS_DIR, "account-key.json");
const CERT_KEY_FILE = path.join(ARTIFACTS_DIR, "cert-key.json");
const CERT_CSR_FILE = path.join(ARTIFACTS_DIR, "cert.csr.pem");
const CERT_PEM_FILE = path.join(ARTIFACTS_DIR, "cert.pem");
const ORDER_FILE = path.join(ARTIFACTS_DIR, "order.json");

/* ---------- fs helpers ---------- */

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf8")) as T;
}

async function writeJson(p: string, v: unknown): Promise<void> {
  await fs.writeFile(p, JSON.stringify(v, null, 2), "utf8");
}

/* ---------- account key I/O ---------- */

type StoredAccount = { privateJwk: JWK; publicJwk: JWK };

async function loadAccountKeys(): Promise<{
  privateKey: webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
  publicKey: webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
} | null> {
  try {
    const stored = await readJson<StoredAccount>(ACCOUNT_KEY_FILE);
    const privateKey = await importJWK(stored.privateJwk, "ES256");
    const publicKey = await importJWK(stored.publicJwk, "ES256");
    return { privateKey, publicKey };
  } catch {
    return null;
  }
}

async function saveAccountKeys(keys: {
  privateKey: webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
  publicKey: webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
}) {
  const privateJwk = await exportJWK(keys.privateKey);
  const publicJwk = await exportJWK(keys.publicKey);
  await writeJson(ACCOUNT_KEY_FILE, { privateJwk, publicJwk });
}

/* ---------- cert key / csr I/O ---------- */

async function saveCertKeys(keys: CryptoKeyPair) {
  if (!keys.privateKey) throw new Error("No private key to save");
  const jwk = await exportJWK(keys.privateKey);
  await writeJson(CERT_KEY_FILE, jwk);
}

async function loadCertPrivateKey(): Promise<webcrypto.CryptoKey | Uint8Array<ArrayBufferLike> | null> {
  try {
    const jwk = await readJson<JWK>(CERT_KEY_FILE);
    return await importJWK(jwk, jwk.alg ?? "ES256");
  } catch {
    return null;
  }
}

async function saveCSR(pem: string) {
  await fs.writeFile(CERT_CSR_FILE, pem, "utf8");
}

/* ---------- order I/O ---------- */

type StoredOrder = {
  url: string;
  finalize: string;
  // Include undefined explicitly to satisfy exactOptionalPropertyTypes when value may be undefined
  certificate?: string | undefined;
  status?: ACMEOrder["status"] | undefined;
};

async function saveOrder(o: StoredOrder) {
  await writeJson(ORDER_FILE, o);
}

async function loadOrder(): Promise<StoredOrder | null> {
  try {
    return await readJson<StoredOrder>(ORDER_FILE);
  } catch {
    return null;
  }
}

/* ---------- main ---------- */

async function waitOrderStatus(client: ACMEClient, url: string): Promise<ACMEOrder> {
  const updated = await client.fetchResource<ACMEOrder>(url);
  console.log("Order status:", updated.status);
  if (updated.status === "ready" || updated.status === "valid" || updated.status === "invalid") {
    return updated;
  }
  await new Promise((r) => setTimeout(r, 5000));
  return waitOrderStatus(client, url);
}

async function main() {
  // Short-circuit: cert already present
  if (await fileExists(CERT_PEM_FILE)) {
    console.log(`✅ Certificate already exists at ${CERT_PEM_FILE}. Nothing to do.`);
    return;
  }

  // Select environment (staging/production)
  const env = await select({
    message: "Select ACME environment:",
    choices: [
      { name: "Let's Encrypt STAGING (test, no trusted certs)", value: "staging" },
      { name: "Let's Encrypt PRODUCTION (real trusted certs)", value: "production" },
    ],
  });

  const directoryUrl =
    env === "staging"
      ? directory.letsencrypt.staging.directoryUrl
      : directory.letsencrypt.production.directoryUrl;

  const client = new ACMEClient(directoryUrl);

  // Load or create account
  let accountKeys = await loadAccountKeys();
  if (!accountKeys) {
    console.log("🔑 Generating new account key (ES256)...");
    accountKeys = await generateKeyPair("ES256", { extractable: true });
    await saveAccountKeys(accountKeys);
  }
  client.setAccount(accountKeys);
  await client.createAccount();

  // Try resuming from an existing order
  const existingOrder = await loadOrder();
  if (existingOrder) {
    console.log("ℹ️ Found existing order metadata:", existingOrder.url);

    // If we already have certificate URL — try to download immediately
    if (existingOrder.certificate) {
      console.log("⏳ Downloading certificate from stored URL...");
      const certPem = await client.downloadCertificate(existingOrder.certificate);
      // console.log("Certificate:\n", certPem);
      await fs.writeFile(CERT_PEM_FILE, certPem, "utf8");
      console.log(`🎉 Certificate saved to ${CERT_PEM_FILE}`);
      return;
    }

    // Otherwise poll order; if valid → download; if ready → finalize using existing CSR or create a new one
    const polled = await waitOrderStatus(client, existingOrder.url);
    // keep metadata fresh
    await saveOrder({
      url: polled.url,
      finalize: polled.finalize,
      certificate: polled.certificate,
      status: polled.status,
    });

    if (polled.status === "valid" && polled.certificate) {
      console.log("⏳ Downloading certificate...");
      const certPem = await client.downloadCertificate(polled.certificate);
      await fs.writeFile(CERT_PEM_FILE, certPem, "utf8");
      console.log(`🎉 Certificate saved to ${CERT_PEM_FILE}`);
      return;
    }

    if (polled.status === "ready") {
      console.log("🔧 Order is READY. Proceeding to finalize...");
      // Load or generate certificate key + CSR
      let certPriv = await loadCertPrivateKey();
      let csrPem: string | null = (await fileExists(CERT_CSR_FILE))
        ? await fs.readFile(CERT_CSR_FILE, "utf8")
        : null;
      let derBase64Url: string | null = null;

      if (!certPriv || !csrPem) {
        console.log("🔑 Generating certificate key + CSR...");
        const csr = await createAcmeCsr([/* CN will be validated anyway */], {
          kind: "ec",
          namedCurve: "P-256",
          hash: "SHA-256",
        });
        await saveCertKeys(csr.keys);
        await saveCSR(csr.pem);
        certPriv = csr.keys.privateKey as webcrypto.CryptoKey;
        csrPem = csr.pem;
        derBase64Url = csr.derBase64Url;
      } else {
        // We have CSR PEM on disk, but finalize needs DER (base64url). Re-encode it from PEM.
        const der = Buffer.from(
          csrPem
            .replace(/-----BEGIN CERTIFICATE REQUEST-----/g, "")
            .replace(/-----END CERTIFICATE REQUEST-----/g, "")
            .replace(/\s+/g, ""),
          "base64",
        );
        derBase64Url = Buffer.from(der).toString("base64url");
      }

      console.log("⏳ Finalizing order...");
      const finalized = await client.finalizeOrder(polled.finalize, derBase64Url);
      await saveOrder({
        url: finalized.url,
        finalize: finalized.finalize,
        certificate: finalized.certificate,
        status: finalized.status,
      });

      const valid = await waitOrderStatus(client, finalized.url);
      await saveOrder({
        url: valid.url,
        finalize: valid.finalize,
        certificate: valid.certificate,
        status: valid.status,
      });

      if (!valid.certificate) {
        throw new Error("Order is valid but certificate URL is missing");
      }

      console.log("⏳ Downloading certificate...");
      const certPem = await client.downloadCertificate(valid.certificate);
      await fs.writeFile(CERT_PEM_FILE, certPem, "utf8");
      console.log(`🎉 Certificate saved to ${CERT_PEM_FILE}`);
      return;
    }

    if (polled.status === "invalid") {
      console.error("❌ Stored order is invalid. Will start a new order.");
      // fallthrough to fresh flow
    }
  }

  // Fresh flow: create order and pass challenge
  const commonName = await input({ message: "Enter domain name:" });
  console.log(`\nCreating order for: ${commonName}`);

  const order = await client.createOrder([{ type: "dns", value: commonName }]);
  console.log("✅ Order created:", order);
  await saveOrder({ url: order.url, finalize: order.finalize, status: order.status });

  const authzUrl = order.authorizations[0];
  if (!authzUrl) throw new Error("No authorization URL found in order");

  const authorization = await client.fetchResource<ACMEAuthorization>(authzUrl);
  const challengeType = await select({
    message: "Select type of challenge:",
    choices: authorization.challenges.map((c) => ({ name: c.type, value: c.type })),
  });

  const challenge = authorization.challenges.find((c) => c.type === challengeType)!;
  const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

  if (challenge.type === "dns-01") {
    console.log(
      `\nSet this DNS TXT record:\n_acme-challenge.${commonName} IN TXT "${keyAuthorization}"\n`,
    );
    await input({ message: "Press Enter when DNS record is in place..." });

    // Validate DNS record before proceeding
    while (true) {
      const result = await resolveAndValidateAcmeTxtAuthoritative(commonName, keyAuthorization);
      if (result.ok) {
        console.log("✅ DNS validated successfully.");
        break;
      }
      console.error("❌ DNS validation failed:", result.reasons);
      await input({ message: "Press Enter to retry DNS check..." });
    }
  }

  if (challenge.type === "http-01") {
    console.log(
      `\nServe this file at:\nhttp://${commonName}/.well-known/acme-challenge/${challenge.token}\n`,
    );
    console.log("Content:\n", keyAuthorization, "\n");
    await input({ message: "Press Enter when HTTP challenge is ready..." });
  }

  console.log("⏳ Notifying ACME server...");
  await client.completeChallenge(challenge);

  const ready = await waitOrderStatus(client, order.url);
  await saveOrder({
    url: ready.url,
    finalize: ready.finalize,
    certificate: ready.certificate,
    status: ready.status,
  });

  if (ready.status === "invalid") throw new Error("Order failed");
  if (ready.status !== "ready" && ready.status !== "valid") {
    throw new Error(`Unexpected order status: ${ready.status}`);
  }

  if (ready.status === "valid" && ready.certificate) {
    console.log("⏳ Downloading certificate (order already valid)...");
    const certPem = await client.downloadCertificate(ready.certificate);
    await fs.writeFile(CERT_PEM_FILE, certPem, "utf8");
    console.log(`🎉 Certificate saved to ${CERT_PEM_FILE}`);
    return;
  }

  console.log("\n🔑 Generating certificate key + CSR...");
  const { pem: csrPem, derBase64Url, keys: certKeys } = await createAcmeCsr(
    [commonName],
    { kind: "ec", namedCurve: "P-256", hash: "SHA-256" },
  );
  await saveCertKeys(certKeys);
  await saveCSR(csrPem);

  console.log("⏳ Finalizing order...");
  const finalized = await client.finalizeOrder(ready.finalize, derBase64Url);
  await saveOrder({
    url: finalized.url,
    finalize: finalized.finalize,
    certificate: finalized.certificate,
    status: finalized.status,
  });

  const validOrder = await waitOrderStatus(client, finalized.url);
  await saveOrder({
    url: validOrder.url,
    finalize: validOrder.finalize,
    certificate: validOrder.certificate,
    status: validOrder.status,
  });

  if (!validOrder.certificate) throw new Error("No certificate URL in order");
  console.log("⏳ Downloading certificate...");
  const certPem = await client.downloadCertificate(validOrder.certificate);
  console.log("Certificate:\n", certPem);
  await fs.writeFile(CERT_PEM_FILE, certPem, "utf8");
  console.log(`\n🎉 Certificate saved to ${CERT_PEM_FILE}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
