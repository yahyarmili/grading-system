/**
 * Text comparison for sorting names and titles: case- and accent-insensitive,
 * punctuation ignored ("Émile" = "emile", "d'Aubigné" sorts as "daubigne").
 */
export const textCollator = new Intl.Collator("en", {
  sensitivity: "base",
  ignorePunctuation: true,
  numeric: true,
});

export const compareText = (a: string, b: string) => textCollator.compare(a, b);
