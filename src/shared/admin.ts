// Super-admin resolution. Mirrors the old Supabase model: a profile with
// global_role = 'super_admin', bootstrapped by a hardcoded email on first login
// (handle_new_user used zshkarrr@gmail.com). Email-based super-admins can never
// be locked out via the role column.

export type AdminCandidate =
    | { email?: string | null; globalRole?: string | null }
    | null
    | undefined;

/** The set of emails that are always super-admins (env, comma-separated). */
export function superAdminEmails(): string[] {
    return String(process.env.SUPER_ADMIN_EMAILS || 'zshkarrr@gmail.com')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
    const normalized = String(email || '').trim().toLowerCase();
    return !!normalized && superAdminEmails().includes(normalized);
}

/** True if the user is super-admin — by role column OR by bootstrap email. */
export function isSuperAdmin(user: AdminCandidate): boolean {
    if (!user) return false;
    if (String(user.globalRole || '').toLowerCase() === 'super_admin') return true;
    return isSuperAdminEmail(user.email);
}

/** The globalRole a brand-new user should get on first login. */
export function initialGlobalRole(email: string): 'super_admin' | 'user' {
    return isSuperAdminEmail(email) ? 'super_admin' : 'user';
}
