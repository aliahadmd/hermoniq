import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { updateProfileSchema } from "../worker/validators";

/**
 * Feature: user-profile-settings, Property 2: Profile validator correctness
 *
 * **Validates: Requirements 1.3, 1.4, 1.5, 3.3**
 *
 * For any string input, the profile validator should accept usernames that are
 * 1–30 characters long containing only lowercase letters, numbers, underscores,
 * and hyphens, and reject all others. For any string input, the validator should
 * accept about values of 100 characters or fewer and reject longer ones. For any
 * string input, the validator should accept website values that are valid URLs
 * and reject non-URL strings.
 */

// Base valid profile data to use when testing individual fields
const validBase = { name: "Test User" };

// Character set for valid usernames
const VALID_USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-";

// Generator for valid usernames: 1-30 chars from the allowed character set
const validUsernameArb = fc.string({
  unit: fc.constantFrom(...VALID_USERNAME_CHARS.split("")),
  minLength: 1,
  maxLength: 30,
});

// Generator for invalid usernames containing disallowed characters
const invalidUsernameCharsArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !/^[a-z0-9_-]+$/.test(s));

// Generator for usernames that are too long (31-100 chars)
const tooLongUsernameArb = fc.string({
  unit: fc.constantFrom(...VALID_USERNAME_CHARS.split("")),
  minLength: 31,
  maxLength: 100,
});

// Generator for valid about strings (0-100 chars)
const validAboutArb = fc.string({ minLength: 0, maxLength: 100 });

// Generator for about strings that are too long (101+ chars)
const tooLongAboutArb = fc.string({ minLength: 101, maxLength: 300 });

// Generator for valid URLs
const validUrlArb = fc
  .tuple(
    fc.constantFrom("http", "https"),
    fc.stringMatching(/^[a-z][a-z0-9]{1,15}$/),
    fc.constantFrom(".com", ".org", ".net", ".io", ".dev"),
    fc.constantFrom("", "/path", "/page/1", "/api/v2")
  )
  .map(([protocol, domain, tld, path]) => `${protocol}://${domain}${tld}${path}`);

// Generator for strings that are not valid URLs
const invalidUrlArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => {
    try {
      new URL(s);
      return false;
    } catch {
      return true;
    }
  });

describe("Property 2: Profile validator correctness", () => {
  describe("Username validation", () => {
    it("should accept usernames with 1-30 chars of lowercase letters, numbers, underscores, and hyphens", () => {
      fc.assert(
        fc.property(validUsernameArb, (username) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            username,
          });
          expect(result.success).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject usernames containing characters outside [a-z0-9_-]", () => {
      fc.assert(
        fc.property(invalidUsernameCharsArb, (username) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            username,
          });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject usernames longer than 30 characters", () => {
      fc.assert(
        fc.property(tooLongUsernameArb, (username) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            username,
          });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject empty string usernames", () => {
      const result = updateProfileSchema.safeParse({
        ...validBase,
        username: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("About validation", () => {
    it("should accept about values of 100 characters or fewer", () => {
      fc.assert(
        fc.property(validAboutArb, (about) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            about,
          });
          expect(result.success).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject about values exceeding 100 characters", () => {
      fc.assert(
        fc.property(tooLongAboutArb, (about) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            about,
          });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Website validation", () => {
    it("should accept valid URL strings for website", () => {
      fc.assert(
        fc.property(validUrlArb, (website) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            website,
          });
          expect(result.success).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject non-URL strings for website", () => {
      fc.assert(
        fc.property(invalidUrlArb, (website) => {
          const result = updateProfileSchema.safeParse({
            ...validBase,
            website,
          });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });
});
