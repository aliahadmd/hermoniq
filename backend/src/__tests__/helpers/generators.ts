import fc from "fast-check";

export const currencyArb = fc.constantFrom("BDT", "USD", "RMB") as fc.Arbitrary<"BDT" | "USD" | "RMB">;

export const accountTypeArb = fc.constantFrom("bank_account", "card", "cash") as fc.Arbitrary<"bank_account" | "card" | "cash">;

export const accountNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

export const balanceArb = fc.integer({ min: -1_000_000_00, max: 1_000_000_00 });

export const createAccountArb = fc.record({
  name: accountNameArb,
  type: accountTypeArb,
  currency: currencyArb,
  balance: balanceArb,
});

/** Generates a partial update payload with at least one field present */
export const updateAccountArb = fc
  .record({
    name: fc.option(accountNameArb, { nil: undefined }),
    type: fc.option(accountTypeArb, { nil: undefined }),
    balance: fc.option(balanceArb, { nil: undefined }),
  })
  .filter((obj) => Object.values(obj).some((v) => v !== undefined));

// --- Category generators ---

export const categoryTitleArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

export const categoryDetailsArb = fc.string({ minLength: 0, maxLength: 500 });

export const hexColorArb = fc
  .stringMatching(/^[0-9a-f]{6}$/)
  .map((s) => `#${s}`);

export const iconNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

export const createCategoryArb = fc.record({
  title: categoryTitleArb,
  details: categoryDetailsArb,
  color: hexColorArb,
  icon: iconNameArb,
});

/** Generates a partial update payload for categories with at least one field */
export const updateCategoryArb = fc
  .record({
    title: fc.option(categoryTitleArb, { nil: undefined }),
    details: fc.option(categoryDetailsArb, { nil: undefined }),
    color: fc.option(hexColorArb, { nil: undefined }),
    icon: fc.option(iconNameArb, { nil: undefined }),
  })
  .filter((obj) => Object.values(obj).some((v) => v !== undefined));

/** Generates invalid currency strings (not BDT, USD, or RMB) */
export const invalidCurrencyArb = fc
  .string({ minLength: 1, maxLength: 10 })
  .filter((s) => !["BDT", "USD", "RMB"].includes(s));

/** Generates invalid account type strings */
export const invalidAccountTypeArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !["bank_account", "card", "cash"].includes(s));

// --- Transaction generators ---

export const transactionTypeArb = fc.constantFrom("income", "expense") as fc.Arbitrary<"income" | "expense">;

export const transactionAmountArb = fc.integer({ min: 1, max: 1_000_000_00 });

export const transactionDescriptionArb = fc.string({ minLength: 0, maxLength: 500 });

export const transactionDateArb = fc
  .integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2030-12-31 in ms
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

/** Non-positive amounts for rejection testing */
export const nonPositiveAmountArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -1_000_000_00, max: -1 })
);


// --- Profile generators ---

export const profileNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

export const photoUrlArb = fc.constantFrom(
  "https://example.com/photo.jpg",
  "https://example.com/avatar.png",
  "https://cdn.test.org/img/user.webp",
  null
);

export const updateProfileArb = fc.record({
  name: profileNameArb,
  photoUrl: photoUrlArb,
});
