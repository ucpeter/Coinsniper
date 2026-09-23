"use client";

// The burner (trading) wallet keypairs are generated in the browser and
// their secret keys NEVER leave the browser and are NEVER sent to our
// server. Each one is encrypted at rest in localStorage with its own
// passphrase-derived AES-GCM key (PBKDF2, 250k iterations) so that even
// someone with access to the browser's storage can't read the raw key
// without that wallet's passphrase. When "locked", only ciphertext sits in
// localStorage; the decrypted key lives solely in memory for the current
// session, one wallet at a time.
//
// Multiple wallets can be stored side by side; one is marked "active" and
// is the one the bot trades from. Switching the active wallet re-locks —
// only the active wallet's decrypted key is ever held in memory.

const STORAGE_KEY = "snipe.burnerWallet.v1";
const ITERATIONS = 250_000;

export interface StoredBurnerWallet {
  id: string;
  label: string;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
  publicKey: string;
  createdAt: number;
}

interface StoredBurnerStore {
  wallets: StoredBurnerWallet[];
  activeId: string | null;
}

// Shape used before multi-wallet support: a single wallet's fields sat at
// the top level of the stored JSON, with no "wallets" array.
interface LegacyStoredBurner {
  salt: string;
  iv: string;
  ciphertext: string;
  publicKey: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function isLegacyShape(value: unknown): value is LegacyStoredBurner {
  return (
    !!value &&
    typeof value === "object" &&
    "ciphertext" in value &&
    !("wallets" in (value as Record<string, unknown>))
  );
}

function readStore(): StoredBurnerStore {
  if (typeof window === "undefined") return { wallets: [], activeId: null };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { wallets: [], activeId: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { wallets: [], activeId: null };
  }

  // Transparently migrate a pre-multi-wallet single stored wallet so an
  // already-generated wallet isn't orphaned by this upgrade.
  if (isLegacyShape(parsed)) {
    const migrated: StoredBurnerStore = {
      wallets: [
        {
          id: "wallet-1",
          label: "Wallet 1",
          salt: parsed.salt,
          iv: parsed.iv,
          ciphertext: parsed.ciphertext,
          publicKey: parsed.publicKey,
          createdAt: Date.now(),
        },
      ],
      activeId: "wallet-1",
    };
    writeStore(migrated);
    return migrated;
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as StoredBurnerStore).wallets)) {
    const store = parsed as StoredBurnerStore;
    return {
      wallets: store.wallets,
      activeId: store.activeId ?? store.wallets[0]?.id ?? null,
    };
  }

  return { wallets: [], activeId: null };
}

function writeStore(store: StoredBurnerStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listStoredBurnerWallets(): StoredBurnerWallet[] {
  return readStore().wallets;
}

export function getActiveBurnerWalletId(): string | null {
  return readStore().activeId;
}

export function setActiveBurnerWalletId(id: string): void {
  const store = readStore();
  if (!store.wallets.some((w) => w.id === id)) return;
  writeStore({ ...store, activeId: id });
}

export function hasStoredBurnerWallet(): boolean {
  return readStore().wallets.length > 0;
}

export function getStoredBurnerPublicKey(id?: string): string | null {
  const store = readStore();
  const targetId = id ?? store.activeId;
  return store.wallets.find((w) => w.id === targetId)?.publicKey ?? null;
}

export async function encryptAndStoreSecretKey(
  secretKey: Uint8Array,
  publicKey: string,
  passphrase: string,
  label?: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    secretKey as BufferSource,
  );
  const store = readStore();
  const id = crypto.randomUUID();
  const wallet: StoredBurnerWallet = {
    id,
    label: label?.trim() || `Wallet ${store.wallets.length + 1}`,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    publicKey,
    createdAt: Date.now(),
  };
  writeStore({ wallets: [...store.wallets, wallet], activeId: id });
  return id;
}

export async function decryptSecretKey(passphrase: string, id?: string): Promise<Uint8Array> {
  const store = readStore();
  const targetId = id ?? store.activeId;
  const wallet = store.wallets.find((w) => w.id === targetId);
  if (!wallet) throw new Error("No burner wallet stored on this device");
  const salt = fromBase64(wallet.salt);
  const iv = fromBase64(wallet.iv);
  const key = await deriveKey(passphrase, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(wallet.ciphertext) as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Incorrect passphrase");
  }
}

export function clearStoredBurnerWallet(id?: string): void {
  const store = readStore();
  const targetId = id ?? store.activeId;
  const wallets = store.wallets.filter((w) => w.id !== targetId);
  const activeId = store.activeId === targetId ? (wallets[0]?.id ?? null) : store.activeId;
  writeStore({ wallets, activeId });
}
