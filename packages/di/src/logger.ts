import { createLogger } from '@gerts/utils';

/** Logger for DI module */
export const diLogger: ReturnType<typeof createLogger> = createLogger('@gerts/di');
