/**
 * An encrypted backup file (roadmap Wave 18 part 3). WebCrypto only: no dependency, nothing leaves
 * the device, and nothing here talks to any server.
 *
 * The file is a small JSON document, so it survives being emailed, synced or opened in a text editor:
 *
 *   { format, version, kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt }, cipher: { name: "AES-GCM", iv }, data }
 *
 * `data` is the AES-256-GCM ciphertext (with its 128-bit tag) of the backup, as base64. The key is
 * PBKDF2-HMAC-SHA-256 of the NFKC-normalised passphrase with a random 16-byte salt and 600,000 rounds.
 * Every file gets its own random salt and a random 12-byte IV. The whole header is bound to the
 * ciphertext as GCM additional data, so changing ANY byte of the file (header, salt, IV, data) makes
 * decryption fail rather than produce something different.
 *
 * Failing closed: a wrong passphrase and a changed file are the SAME failure with the SAME words, so a
 * stranger learns nothing about which it was, and nothing about the contents (only the file's size is
 * visible). The passphrase is never stored, logged, put in an error, or kept after use.
 */
import { z } from 'zod';
import { IcsSubscriptionUrlSchema } from '@/lib/schemas/settings';
import { refuseIfHostile, refuseIfTooLarge } from './guard';
import type { LeftOutItem } from './types';

export const ENCRYPTED_FORMAT = 'chrono-kata-encrypted-backup';
export const ENCRYPTED_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
/** Bounds for a file's iteration count: a hostile file must not make the device compute for minutes. */
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 2_000_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const MIN_PASSPHRASE_CHARS = 8;

/** The one thing said about a file that will not open, whether the passphrase or the file is at fault. */
export const CANNOT_OPEN =
  "That passphrase doesn't open this file, or the file has been changed. Nothing on this device was changed.";

/** What an encrypted backup can carry that a plain one never does. */
export const BackupSecretsSchema = z.object({
  /** Provider name -> key, for providers set up in the browser. */
  llmApiKeys: z.record(z.string().max(100), z.string().max(2000)).default({}),
  googleToken: z
    .object({
      id: z.literal('google'),
      accessToken: z.string().max(5000),
      refreshToken: z.string().max(5000).optional(),
      expiresAt: z.coerce.date(),
    })
    .nullable()
    .default(null),
  icsSubscriptionUrl: IcsSubscriptionUrlSchema.nullable().default(null),
});
export type BackupSecrets = z.infer<typeof BackupSecretsSchema>;

export function hasAnySecret(secrets: BackupSecrets | null | undefined): boolean {
  return !!secrets && (Object.keys(secrets.llmApiKeys).length > 0 || secrets.googleToken !== null || secrets.icsSubscriptionUrl !== null);
}

// ---------------------------------------------------------------------------------------------
// bytes <-> base64 (chunked, so a large backup does not overflow the call stack)

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A byte array backed by a plain ArrayBuffer, which is what WebCrypto's types ask for. */
type Bytes = Uint8Array<ArrayBuffer>;

