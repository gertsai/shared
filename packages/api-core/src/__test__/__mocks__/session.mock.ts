import { defaultSession, UserType } from '@gertsai/core';

// @ts-ignore
export const sessionMock = defaultSession('test', UserType.USER, 'test', 'v1');
