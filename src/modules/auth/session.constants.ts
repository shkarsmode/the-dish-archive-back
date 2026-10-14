// How long a sign-in lasts. GET /auth/session hands an active user a fresh token,
// so only someone who has not opened the app for this long has to sign in again.
export const SESSION_TTL_DAYS = 180;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

// A token is renewed once it is this old: at most one new token a day per device.
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;

export const SESSION_COOKIE = 'dish_session';
