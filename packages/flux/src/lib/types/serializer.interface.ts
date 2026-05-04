/**
 * Interface for serializer adapters used in Flux.
 * Defines methods for converting data to storage format (string or buffer)
 * and back to original type.
 *
 * @template T - Type of data for serialization/deserialization.
 */
export interface ISerializer<T = unknown> {
  /**
   * Serializes data to string or buffer.
   *
   * @param data - Data to serialize.
   * @returns Promise resolving to string or buffer with serialized data.
   */
  serialize(data: T): Promise<string | Buffer>;

  /**
   * Deserializes data from string or buffer.
   *
   * @param data - Serialized data (string or buffer).
   * @returns Promise resolving to original data of type T.
   */
  deserialize(data: string | Buffer): Promise<T>;
}
