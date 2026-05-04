/**
 * An interface representing a timestamp.
 */
export interface ITimestamp {
  /**
   * The number of seconds since the epoch.
   */
  readonly seconds: number;

  /**
   * The number of nanoseconds within the second.
   */
  readonly nanoseconds: number;

  /**
   * Converts the timestamp to a JavaScript `Date` object.
   *
   * @returns A `Date` object representing the timestamp.
   */
  toDate(): Date;

  /**
   * Converts the timestamp to the number of milliseconds since the epoch.
   *
   * @returns The number of milliseconds since the epoch.
   */
  toMillis(): number;

  /**
   * Checks if this timestamp is equal to another timestamp.
   *
   * @param other - The other timestamp to compare to.
   * @returns `true` if the timestamps are equal, `false` otherwise.
   */
  isEqual(other: ITimestamp): boolean;

  /**
   * Converts the timestamp to a string representation.
   *
   * @returns A string representation of the timestamp.
   */
  toString(): string;
  // This is extended in in client code
  // toJSON(): { seconds: number; nanoseconds: number; type: string };
  // valueOf(): string;
}
