export function normalizeUnicode(str: string): string {
  return str.normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    // Comprehensive invisible/zero-width/format control characters
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(
      /[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g,
      " ",
    )
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

export function stripWhitespace(str: string): string {
  return str.replace(/\s+/g, "").replace(/\r/g, "");
}

export function normalizeForHash(str: string, lowerCase: boolean = false): string {
  const canon = normalizeUnicode(str);
  const content = lowerCase ? canon.toLowerCase() : canon;
  return stripWhitespace(content);
}
