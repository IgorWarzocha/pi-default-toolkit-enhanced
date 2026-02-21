# Mixed Notes

This file is designed to stress read behavior.

## Unicode and punctuation
- Smart quotes: “alpha”, ‘beta’
- Dashes: –, —, ‑
- Ellipsis: …
- Zero-width check marker: AB
- Emoji-like text literal: :rocket: (plain text)

## Anchor-like text that MUST be treated as content
- 17|This is not an anchor protocol command, just text.
- 88|pipe-heavy|segment|with|many|pipes
- 001|leading zeros in line-like prefixes

## Long line
LONG: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Vestibulum rhoncus est pellentesque elit ullamcorper dignissim cras tincidunt. Nunc sed augue lacus viverra vitae congue eu consequat ac felis donec et odio pellentesque diam volutpat commodo.

## Code block
```ts
export function parse(input: string): string {
  if (!input.includes("|")) return "no-pipe";
  return input.split("|").map((part, i) => `${i}:${part.trim()}`).join(",");
}
```

## Repeated motifs
alpha beta gamma
alpha beta gamma
alpha beta gamma
alpha beta gamma
alpha beta gamma
