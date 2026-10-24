/**
 * The encrypted backup file (Wave 18 part 3): known answers from an independent implementation, random
 * salt and IV per file, and failing closed on a wrong passphrase and on every changed byte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackupSecretsSchema,
  CANNOT_OPEN,
  ENCRYPTED_FORMAT,
  IV_BYTES,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  decryptBackup,
  encryptBackup,
  fromBase64,
  isEncryptedBackup,
  normalisePassphrase,
  sealBytes,
  toBase64,
  type BackupSecrets,
} from '@/lib/data-transfer/encrypted';
import { MAX_BACKUP_CHARS } from '@/lib/data-transfer/guard';

afterEach(() => vi.restoreAllMocks());

const utf8 = (text: string) => new TextEncoder().encode(text);
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('hex');

const PLAIN = '{"backup":{"hello":"wörld ✓"}}';
const SALT = Uint8Array.from({ length: 16 }, (_, i) => i);
const IV = Uint8Array.from({ length: 12 }, (_, i) => 100 + i);

/**
 * Made with Python: hashlib.pbkdf2_hmac('sha256', NFKC(passphrase), salt, iterations, 32) and
 * cryptography's AESGCM with the header (compact JSON, in this order) as the additional data.
 * NOT produced by this code, so a mistake in the derivation, the key size, the tag, the additional
 * data or the encoding here cannot also be in the expectation.
 */
const VECTORS = [
  {
    name: 'A: 100,000 rounds',
    passphrase: 'correct horse battery staple',
    iterations: 100_000,
    file: '{"format":"chrono-kata-encrypted-backup","version":1,"kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":100000,"salt":"AAECAwQFBgcICQoLDA0ODw=="},"cipher":{"name":"AES-GCM","iv":"ZGVmZ2hpamtsbW5v"},"data":"kZ/z6deEvr/bkra49/amT0G56Tdl4fZ36x8LcZHOxZHt84sgQVRl3GY8Fhv2ziHyJw=="}',
  },
  {
    name: 'B: 600,000 rounds, a passphrase typed with combining marks and a no-break space',
    passphrase: 'Zoë-pässphrase x',
    iterations: 600_000,
    file: '{"format":"chrono-kata-encrypted-backup","version":1,"kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":600000,"salt":"AAECAwQFBgcICQoLDA0ODw=="},"cipher":{"name":"AES-GCM","iv":"ZGVmZ2hpamtsbW5v"},"data":"VCMlNQbz1ozSDLb49uc4ZQ4+F7koPkQdOQ4NAnlo811OK4M6p5MfRk21a5tiiuM+4Q=="}',
  },
];

describe('known answers', () => {
  for (const v of VECTORS) {
    it(`seals exactly what an independent implementation seals (${v.name})`, async () => {
      expect(await sealBytes(utf8(PLAIN), v.passphrase, { salt: SALT, iv: IV, iterations: v.iterations })).toBe(v.file);
    });

    it(`opens that file (${v.name})`, async () => {
      const opened = await decryptBackup(v.file, v.passphrase);
      expect(opened).toEqual({ ok: true, backup: { hello: 'wörld ✓' }, secrets: null });
    });
  }

  it('treats the same passphrase typed in a different Unicode form as the same passphrase (NFKC)', async () => {
    const composed = 'Zoë-pässphrase x'; // precomposed letters, an ordinary space
    expect(await decryptBackup(VECTORS[1]!.file, composed)).toMatchObject({ ok: true });
    expect(normalisePassphrase('ｐａｓｓｗｏｒｄ１２')).toBe('password12');
  });

  it('the platform\'s AES-GCM matches NIST SP 800-38D test case 4 (ciphertext, then the 16-byte tag)', async () => {
    const key = await crypto.subtle.importKey('raw', hex('feffe9928665731c6d6a8f9467308308'), 'AES-GCM', false, ['encrypt']);
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: hex('cafebabefacedbaddecaf888'), additionalData: hex('feedfacedeadbeeffeedfacedeadbeefabaddad2'), tagLength: 128 },
      key,
      hex('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39'),
    );
    expect(toHex(sealed)).toBe(
      '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091' + '5bc94fbc3221a5db94fae95ae7121a47',
    );
  });

  it('the platform\'s PBKDF2-HMAC-SHA-256 matches the published vectors', async () => {
    const material = await crypto.subtle.importKey('raw', utf8('password'), 'PBKDF2', false, ['deriveBits']);
    const bits = (iterations: number) => crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: utf8('salt'), iterations }, material, 256);
    expect(toHex(await bits(1))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(toHex(await bits(2))).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
    expect(toHex(await bits(4096))).toBe('c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
  });
});

