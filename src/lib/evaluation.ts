// Closed lists of the evaluation by the AI (E5). Kept free of imports: the
// database schema will read them (E5.5), and drizzle-kit loads the schema alone.

/** Where an evaluation request goes: the simulator by default, Mistral only on demand. */
export const aiProviders = ["simulator", "mistral"] as const;
export type AiProvider = (typeof aiProviders)[number];

/**
 * Why a call to the AI failed, without content (EVL-03 R3). Retried:
 * timeout, rate_limited, unavailable. Final: rejected (the request itself was
 * refused), configuration (key, model or access).
 */
export const callErrors = ["timeout", "rate_limited", "unavailable", "rejected", "configuration"] as const;
export type CallError = (typeof callErrors)[number];
