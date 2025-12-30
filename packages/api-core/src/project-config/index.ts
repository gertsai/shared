export const loadConfig = <
  T extends Record<string, string | number | boolean | null>,
>(
  config: T,
): T => {
  Object.entries(config).forEach(([key, defaultValue]) => {
    if (!(key in process.env)) {
      return;
    }
    if (typeof defaultValue === 'boolean') {
      // @ts-ignore
      config[key] = !!process.env[key];
    } else if (typeof defaultValue === 'number') {
      // @ts-ignore
      config[key] = +process.env[key];
    } else {
      // @ts-ignore
      config[key] = process.env[key];
    }
  });

  return config;
};
