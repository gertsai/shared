import { defaultSession, UserType } from '@gerts/core';

// @ts-ignore
export const sessionMock = defaultSession('test', UserType.USER, 'test', 'v1');
