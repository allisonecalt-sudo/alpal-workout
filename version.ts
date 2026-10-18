// The visible version tag. scripts/build.mjs injects both from package.json "appVersion".
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