describe('a file made by encryptBackup', () => {
  const backup = { sessions: [{ id: 'one', title: 'PRIVATE-TITLE-7d3' }], note: 'PRIVATE-NOTE-19c' };

  it('has exactly the documented shape, the default 600,000 rounds, a 16-byte salt and a 12-byte IV', async () => {
    const made = await encryptBackup(backup, 'a long enough passphrase');
    if (!made.ok) throw new Error(made.message);
    const file = JSON.parse(made.text);
    expect(Object.keys(file)).toEqual(['format', 'version', 'kdf', 'cipher', 'data']);
    expect(file.format).toBe(ENCRYPTED_FORMAT);
    expect(file.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(fromBase64(file.kdf.salt)!.length).toBe(SALT_BYTES);
    expect(fromBase64(file.cipher.iv)!.length).toBe(IV_BYTES);
    expect(isEncryptedBackup(made.text)).toBe(true);
  });

  it('opens with the passphrase and gives back exactly what went in', async () => {
    const made = await encryptBackup(backup, 'a long enough passphrase');
    if (!made.ok) throw new Error(made.message);
    expect(await decryptBackup(made.text, 'a long enough passphrase')).toEqual({ ok: true, backup, secrets: null });
  });

  it('shows nothing of the contents: no word of the backup, not even its field names, is in the file', async () => {
    const made = await encryptBackup(backup, 'a long enough passphrase');
    if (!made.ok) throw new Error(made.message);
    // (not 'backup': the format's own name says that)
    for (const word of ['PRIVATE', 'sessions', 'title', 'note', 'secrets', 'one']) expect(made.text, word).not.toContain(word);
  });

  it('draws a new salt and a new IV for every file (60 files of the same backup, none alike)', async () => {
    const files = [];
    for (let i = 0; i < 60; i += 1) {
      const made = await encryptBackup(backup, 'a long enough passphrase', { iterations: MIN_ITERATIONS });
      if (!made.ok) throw new Error(made.message);
      files.push(JSON.parse(made.text));
    }
    expect(new Set(files.map((f) => f.kdf.salt)).size).toBe(60);
    expect(new Set(files.map((f) => f.cipher.iv)).size).toBe(60);
    expect(new Set(files.map((f) => f.data)).size).toBe(60);
  });
});

describe('failing closed', () => {
  const PASS = 'the right passphrase';
  let sealed: string;
  const make = async () => {
    if (sealed) return sealed;
    const made = await encryptBackup({ sessions: [], n: 'x'.repeat(40) }, PASS, { iterations: MIN_ITERATIONS + 20_000 }); // so one more and one fewer are both in range
    if (!made.ok) throw new Error(made.message);
    sealed = made.text;
    return sealed;
  };
  const edit = (text: string, change: (file: any) => void) => {
    const file = JSON.parse(text);
    change(file);
    return JSON.stringify(file);
  };
  const flip = (b64: string, index: number) => {
    const bytes = fromBase64(b64)!;
    bytes[index] = bytes[index]! ^ 0x01;
    return toBase64(bytes);
  };

  it('a wrong passphrase, in every way of being wrong, is the one message', async () => {
    const text = await make();
    for (const wrong of ['the wrong passphrase', '', ' ', PASS + ' ', PASS.toUpperCase(), PASS.slice(1), 'x'.repeat(10_000)]) {
      expect(await decryptBackup(text, wrong), JSON.stringify(wrong.slice(0, 20))).toEqual({ ok: false, message: CANNOT_OPEN });
    }
  });

  it('changing ANY single byte of the salt, the IV or the ciphertext (tag included) is refused, with the same message', async () => {
    const text = await make();
    const file = JSON.parse(text);
    const parts: ['kdf' | 'cipher' | 'data', string][] = [['kdf', 'salt'], ['cipher', 'iv'], ['data', '']];
    let tried = 0;
    for (const [outer, inner] of parts) {
      const original: string = inner ? file[outer][inner] : file[outer];
      for (let i = 0; i < fromBase64(original)!.length; i += 1) {
        const changed = edit(text, (f) => {
          if (inner) f[outer][inner] = flip(original, i);
          else f[outer] = flip(original, i);
        });
        expect(await decryptBackup(changed, PASS), `${outer}.${inner} byte ${i}`).toEqual({ ok: false, message: CANNOT_OPEN });
        tried += 1;
      }
    }
    expect(tried).toBeGreaterThan(60); // salt 16 + iv 12 + the data (message and 16-byte tag)
  });

  it('changing the number of rounds, adding or cutting a byte, or swapping the parts is refused', async () => {
    const text = await make();
    const file = JSON.parse(text);
    const cases: Record<string, (f: any) => void> = {
      'one more round': (f) => { f.kdf.iterations += 1; },
      'one fewer round': (f) => { f.kdf.iterations -= 1; },
      'a byte cut from the end': (f) => { f.data = toBase64(fromBase64(f.data)!.slice(0, -1)); },
      'a byte added': (f) => { f.data = toBase64(Uint8Array.from([...fromBase64(f.data)!, 0])); },
      'the first byte cut': (f) => { f.data = toBase64(fromBase64(f.data)!.slice(1)); },
      'salt and IV swapped (padded to length)': (f) => { const s = f.kdf.salt; f.kdf.salt = toBase64(Uint8Array.from([...fromBase64(f.cipher.iv)!, 0, 0, 0, 0])); f.cipher.iv = toBase64(fromBase64(s)!.slice(0, 12)); },
    };
    for (const [name, change] of Object.entries(cases)) {
      expect(await decryptBackup(edit(text, change), PASS), name).toEqual({ ok: false, message: CANNOT_OPEN });
    }
    // another file's ciphertext under this file's header
    const other = await encryptBackup({ sessions: [] }, PASS, { iterations: MIN_ITERATIONS });
    if (!other.ok) throw new Error(other.message);
    expect(await decryptBackup(JSON.stringify({ ...file, data: JSON.parse(other.text).data }), PASS)).toEqual({ ok: false, message: CANNOT_OPEN });
  });

  it('a ciphertext that was made without binding the header is refused (the header is authenticated)', async () => {
    const file = JSON.parse(await make());
    const salt = fromBase64(file.kdf.salt)!;
    const iv = fromBase64(file.cipher.iv)!;
    const material = await crypto.subtle.importKey('raw', utf8(PASS), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: file.kdf.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const unbound = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, utf8('{"backup":{}}'));
    expect(await decryptBackup(JSON.stringify({ ...file, data: toBase64(new Uint8Array(unbound)) }), PASS)).toEqual({ ok: false, message: CANNOT_OPEN });
  });

  it('a correct ciphertext with a payload that is not a backup is the same refusal, and reveals nothing', async () => {
    const salt = SALT; const iv = IV;
    for (const payload of ['not json', '[]', '{"nothing":1}', '"text"', '{"backup":1,"secrets":{"llmApiKeys":5}}']) {
      const text = await sealBytes(utf8(payload), PASS, { salt, iv, iterations: MIN_ITERATIONS });
      expect(await decryptBackup(text, PASS), payload).toEqual({ ok: false, message: CANNOT_OPEN });
    }
  });

  it('wrong passphrase and changed file say the same words, and the words contain nothing from the file', async () => {
    const text = await make();
    const wrong = await decryptBackup(text, 'nope nope nope');
    const changed = await decryptBackup(edit(text, (f) => { f.data = flip(f.data, 0); }), PASS);
    expect(wrong).toEqual(changed);
    expect(CANNOT_OPEN).not.toMatch(/xxxx|sessions|backup file/i);
    expect(CANNOT_OPEN).toMatch(/Nothing on this device was changed\.$/);
  });
});

describe('a file that is not what it says', () => {
  const header = (over: Record<string, unknown> = {}) => ({
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: toBase64(SALT) },
    cipher: { name: 'AES-GCM', iv: toBase64(IV) },
    data: toBase64(new Uint8Array(40)),
    ...over,
  });
  const refused = async (value: unknown) => decryptBackup(typeof value === 'string' ? value : JSON.stringify(value), 'any passphrase');

  it('meets text that is not JSON, and shapes that are not an object, with the one sentence and no hint of why', async () => {
    for (const text of ['', 'hello', '{', '[]', 'null', '12', '"x"', '{"format":"chrono-kata-encrypted-backup","ver']) {
      expect(await refused(text), JSON.stringify(text)).toEqual({ ok: false, message: CANNOT_OPEN });
    }
  });

  it('meets a file cut off anywhere with the one sentence', async () => {
    const made = await encryptBackup({ sessions: [] }, 'long enough passphrase', { iterations: MIN_ITERATIONS });
    if (!made.ok) throw new Error(made.message);
    for (const cut of [1, 20, 60, 120, made.text.length - 30, made.text.length - 2, made.text.length - 1]) {
      expect(await decryptBackup(made.text.slice(0, cut), 'long enough passphrase'), `cut at ${cut}`).toEqual({ ok: false, message: CANNOT_OPEN });
    }
  });

  it('meets extra, missing and mistyped fields with the one sentence', async () => {
    const bad: unknown[] = [
      header({ extra: 1 }),
      header({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: toBase64(SALT), more: 1 } }),
      header({ kdf: { name: 'PBKDF2', hash: 'SHA-1', iterations: 600_000, salt: toBase64(SALT) } }),
      header({ kdf: { name: 'scrypt', hash: 'SHA-256', iterations: 600_000, salt: toBase64(SALT) } }),
      header({ cipher: { name: 'AES-CBC', iv: toBase64(IV) } }),
      header({ data: '' }),
      header({ data: 7 }),
      (() => { const h = header(); delete (h as any).cipher; return h; })(),
      (() => { const h = header(); delete (h as any).kdf; return h; })(),
    ];
    for (const value of bad) expect(await refused(value)).toEqual({ ok: false, message: CANNOT_OPEN });
  });

  it('refuses a number of rounds outside what a backup can use, BEFORE computing anything', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    for (const iterations of [0, 1, MIN_ITERATIONS - 1, MAX_ITERATIONS + 1, 1e12, 600000.5, '600000', null, -5]) {
      const result = await refused(header({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(SALT) } }));
      expect(result.ok, String(iterations)).toBe(false);
    }
    expect(derive).not.toHaveBeenCalled();
  });

  it('refuses malformed base64 and parts of the wrong length with the one message (no oracle for which part)', async () => {
    const bad = [
      header({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: '!!!not base64!!!' } }),
      header({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: toBase64(new Uint8Array(15)) } }),
      header({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: toBase64(new Uint8Array(17)) } }),
      header({ cipher: { name: 'AES-GCM', iv: toBase64(new Uint8Array(11)) } }),
      header({ cipher: { name: 'AES-GCM', iv: toBase64(new Uint8Array(16)) } }),
      header({ data: 'AAA' }),
      header({ data: toBase64(new Uint8Array(10)) }), // shorter than a tag
    ];
    for (const value of bad) expect(await refused(value)).toEqual({ ok: false, message: CANNOT_OPEN });
  });

  it('says plainly when the version is one this app does not know', async () => {
    const result = await refused(header({ version: 2 }));
    expect(result).toEqual({ ok: false, message: 'This encrypted backup was made by a version of the app that this one does not know. Nothing on this device was changed.' });
  });

  it('refuses a __proto__ key and text longer than a backup can be', async () => {
    const poisoned = '{"format":"chrono-kata-encrypted-backup","__proto__":{"x":1}}';
    expect((await refused(poisoned)).ok).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    const huge = await decryptBackup('x'.repeat(MAX_BACKUP_CHARS + 1), 'p');
    expect(huge).toEqual({ ok: false, message: expect.stringMatching(/larger than a backup can be.*Nothing on this device was changed\.$/) });
  });

  it('tells an encrypted backup from everything else without throwing', () => {
    expect(isEncryptedBackup(JSON.stringify(header()))).toBe(true);
    for (const text of ['', 'nope', '{"version":2,"sessions":[]}', '[]', 'null', `${ENCRYPTED_FORMAT}`, '{"format":"other"}', `{"version":2,"note":"${ENCRYPTED_FORMAT}"}`]) {
      expect(isEncryptedBackup(text), text.slice(0, 30)).toBe(false);
    }
    // A file that begins as ours does is treated as ours even if it is cut short: it gets the prompt and the one sentence.
    expect(isEncryptedBackup(`{"format":"${ENCRYPTED_FORMAT}","ver`)).toBe(true);
    expect(isEncryptedBackup(`  {\n  "format" : "${ENCRYPTED_FORMAT}", "version": 1 }`)).toBe(true);
    expect(isEncryptedBackup('x'.repeat(MAX_BACKUP_CHARS + 1))).toBe(false);
  });
});

