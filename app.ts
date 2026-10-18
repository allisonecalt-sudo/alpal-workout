// Stub: the app shell is wired in a later commit.
import { APP_VERSION } from './version';

const tag = document.getElementById('app-version');
if (tag) tag.textContent = APP_VERSION;
