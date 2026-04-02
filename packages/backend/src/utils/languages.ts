/** Map ISO 639-2/3 and common codes to human-readable names */
const LANG_MAP: Record<string, string> = {
  // ISO 639-2 (3-letter)
  eng: 'English', fre: 'Français', fra: 'Français', jpn: 'Japanese',
  ger: 'Deutsch', deu: 'Deutsch', spa: 'Español', ita: 'Italiano',
  por: 'Português', rus: 'Russian', kor: 'Korean', zho: 'Chinese',
  chi: 'Chinese', ara: 'Arabic', hin: 'Hindi', pol: 'Polish',
  tur: 'Turkish', nld: 'Nederlands', dut: 'Nederlands', swe: 'Swedish',
  nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', hun: 'Hungarian',
  cze: 'Czech', ces: 'Czech', rum: 'Romanian', ron: 'Romanian',
  gre: 'Greek', ell: 'Greek', heb: 'Hebrew', tha: 'Thai',
  vie: 'Vietnamese', ind: 'Indonesian', mal: 'Malay', und: 'Unknown',
  // ISO 639-1 (2-letter)
  en: 'English', fr: 'Français', ja: 'Japanese', de: 'Deutsch',
  es: 'Español', it: 'Italiano', pt: 'Português', ru: 'Russian',
  ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi',
  pl: 'Polish', tr: 'Turkish', nl: 'Nederlands', sv: 'Swedish',
};

/** Normalize a language code or name to a readable label. Handles "eng/fre" compound format. */
export function normalizeLanguages(raw: string[]): string[] {
  const result: string[] = [];
  for (const entry of raw) {
    // Handle compound format like "eng/fre"
    const parts = entry.includes('/') ? entry.split('/') : [entry];
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      const name = LANG_MAP[trimmed] || (part.trim().charAt(0).toUpperCase() + part.trim().slice(1));
      if (name && name !== 'Unknown' && !result.includes(name)) {
        result.push(name);
      }
    }
  }
  return result;
}