describe('what the file shows', () => {
  it('holds no field name and no word of the data, in the text or in the bytes (a full seeded dataset, sealed with a fixed salt and IV so the check never depends on luck)', async () => {
    const { buildDataset } = await import('./oracle/dataset');
    const { primaryKeys } = await import('./oracle/harness');
    const data = buildDataset(77, 'full', primaryKeys());
    const plain = JSON.stringify({ backup: data });
    const names = new Set<string>(['tasks', 'title', 'journal', 'sessions', 'projects', 'habits', 'dayPlans', 'reviews', 'settings', 'llmSettings']);
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (k.length >= 5) names.add(k);
          walk(v);
        }
      }
    };
    walk(data);
    expect(names.size).toBeGreaterThan(80);
    expect(plain).toContain('journal'); // the words really are in the plaintext
    const file = await sealBytes(utf8(plain), 'a long enough passphrase', { salt: SALT, iv: IV, iterations: MIN_ITERATIONS });
    const parsed = JSON.parse(file) as { data: string };
    const bytes = Buffer.from(fromBase64(parsed.data)!).toString('latin1');
    const headerWords = new Set(['format', 'version', 'iterations', 'cipher', 'chrono']); // the header's own words, by name
    const leaked = [...names].filter((n) => !headerWords.has(n) && (file.includes(n) || bytes.includes(n)));
    expect(leaked).toEqual([]);
    // ...and the header is the only readable text.
    expect(Object.keys(JSON.parse(file))).toEqual(['format', 'version', 'kdf', 'cipher', 'data']);
  });
});

