export interface Format {
  num: (n: number) => string;
  date: (ms: number) => string;
  /** English-style singular/plural; Indonesian does not inflect. */
  plural: (n: number, one: string, other: string) => string;
}

export function makeFormat(locale: string): Format {
  const num = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const rules = new Intl.PluralRules(locale);
  return {
    num: (n) => num.format(n),
    date: (ms) => date.format(ms),
    plural: (n, one, other) => (rules.select(n) === 'one' ? one : other),
  };
}
