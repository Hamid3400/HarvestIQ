import { describe, expect, it } from "vitest";
import { registerSchema } from "../src/modules/auth/auth.schemas.js";
import { generateRefreshToken, hashToken } from "../src/utils/tokens.js";

const valid = {
  email: "  Amina@Example.com ",
  password: "Str0ng-Passw0rd!",
  fullName: "Amina Bello",
  role: "FARMER",
};

describe("registration rules", () => {
  it("accepts a valid farmer and normalises the email", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.email).toBe("amina@example.com");
  });

  it("never allows self-registering as ADMIN", () => {
    expect(registerSchema.safeParse({ ...valid, role: "ADMIN" }).success).toBe(false);
  });

  it("rejects short passwords", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});

describe("refresh tokens", () => {
  it("are random and stored only as a hash", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toBe(a.token);
  });
});