describe('the secrets box', () => {
  const secrets: BackupSecrets = {
    llmApiKeys: { openai: 'SECRET-KEY-1', local: 'SECRET-KEY-2' },
    googleToken: { id: 'google', accessToken: 'SECRET-ACCESS', refreshToken: 'SECRET-REFRESH', expiresAt: new Date('2026-12-01T10:20:30.456Z') },
    icsSubscriptionUrl: 'https://calendar.example.org/ical/SECRET-ICS/basic.ics',
  };

  it('puts secrets in the file only when handed them, and gives them back exactly', async () => {
    const without = await encryptBackup({ a: 1 }, 'long enough passphrase', { iterations: MIN_ITERATIONS });
    const withBox = await encryptBackup({ a: 1 }, 'long enough passphrase', { secrets, iterations: MIN_ITERATIONS });
    if (!without.ok || !withBox.ok) throw new Error('encrypt failed');
    expect(await decryptBackup(without.text, 'long enough passphrase')).toEqual({ ok: true, backup: { a: 1 }, secrets: null });
    const opened = await decryptBackup(withBox.text, 'long enough passphrase');
    expect(opened).toEqual({ ok: true, backup: { a: 1 }, secrets });
    for (const text of [without.text, withBox.text]) for (const word of ['SECRET', 'openai', 'google']) expect(text).not.toContain(word);
  });

  it('treats a secrets object with nothing in it as no secrets (nothing is claimed that is not there)', async () => {
    const empty: BackupSecrets = { llmApiKeys: {}, googleToken: null, icsSubscriptionUrl: null };
    const made = await encryptBackup({ a: 1 }, 'long enough passphrase', { secrets: empty, iterations: MIN_ITERATIONS });
    if (!made.ok) throw new Error(made.message);
    expect(await decryptBackup(made.text, 'long enough passphrase')).toEqual({ ok: true, backup: { a: 1 }, secrets: null });
  });

  it('the secrets schema refuses a calendar link that is not https, and anything of the wrong kind', () => {
    expect(BackupSecretsSchema.safeParse({ ...secrets, icsSubscriptionUrl: 'http://x.example/a.ics' }).success).toBe(false);
    expect(BackupSecretsSchema.safeParse({ ...secrets, llmApiKeys: { a: 5 } }).success).toBe(false);
    expect(BackupSecretsSchema.safeParse({ ...secrets, googleToken: { id: 'other' } }).success).toBe(false);
  });
});

