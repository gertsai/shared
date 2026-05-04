import { createLogger } from '@gertsai/utils';

/** Logger for DI module */
export const diLogger: ReturnType<typeof createLogger> = createLogger('@gertsai/di');
