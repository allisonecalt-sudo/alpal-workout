// The visible version tag. scripts/build.mjs injects both from package.json "appVersion".
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;

/** "Oct 19 · 08:40": the build date and time without the year, for the small header tag. */
export const BUILD_SHORT = BUILD_DATE.replace(/, \d{4}/, '');