describe('the passphrase', () => {
  it('needs at least 8 characters (counted as people count them), and no file is made otherwise', async () => {
    for (const short of ['', 'short', 'seven77']) {
      expect(await encryptBackup({}, short)).toEqual({ ok: false, message: 'A passphrase needs at least 8 characters.' });
    }
    expect((await encryptBackup({}, '🙂🙂🙂🙂🙂🙂🙂', { iterations: MIN_ITERATIONS })).ok).toBe(false); // 7 emoji
    expect((await encryptBackup({}, '🙂🙂🙂🙂🙂🙂🙂🙂', { iterations: MIN_ITERATIONS })).ok).toBe(true); // 8 emoji
    expect((await encryptBackup({}, '        ', { iterations: MIN_ITERATIONS })).ok).toBe(true); // length is the only rule
  });

  it('is never logged, thrown, or written anywhere: not on success, not on any failure', async () => {
    const PASS = 'PASSPHRASE-LEAK-CHECK-9f2c';
    const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const made = await encryptBackup({ a: 1 }, PASS, { iterations: MIN_ITERATIONS });
    if (!made.ok) throw new Error(made.message);
    const outcomes = [
      made,
      await decryptBackup(made.text, PASS),
      await decryptBackup(made.text, `${PASS}x`),
      await decryptBackup(made.text.replace('"data":"', '"data":"A'), PASS),
      await decryptBackup('not json', PASS),
      await encryptBackup({ a: 1 }, 'short'),
    ];
    expect(JSON.stringify(outcomes.map((o) => (o.ok && 'text' in o ? { ...o, text: '[file]' } : o)))).not.toContain('LEAK-CHECK');
    expect(made.text).not.toContain('LEAK-CHECK');
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('LEAK-CHECK');
  });
});

describe('a browser without encryption', () => {
  it('says so calmly, makes no file, and opens nothing', async () => {
    vi.stubGlobal('crypto', {});
    try {
      const made = await encryptBackup({}, 'long enough passphrase');
      expect(made).toEqual({ ok: false, message: "Encryption isn't available in this browser, so no file was made." });
      const opened = await decryptBackup(VECTORS[0]!.file, VECTORS[0]!.passphrase);
      expect(opened.ok).toBe(false);
      if (!opened.ok) expect(opened.message).toMatch(/isn't available in this browser.*Nothing on this device was changed\.$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