export function fromBase64(text: string): Bytes | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  try {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// the primitives (deterministic given salt and IV: this is what the known-answer tests pin)

interface Header {
  format: typeof ENCRYPTED_FORMAT;
  version: typeof ENCRYPTED_VERSION;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
}

/** The bytes bound to the ciphertext as additional data: the header in one fixed spelling. */
function headerBytes(header: Header): Bytes {
  const { format, version, kdf, cipher } = header;
  return new TextEncoder().encode(
    JSON.stringify({ format, version, kdf: { name: kdf.name, hash: kdf.hash, iterations: kdf.iterations, salt: kdf.salt }, cipher: { name: cipher.name, iv: cipher.iv } }),
  );
}

function subtle(): SubtleCrypto | null {
  return typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle ? globalThis.crypto.subtle : null;
}

export function normalisePassphrase(passphrase: string): string {
  return passphrase.normalize('NFKC');
}

export async function deriveKey(passphrase: string, salt: Bytes, iterations: number, usage: KeyUsage[]): Promise<CryptoKey> {
  const s = subtle()!;
  const material = await s.importKey('raw', new TextEncoder().encode(normalisePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, usage);
}

/** Seal bytes with a given salt and IV. Callers outside the tests use `encryptBackup`, which draws them at random. */
export async function sealBytes(
  plaintext: Bytes,
  passphrase: string,
  params: { salt: Bytes; iv: Bytes; iterations: number },
): Promise<string> {
  const header: Header = {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: params.iterations, salt: toBase64(params.salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(params.iv) },
  };
  const key = await deriveKey(passphrase, params.salt, params.iterations, ['encrypt']);
  const sealed = await subtle()!.encrypt({ name: 'AES-GCM', iv: params.iv, additionalData: headerBytes(header), tagLength: 128 }, key, plaintext);
  return JSON.stringify({ ...header, data: toBase64(new Uint8Array(sealed)) });
}

// ---------------------------------------------------------------------------------------------
// the public surface

export function encryptionAvailable(): boolean {
  return subtle() !== null && typeof globalThis.crypto.getRandomValues === 'function';
}

export type EncryptOutcome = { ok: true; text: string } | { ok: false; message: string };

/** `backup` is the envelope as JSON-able data; `secrets` only when the person ticked the box. */
export async function encryptBackup(
  backup: unknown,
  passphrase: string,
  options: { secrets?: BackupSecrets | null; iterations?: number } = {},
): Promise<EncryptOutcome> {
  if (!encryptionAvailable()) return { ok: false, message: "Encryption isn't available in this browser, so no file was made." };
  if ([...normalisePassphrase(passphrase)].length < MIN_PASSPHRASE_CHARS) {
    return { ok: false, message: `A passphrase needs at least ${MIN_PASSPHRASE_CHARS} characters.` };
  }
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  // (A file with fewer rounds than the reader accepts could never be opened again.)
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return { ok: false, message: 'The backup could not be encrypted, so no file was made.' };
  const plain = JSON.stringify(options.secrets && hasAnySecret(options.secrets) ? { backup, secrets: options.secrets } : { backup });
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  try {
    return { ok: true, text: await sealBytes(new TextEncoder().encode(plain), passphrase, { salt, iv, iterations }) };
  } catch {
    return { ok: false, message: 'The backup could not be encrypted, so no file was made.' };
  }
}

/** True for text that claims to be an encrypted backup (it may still not open). Never throws. */
export function isEncryptedBackup(text: string): boolean {
  if (!refuseIfTooLarge(text.length).ok || !text.includes(ENCRYPTED_FORMAT)) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && (parsed as Record<string, unknown>).format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

const FileSchema = z
  .object({
    format: z.literal(ENCRYPTED_FORMAT),
    version: z.literal(ENCRYPTED_VERSION),
    kdf: z
      .object({
        name: z.literal('PBKDF2'),
        hash: z.literal('SHA-256'),
        iterations: z.number().int().min(MIN_ITERATIONS).max(MAX_ITERATIONS),
        salt: z.string().max(100),
      })
      .strict(),
    cipher: z.object({ name: z.literal('AES-GCM'), iv: z.string().max(100) }).strict(),
    data: z.string().min(1),
  })
  .strict();

export type DecryptOutcome =
  | { ok: true; backup: unknown; secrets: BackupSecrets | null }
  | { ok: false; message: string };

/**
 * Open an encrypted backup. Every failure that could be the passphrase or a changed file is the one
 * message `CANNOT_OPEN`; a file that cannot be an encrypted backup at all, or a version this app does not
 * know, says so (those reveal nothing about any contents).
 */
export async function decryptBackup(text: string, passphrase: string): Promise<DecryptOutcome> {
  if (!encryptionAvailable()) return { ok: false, message: "Encryption isn't available in this browser, so this file can't be opened here. Nothing on this device was changed." };
  const tooLarge = refuseIfTooLarge(text.length);
  if (!tooLarge.ok) return { ok: false, message: `${tooLarge.error} Nothing on this device was changed.` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file isn't a Chrono Kata backup. Nothing on this device was changed." };
  }
  const hostile = refuseIfHostile(raw);
  if (!hostile.ok) return { ok: false, message: `${hostile.error} Nothing on this device was changed.` };
  if (typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).format === ENCRYPTED_FORMAT && (raw as Record<string, unknown>).version !== ENCRYPTED_VERSION) {
    return { ok: false, message: 'This encrypted backup was made by a version of the app that this one does not know. Nothing on this device was changed.' };
  }
  const file = FileSchema.safeParse(raw);
  if (!file.success) return { ok: false, message: "This file isn't a Chrono Kata backup. Nothing on this device was changed." };

  const salt = fromBase64(file.data.kdf.salt);
  const iv = fromBase64(file.data.cipher.iv);
  const data = fromBase64(file.data.data);
  if (!salt || !iv || !data || salt.length !== SALT_BYTES || iv.length !== IV_BYTES || data.length < 16) return { ok: false, message: CANNOT_OPEN };

  let plain: Bytes;
  try {
    const key = await deriveKey(passphrase, salt, file.data.kdf.iterations, ['decrypt']);
    const header: Header = { format: file.data.format, version: file.data.version, kdf: file.data.kdf, cipher: file.data.cipher };
    plain = new Uint8Array(await subtle()!.decrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(header), tagLength: 128 }, key, data));
  } catch {
    return { ok: false, message: CANNOT_OPEN };
  }

  let inner: unknown;
  try {
    inner = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  } catch {
    return { ok: false, message: CANNOT_OPEN };
  }
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner) || !('backup' in inner)) return { ok: false, message: CANNOT_OPEN };
  const { backup, secrets } = inner as { backup: unknown; secrets?: unknown };
  let parsedSecrets: BackupSecrets | null = null;
  if (secrets !== undefined) {
    const result = BackupSecretsSchema.safeParse(secrets);
    if (!result.success) return { ok: false, message: CANNOT_OPEN };
    parsedSecrets = hasAnySecret(result.data) ? result.data : null;
  }
  return { ok: true, backup, secrets: parsedSecrets };
}

/**
 * The report of what a file leaves out, minus what an encrypted file carries after all: a ticked box
 * means the keys, the sign-in and the calendar link are INSIDE the file, so it must not say they are not.
 */
export function withoutIncludedSecrets(leftOut: readonly LeftOutItem[] | undefined, secrets: BackupSecrets | null): LeftOutItem[] {
  if (!secrets) return [...(leftOut ?? [])];
  const carried = new Set<string>();
  if (Object.keys(secrets.llmApiKeys).length > 0) carried.add('llmSettings.apiKey');
  if (secrets.googleToken) carried.add('tokens');
  if (secrets.icsSubscriptionUrl) carried.add('settings.icsSubscriptionUrl');
  return (leftOut ?? []).filter((item) => !carried.has(item.id));
}

/** "2 API keys, your Google Calendar sign-in and your private calendar link" */
export function describeSecrets(secrets: BackupSecrets): string {
  const keys = Object.keys(secrets.llmApiKeys).length;
  const parts = [
    ...(keys > 0 ? [`${keys} API key${keys === 1 ? '' : 's'}`] : []),
    ...(secrets.googleToken ? ['your Google Calendar sign-in'] : []),
    ...(secrets.icsSubscriptionUrl ? ['your private calendar link'] : []),
  ];
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
