import type { ISerializer } from '../../types/serializer.interface';

/**
 * Implementation of serializer using standard JSON methods.
 * Converts data to JSON string and back.
 *
 * @template T - Type of data for serialization/deserialization.
 */
export class JsonSerializer<T = unknown> implements ISerializer<T> {
  /**
   * Serializes data to JSON string.
   *
   * @param data - Data to serialize.
   * @returns Promise resolving to JSON string.
   * @throws Error if data cannot be serialized to JSON.
   */
  public async serialize(data: T): Promise<string> {
    try {
      const jsonString = JSON.stringify(data);
      return Promise.resolve(jsonString);
    } catch (error) {
      // Catch JSON.stringify errors (e.g., circular references)
      return Promise.reject(
        new Error(
          `Failed to serialize data to JSON: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Deserializes data from JSON string.
   *
   * @param data - JSON string or buffer (will be converted to string).
   * @returns Promise resolving to original data of type T.
   * @throws Error if string is not valid JSON or cannot be deserialized.
   */
  public async deserialize(data: string | Buffer): Promise<T> {
    try {
      const jsonString = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      const parsedData = JSON.parse(jsonString);
      return Promise.resolve(parsedData as T);
    } catch (error) {
      // Catch JSON.parse errors
      return Promise.reject(
        new Error(
          `Failed to deserialize data from JSON: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}
