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

/* ---------- paths & fs helpers ---------- */

const ROOT_DIR = path.join(process.cwd(), "tmp");
const ACCOUNT_KEY_FILE = path.join(ROOT_DIR, "account-key.json"); // account is global

function safeName(s: string): string {
  // keep readable, avoid filesystem-problematic chars; map '*' to 'wildcard'
  return s.replace(/\*/g, "wildcard").replace(/[^\w.-]/g, "_");
}

function domainPaths(env: "staging" | "production", domain: string) {
  const dir = path.join(ROOT_DIR, env, safeName(domain));
  return {
    DIR: dir,
    ORDER_FILE: path.join(dir, "order.json"),
    CERT_KEY_FILE: path.join(dir, "cert-key.json"),
    CERT_CSR_FILE: path.join(dir, "cert.csr.pem"),
    CERT_PEM_FILE: path.join(dir, "cert.pem"),
  };
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

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
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(v, null, 2), "utf8");
}

/* ---------- account key I/O (global) ---------- */

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
  await ensureDir(path.dirname(ACCOUNT_KEY_FILE));
  const privateJwk = await exportJWK(keys.privateKey);
  const publicJwk = await exportJWK(keys.publicKey);
  await writeJson(ACCOUNT_KEY_FILE, { privateJwk, publicJwk });
}

/* ---------- cert key / csr I/O (per-domain) ---------- */

async function saveCertKeys(file: string, keys: CryptoKeyPair) {
  if (!keys.privateKey) throw new Error("No private key to save");
  await ensureDir(path.dirname(file));
  const jwk = await exportJWK(keys.privateKey);
  await writeJson(file, jwk);
}

async function loadCertPrivateKey(file: string): Promise<webcrypto.CryptoKey | Uint8Array<ArrayBufferLike> | null> {
  try {
    const jwk = await readJson<JWK>(file);
    return await importJWK(jwk, (jwk.alg as any) ?? "ES256");
  } catch {
    return null;
  }
}

async function saveCSR(file: string, pem: string) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, pem, "utf8");
}

/* ---------- order I/O (per-domain) ---------- */

type StoredOrder = {
  url: string;
  finalize: string;
  certificate?: string | undefined;
  status?: ACMEOrder["status"] | undefined;
};

async function saveOrder(file: string, o: StoredOrder) {
  await writeJson(file, o);
}

async function loadOrder(file: string): Promise<StoredOrder | null> {
  try {
    return await readJson<StoredOrder>(file);
  } catch {
    return null;
  }
}

/* ---------- polling ---------- */

async function waitOrderStatus(client: ACMEClient, url: string): Promise<ACMEOrder> {
  const updated = await client.fetchResource<ACMEOrder>(url);
  console.log("Order status:", updated.status);
  if (updated.status === "ready" || updated.status === "valid" || updated.status === "invalid") {
    return updated;
  }
  await new Promise((r) => setTimeout(r, 5000));
  return waitOrderStatus(client, url);
}

/* ---------- main ---------- */

