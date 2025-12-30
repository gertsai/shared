import type { UserType, UsersMetaType } from '@gerts/core';
import type typia from 'typia';

/**
 * Typia validator
 * Can be used to infer data type from validator
 */
export type TypiaValidator<T> = ReturnType<
  typeof typia.createValidateEquals<T>
>;

/**
 * Possible moleculer context meta
 */
export interface ContextMeta {
  user_uuid?: string;
  user_type?: UserType;
  user?: UsersMetaType['data'];
  $params?: any;
  $multipart?: any;
}
