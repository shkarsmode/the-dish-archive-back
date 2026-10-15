// The key that signs every session. The old fallback string is public (this repository is
// public), so a deployment without JWT_SECRET would accept forged tokens — including one that
// claims the super-admin's email. Outside local development it is required, full stop.
export function jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('JWT_SECRET is not set — refusing to start with a publicly known signing key');
    }
    return 'development-only-secret';
}
