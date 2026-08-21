import { decodeMarkdownHtmlText } from './markdownHtmlText';

const MARKDOWN_LINK_DESTINATION_ESCAPE_PATTERN = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
export const MARKDOWN_LINK_DESTINATION_SOURCE = String.raw`(?:<[^>\r\n]+>|[^\s"'()（）\r\n]+(?:[(（][^()（）\r\n]*[)）][^\s"'()（）\r\n]*)*)`;
export const MARKDOWN_LINK_TITLE_SOURCE = String.raw`(?:\s+(?:"[^"\r\n]*"|'[^'\r\n]*'|[(（][^()（）\r\n]*[)）]))?`;
const MARKDOWN_LINK_TARGET_SOURCE = String.raw`${MARKDOWN_LINK_DESTINATION_SOURCE}${MARKDOWN_LINK_TITLE_SOURCE}\s*`;
export const MARKDOWN_LINK_SOURCE = String.raw`(?:\[|【)([^】\]]+)(?:\]|】)(?:\(|（)(${MARKDOWN_LINK_TARGET_SOURCE})(?:\)|）)`;

export const MARKDOWN_LINK_REGEX = new RegExp(MARKDOWN_LINK_SOURCE, 'g');
export const MARKDOWN_LINK_PATTERN_GLOBAL = new RegExp(MARKDOWN_LINK_SOURCE, 'g');
export const MARKDOWN_LINK_PATTERN_ALLOW_EMPTY_LABEL_GLOBAL = new RegExp(
  String.raw`(?:\[|【)([^】\]]*)(?:\]|】)(?:\(|（)(${MARKDOWN_LINK_TARGET_SOURCE})(?:\)|）)`,
  'g',
);

const LINK_DESTINATION_WITH_TITLE_PATTERN = new RegExp(
  String.raw`^(${MARKDOWN_LINK_DESTINATION_SOURCE})${MARKDOWN_LINK_TITLE_SOURCE}\s*$`,
);

function unescapeMarkdownLinkDestination(value: string): string {
  return value.replace(MARKDOWN_LINK_DESTINATION_ESCAPE_PATTERN, '$1');
}

export function getMarkdownLinkHref(rawDestination: string): string {
  const destination = rawDestination.trim();
  const match = LINK_DESTINATION_WITH_TITLE_PATTERN.exec(destination);
  if (!match) return destination;

  const href = match[1]!;
  const unwrapped = href.startsWith('<') && href.endsWith('>')
    ? href.slice(1, -1)
    : href;
  return decodeMarkdownHtmlText(unescapeMarkdownLinkDestination(unwrapped));
}
