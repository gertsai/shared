/**
 * A map of status names to their corresponding icon classes.
 */
export const statusesIconsMap = {
  exclamation: 'status-exclamation',
  ellipsis: 'status-ellipsis',
  check: 'status-check',
  dash: 'status-dash',
  circle: 'status-circle',
  quarter: 'status-quarter',
  half: 'status-half',
  'three-quarters': 'status-three-quarters',
  failure: 'status-failure',
};

/**
 * An array of status icon classes.
 */
export const statusIcons = Object.values(statusesIconsMap);

/**
 * Returns a random status icon class from the `statusIcons` array.
 *
 * @returns A random status icon class.
 */
export function getRandomStatusIcon() {
  return statusIcons[Math.round(Math.random() * (statusIcons.length - 1))];
}
