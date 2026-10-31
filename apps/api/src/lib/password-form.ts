/**
 * A password is compared as Unicode text, not as the bytes one keyboard happened to
 * produce (#2056). The same Cyrillic й, Vietnamese tone mark or Hangul syllable can
 * be typed as one code point or as a base letter plus a combining mark, depending on
 * the OS, the browser and the input method, and the two hash differently. NIST SP
 * 800-63B asks verifiers to apply NFKC or NFKD before hashing; NFKC also folds
 * compatibility variants (fullwidth letters, circled digits, ligatures), so more
 * input methods agree.
 *
 * Only passwords go through this. API keys and SCIM tokens are machine-generated
 * strings and are compared as they are.
 */
export function normalizePassword(password: string): string {
  return password.normalize("NFKC");
}

/**
 * The texts to try against a stored hash, in order. The normalized form comes first,
 * since that is what every hash made from now on is built from. When the text as typed
 * differs from it, that comes second: a hash made before normalization was built from
 * the raw text, and still has to verify. An ASCII password, and any password already
 * in normalized form, has a single candidate.
 */
export function passwordCandidates(password: string): string[] {
  const normalized = normalizePassword(password);
  return normalized === password ? [normalized] : [normalized, password];
}
