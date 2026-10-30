import { beforeEach, describe, expect, it } from "vitest";
import { clearRegisteredSecrets, redact, registerSecret } from "../../../src/util/redact.js";

// Fake key material is assembled at runtime so this file never matches the secret scan.
const join = (...parts: string[]) => parts.join("");

describe("redact", () => {
  beforeEach(() => clearRegisteredSecrets());

  it("replaces every occurrence of registered secrets, longest first", () => {
    registerSecret("hunter2hunter2");
    registerSecret("hunter2hunter2-extended");
    expect(redact("a hunter2hunter2 b hunter2hunter2-extended c")).toBe("a [REDACTED] b [REDACTED] c");
  });

  it("ignores very short values to avoid redacting ordinary text", () => {
    registerSecret("abc");
    registerSecret("");
    expect(redact("abc")).toBe("abc");
  });

  it("redacts common key shapes without registration", () => {
    const sk = join("sk-", "ownstack-", "A1b2C3d4E5f6G7h8I9j0K1l2");
    const akid = join("AKIA", "ABCDEFGHIJKLMNOP");
    const awsSecret = join("wJalrXUtnFEMI/K7MDENG/", "bPxRfiCYEXAMPLEKEY");
    const bearer = join("Bearer ", "abc.def-ghi_jkl");
    const pem = join("-----BEGIN ", "RSA PRIVATE KEY-----\nMIIabc\n-----END ", "RSA PRIVATE KEY-----");
    expect(redact(`key=${sk}`)).toBe("key=[REDACTED]");
    expect(redact(`id ${akid} end`)).toBe("id [REDACTED] end");
    expect(redact(`secret ${awsSecret}`)).toBe("secret [REDACTED]");
    expect(redact(`Authorization: ${bearer}`)).toBe("Authorization: Bearer [REDACTED]");
    expect(redact(`x\n${pem}\ny`)).toBe("x\n[REDACTED]\ny");
  });

  it("leaves git SHAs and ordinary text alone", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(redact(`commit ${sha}`)).toBe(`commit ${sha}`);
    expect(redact("plain words and sk-short")).toBe("plain words and sk-short");
  });
});