async function main() {
  const env = await select({
    message: "Select ACME environment:",
    choices: [
      { name: "Let's Encrypt STAGING (test, no trusted certs)", value: "staging" },
      { name: "Let's Encrypt PRODUCTION (real trusted certs)", value: "production" },
    ],
  }) as "staging" | "production";

  const directoryUrl =
    env === "staging"
      ? directory.letsencrypt.staging.directoryUrl
      : directory.letsencrypt.production.directoryUrl;

  const commonName = await input({ message: "Enter domain name:" });
  const client = new ACMEClient(directoryUrl);

  const paths = domainPaths(env, commonName);
  await ensureDir(paths.DIR);

  // fast path: certificate already exists for this env/domain
  if (await fileExists(paths.CERT_PEM_FILE)) {
    console.log(`✅ Certificate already exists at ${paths.CERT_PEM_FILE}. Nothing to do.`);
    return;
  }

  // account: load or create (global)
  let accountKeys = await loadAccountKeys();
  if (!accountKeys) {
    console.log("🔑 Generating new account key (ES256)...");
    accountKeys = await generateKeyPair("ES256", { extractable: true });
    await saveAccountKeys(accountKeys);
  }
  client.setAccount(accountKeys);
  await client.createAccount();

  // resume from domain-specific order if any
  const existingOrder = await loadOrder(paths.ORDER_FILE);
  if (existingOrder) {
    console.log(`ℹ️ Found existing order for ${commonName}: ${existingOrder.url}`);

    if (existingOrder.certificate) {
      console.log("⏳ Downloading certificate from stored URL...");
      const certPem = await client.downloadCertificate(existingOrder.certificate);
      await fs.writeFile(paths.CERT_PEM_FILE, certPem, "utf8");
      console.log(`🎉 Certificate saved to ${paths.CERT_PEM_FILE}`);
      return;
    }

    const polled = await waitOrderStatus(client, existingOrder.url);
    await saveOrder(paths.ORDER_FILE, {
      url: polled.url,
      finalize: polled.finalize,
      certificate: polled.certificate,
      status: polled.status,
    });

    if (polled.status === "valid" && polled.certificate) {
      console.log("⏳ Downloading certificate...");
      const certPem = await client.downloadCertificate(polled.certificate);
      await fs.writeFile(paths.CERT_PEM_FILE, certPem, "utf8");
      console.log(`🎉 Certificate saved to ${paths.CERT_PEM_FILE}`);
      return;
    }

    if (polled.status === "ready") {
      console.log("🔧 Order is READY. Proceeding to finalize...");

      // load or generate CSR
      let certPriv = await loadCertPrivateKey(paths.CERT_KEY_FILE);
      let csrPem: string | null = (await fileExists(paths.CERT_CSR_FILE))
        ? await fs.readFile(paths.CERT_CSR_FILE, "utf8")
        : null;

      let derBase64Url: string;
      if (!certPriv || !csrPem) {
        console.log("🔑 Generating certificate key + CSR...");
        const csr = await createAcmeCsr([commonName], {
          kind: "ec",
          namedCurve: "P-256",
          hash: "SHA-256",
        });
        await saveCertKeys(paths.CERT_KEY_FILE, csr.keys);
        await saveCSR(paths.CERT_CSR_FILE, csr.pem);
        derBase64Url = csr.derBase64Url;
      } else {
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
      await saveOrder(paths.ORDER_FILE, {
        url: finalized.url,
        finalize: finalized.finalize,
        certificate: finalized.certificate,
        status: finalized.status,
      });

      const valid = await waitOrderStatus(client, finalized.url);
      await saveOrder(paths.ORDER_FILE, {
        url: valid.url,
        finalize: valid.finalize,
        certificate: valid.certificate,
        status: valid.status,
      });

      if (!valid.certificate) throw new Error("Order is valid but certificate URL is missing");

      console.log("⏳ Downloading certificate...");
      const certPem = await client.downloadCertificate(valid.certificate);
      await fs.writeFile(paths.CERT_PEM_FILE, certPem, "utf8");
      console.log(`🎉 Certificate saved to ${paths.CERT_PEM_FILE}`);
      return;
    }

    if (polled.status === "invalid") {
      console.error("❌ Stored order is invalid. Will start a new order.");
      // fallthrough to fresh flow
    }
  }

  // fresh flow
  console.log(`\nCreating order for: ${commonName}`);
  const order = await client.createOrder([{ type: "dns", value: commonName }]);
  console.log("✅ Order created:", order);
  await saveOrder(paths.ORDER_FILE, {
    url: order.url,
    finalize: order.finalize,
    status: order.status,
  });

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
  await saveOrder(paths.ORDER_FILE, {
    url: ready.url,
    finalize: ready.finalize,
    certificate: ready.certificate,
    status: ready.status,
  });

  if (ready.status === "invalid") throw new Error("Order failed");
  if (ready.status === "valid" && ready.certificate) {
    console.log("⏳ Downloading certificate (order already valid)...");
    const certPem = await client.downloadCertificate(ready.certificate);
    await fs.writeFile(paths.CERT_PEM_FILE, certPem, "utf8");
    console.log(`🎉 Certificate saved to ${paths.CERT_PEM_FILE}`);
    return;
  }

  console.log("\n🔑 Generating certificate key + CSR...");
  const { pem: csrPem, derBase64Url, keys: certKeys } = await createAcmeCsr(
    [commonName],
    { kind: "ec", namedCurve: "P-256", hash: "SHA-256" },
  );
  await saveCertKeys(paths.CERT_KEY_FILE, certKeys);
  await saveCSR(paths.CERT_CSR_FILE, csrPem);

  console.log("⏳ Finalizing order...");
  const finalized = await client.finalizeOrder(ready.finalize, derBase64Url);
  await saveOrder(paths.ORDER_FILE, {
    url: finalized.url,
    finalize: finalized.finalize,
    certificate: finalized.certificate,
    status: finalized.status,
  });

  const validOrder = await waitOrderStatus(client, finalized.url);
  await saveOrder(paths.ORDER_FILE, {
    url: validOrder.url,
    finalize: validOrder.finalize,
    certificate: validOrder.certificate,
    status: validOrder.status,
  });

  if (!validOrder.certificate) throw new Error("No certificate URL in order");
  console.log("⏳ Downloading certificate...");
  const certPem = await client.downloadCertificate(validOrder.certificate);
  await fs.writeFile(paths.CERT_PEM_FILE, certPem, "utf8");
  console.log(`\n🎉 Certificate saved to ${paths.CERT_PEM_FILE}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
