/**
 * Converts a string like "5 minutes", "10 days", "3 months", or "1 year" to a Date object.
 *
 * @param input - The input string to convert.
 * @returns A Date object representing the calculated date.
 * @throws An error if the input string is not in the correct format.
 *
 * @example
 * ```typescript
 * const date = convertDateStringToDate('5 days');
 * // date is a Date object 5 days in the future
 * ```
 */
export function convertDateStringToDate(input: DateString): Date {
  const currentDate = new Date();

  const parts = input.split(' ');
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error(
      'Input string must be in format "number unit", e.g. "5 minutes", "10 days", "3 months", or "1 year".',
    );
  }

  const number = parseInt(parts[0], 10);
  const unit = parts[1].toLowerCase();

  if (isNaN(number)) {
    throw new Error('The first part of the input string must be a number.');
  }

  if (number < 1) {
    throw new Error('The number must be greater than 0.');
  }
  switch (unit) {
    case 'minute':
    case 'minutes':
      currentDate.setMinutes(currentDate.getMinutes() + number);
      break;
    case 'day':
    case 'days':
      currentDate.setDate(currentDate.getDate() + number);
      break;
    case 'month':
    case 'months':
      currentDate.setMonth(currentDate.getMonth() + number);
      break;
    case 'year':
    case 'years':
      currentDate.setFullYear(currentDate.getFullYear() + number);
      break;
    default:
      throw new Error(
        `Unknown time unit: ${unit}. Use "minutes", "days", "months", or "years".`,
      );
  }

  return currentDate;
}

/**
 * A type representing the possible time units for the `convertDateStringToDate` function.
 */
export type DateTypes =
  | 'minute'
  | 'minutes'
  | 'day'
  | 'days'
  | 'month'
  | 'months'
  | 'year'
  | 'years';

/**
 * A type representing a string in the format "number unit" for the `convertDateStringToDate` function.
 */
export type DateString = `${number} ${DateTypes}`;
