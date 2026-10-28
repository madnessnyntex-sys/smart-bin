// Keeps the login token in the browser so the user stays logged in after a refresh.
//
// Security note: localStorage can be read by any script running on the page, so if the
// site ever had an XSS bug (someone sneaking their own script in), the token could be stolen.
// That is an accepted trade-off for this prototype. React escapes text by default, which helps.
// A safer (but more work) option is an httpOnly cookie, which scripts cannot read.
const KEY = 'smartbin_token';

export function getToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage can be blocked (private mode), treat that as "not logged in"
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // if storage is blocked the user just has to log in again next time
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
