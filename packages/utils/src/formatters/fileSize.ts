/**
 * An object containing the file size units and their respective values in bytes.
 */
export const fileSizeUnits = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

/**
 * Returns the appropriate file size unit for a given size in bytes.
 *
 * @param size - The size in bytes.
 * @returns The file size unit (e.g., "B", "KB", "MB", "GB").
 */
export function getFileSizeUnit(size: number) {
  if (size >= fileSizeUnits.GB) {
    return 'GB';
  }
  if (size >= fileSizeUnits.MB) {
    return 'MB';
  }
  if (size >= fileSizeUnits.KB) {
    return 'KB';
  }
  return 'B';
}

/**
 * Formats a file size in bytes into a human-readable string.
 *
 * @param size - The size in bytes.
 * @returns A formatted file size string (e.g., "1.5MB").
 *
 * @example
 * ```typescript
 * const formattedSize = formatFileSize(1572864);
 * // formattedSize is "1.5MB"
 * ```
 */
export function formatFileSize(size: number) {
  // Using smaller unit to round up smaller sizes
  const approxSize = size * 1.08;
  const unit = getFileSizeUnit(approxSize);
  const converted = (
    getFileSizeUnit(size) === unit
      ? size / fileSizeUnits[unit]
      : Math.floor(approxSize / fileSizeUnits[unit])
  )
    .toFixed(2)
    .replace(/\.?0+$/, '');

  return `${converted}${unit}`;
}

/**
 * Formats a file size with a part and total into a human-readable string.
 *
 * @param partAndSize - A tuple containing the part and total size in bytes.
 * @returns A formatted file size string (e.g., "1/1.5MB").
 *
 * @example
 * ```typescript
 * const formattedSize = formatFileSizeParts([1048576, 1572864]);
 * // formattedSize is "1/1.5MB"
 * ```
 */
export function formatFileSizeParts([part, size]: [number, number]) {
  const unit = getFileSizeUnit(size);

  const convertedPart = (part / fileSizeUnits[unit])
    .toFixed(2)
    .replace(/\.?0+$/, '');
  const convertedSize = (size / fileSizeUnits[unit])
    .toFixed(2)
    .replace(/\.?0+$/, '');

  return `${convertedPart}/${convertedSize}${unit}`;
}
