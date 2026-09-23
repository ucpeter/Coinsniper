import type { Connection } from "@solana/web3.js";

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Browser-safe counterpart to base64ToBytes — no Buffer, so this also works client-side. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/** Poll signature status until confirmed/finalized, errored, or timeout. */
export async function pollForConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 25_000,
): Promise<{ confirmed: boolean; error: string | null }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { value } = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      if (value?.err) {
        return { confirmed: false, error: JSON.stringify(value.err) };
      }
      if (
        value?.confirmationStatus === "confirmed" ||
        value?.confirmationStatus === "finalized"
      ) {
        return { confirmed: true, error: null };
      }
    } catch {
      // transient RPC hiccup — keep polling
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { confirmed: false, error: "Confirmation timed out" };
}
