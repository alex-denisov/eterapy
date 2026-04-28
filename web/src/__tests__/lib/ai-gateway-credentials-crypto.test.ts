import {
  AICredentialEncryptionError,
  decryptSecret,
  encryptSecret,
  generateMasterKeyHex,
  isAICredentialEncryptionConfigured,
} from "@/lib/ai-gateway/credentials-crypto";

const ORIGINAL_KEY = process.env.AI_CREDENTIAL_KEY;

describe("ai-gateway credentials crypto", () => {
  beforeEach(() => {
    process.env.AI_CREDENTIAL_KEY = generateMasterKeyHex();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.AI_CREDENTIAL_KEY;
    } else {
      process.env.AI_CREDENTIAL_KEY = ORIGINAL_KEY;
    }
  });

  it("round-trips secrets through AES-256-GCM", () => {
    const plaintext = "sk-ant-api03-AqmOdK2G9CELWX03CTR7dTU43QleAW";
    const stored = encryptSecret(plaintext);

    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it("produces fresh IVs so identical plaintext encrypts differently", () => {
    const plaintext = "fw_test_key";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("rejects ciphertext tampering", () => {
    const stored = encryptSecret("payload");
    const parts = stored.split(":");
    const tamperedCt = Buffer.from(parts[3], "base64");
    tamperedCt[0] ^= 0xff;
    parts[3] = tamperedCt.toString("base64");
    const tampered = parts.join(":");

    expect(() => decryptSecret(tampered)).toThrow(AICredentialEncryptionError);
  });

  it("rejects unsupported ciphertext format", () => {
    expect(() => decryptSecret("not:a:valid:ct")).toThrow(/Unsupported/);
    expect(() => decryptSecret("v2:a:b:c")).toThrow(/Unsupported/);
  });

  it("requires a configured master key", () => {
    delete process.env.AI_CREDENTIAL_KEY;
    expect(isAICredentialEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/AI_CREDENTIAL_KEY/);
    expect(() => decryptSecret("v1:a:b:c")).toThrow(/AI_CREDENTIAL_KEY/);
  });

  it("rejects empty plaintext", () => {
    expect(() => encryptSecret("")).toThrow(/empty secret/);
  });

  it("derives a 32-byte key from arbitrary string input", () => {
    process.env.AI_CREDENTIAL_KEY = "some-long-passphrase-not-32-bytes";
    expect(isAICredentialEncryptionConfigured()).toBe(true);
    const stored = encryptSecret("hello");
    expect(decryptSecret(stored)).toBe("hello");
  });
});
