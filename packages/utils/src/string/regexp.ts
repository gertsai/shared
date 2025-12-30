/**
 * Converts a regular expression to a string, removing the leading and trailing slashes and flags.
 *
 * @param regExp - The regular expression to convert.
 * @returns The string representation of the regular expression.
 */
export const regexpToString = (regExp: RegExp) => {
  const str = regExp
    .toString()
    .replace(/(^\/\^?|\$?\/[gusi]*$)/g, '')
    .replace(/(^|[^\\])\((?!\?[:=!<]|\?<|\))/g, '$1(?:')
    .replace(/\(\?<[^>\\]+>/g, '(?:');

  return str;
};

/**
 * A regular expression for matching code blocks.
 */
export const codeRegexp =
  /^```(?:(?<language>[a-z]+)\n)?(?<content>(?:(?=(\\?))\3.)*?)```$/is;

/**
 * A regular expression for matching expandable content.
 */
export const expandableRegexp =
  /^\[\[\[(?<content>(?:(?=(\\?))\2.)*?)\]\]\]$/is;

/**
 * A regular expression for matching mentions.
 */
export const mentionRegexp =
  /^<!(?<target_type>member|user|bot|task|project|team|space|group|channel|view|document|actionEntity|everyone)?@(?<target_uid>(?:[A-Za-z0-9]{20}|[A-Za-z0-9]{28}|[A-Za-z0-9]{32}|ae_system:[a-z0-9_]+))\[(?<shown_text>(?:\\[[\]]|[^[\]])*?)]>$/i;

/**
 * A regular expression for matching time.
 */
export const timeRegexp =
  /^(?:(?:(?<lead_symbol>^|[\s?!@#$%^&*()-=_+])(?<local_time>(?:[01]?[0-9]|2[0-3]):[0-5][0-9])(?<trail_symbol>$|[\s?!@#$%^&*()-=_+]))|<!time@(?<time>(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\/(?<offset>-?[0-9]{1,3})\[(?<shown_text>(?:\\[[\]]|[^[\]])*?)]>)$/;

/**
 * A regular expression for matching inline code.
 */
export const inlineCodeRegexp = /^`(?<content>(?:\\[`]|[^`])+?)`$/i;

/**
 * A regular expression for matching email addresses.
 */
export const emailRegexp =
  /^[A-Z0-9a-z](?:[A-Z0-9a-z]|\\?[._%+-]){0,30}[A-Z0-9a-z]@(?:[A-Z0-9a-z](?:(?:[A-Z0-9a-z]|\\?[._-]){0,30}[A-Z0-9a-z])?\\?\.){1,5}[A-Za-z]{2,15}$/i;

/**
 * A regular expression for matching tags.
 */
export const tagsRegexp = /^:(?<tag>TODO|FIXME|ERROR|IDEA|BUG|TASK|NOTE)$/;

// ============ TEXT STYLES REGEXPS ============ //

/**
 * A regular expression for matching bold text.
 */
export const boldRegexp =
  /^\*\*(?<bold_content>(?:\\[*]|[^*]|\*(?!\*))*?\S\s*)\*\*$/;

/**
 * A regular expression for matching italic text.
 */
export const italicRegexp =
  /^\*(?<italic_content>(?:\\[*]|[^*]|\*\*.*?\*\*)*?\S\s*)\*$/;

/**
 * A regular expression for matching underline text.
 */
export const underlineRegexp =
  /^__(?<underline_content>(?:\\[_]|[^_]|_(?!_))*?\S\s*)__$/;

/**
 * A regular expression for matching strikethrough text.
 */
export const strikeRegexp =
  /^~~(?<strike_content>(?:\\[~]|[^~]|~(?!~))*?\S\s*)~~$/;

/**
 * A regular expression for matching bold, italic, underline, and strikethrough text.
 */
export const boldItalicUnderlinestrikeRegexp = new RegExp(
  '(?:' +
    [boldRegexp, italicRegexp, underlineRegexp, strikeRegexp]
      .map((regexp) => `(?:^${regexp.toString().slice(2, -2)}$)`)
      .join('|') +
    ')',
  'isg',
);

// ============ URL REGEXPS ============ //

const generateUrlRegexp = () => {
  // URL components with named capture groups
  const protocol = '(?<protocol>(?:(?:https?|ftp):)?\\/\\/)';
  const auth = '(?<auth>\\S+(?::\\S*)?@)?';
  const ipv4 =
    '(?<ipv4>(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4])))';

  const domainLetters = '[a-z0-9\\u00A1-\\uFFFF]';
  const domain = `(?<domain>(?:(?:${domainLetters}(?:${domainLetters}|[_-]){0,62})?${domainLetters}\\.)+(?:${domainLetters}{2,}\\.?))`;
  const port = '(?<port>:\\d{2,5})?';
  const path = '(?<path>[/?#]\\S*)?';

  // Private IP ranges to exclude
  // const privateIPs = [
  //   '(?:10|127)(?:\\.\\d{1,3}){3}',
  //   '(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2}',
  //   '172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2}',
  // ].join('|');

  // Host part combining IPv4 and domain with private IP exclusion
  const host = `(?<host>(${ipv4}|${domain}))`;

  // Markdown text part
  const markdownText =
    '\\[(?<text>(?:\\\\[[\\]]|[^[\\]\\n]|\\*\\*.*?\\*\\*|\\*.*?\\*|__.*?__|~~.*?~~)+?)\\]';
  // Full URL pattern
  const urlPattern = `${protocol}?${auth}${host}${port}${path}`;

  const plainUrlRegexp = new RegExp(`^${urlPattern}$`, 'i');

  const markdownUrlRegexp = new RegExp(
    `^${markdownText}\\((?<url>${urlPattern})\\)$`,
    'i',
  );

  return { plainUrlRegexp, markdownUrlRegexp };
};

const { plainUrlRegexp, markdownUrlRegexp } = generateUrlRegexp();

/**
 * A regular expression for matching plain URLs.
 */
export { plainUrlRegexp, markdownUrlRegexp };
