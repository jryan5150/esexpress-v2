export interface InviteRecord {
  email: string;
  role: 'dispatcher' | 'viewer';
  accepted: boolean;
}

/**
 * Check if an email has a pending (unaccepted) invite.
 * Pure function — takes the invite list, returns the matching invite or null.
 */
export function checkInvite(
  email: string,
  invites: InviteRecord[]
): InviteRecord | null {
  const normalized = email.toLowerCase().trim();
  const match = invites.find(
    (inv) => inv.email.toLowerCase().trim() === normalized && !inv.accepted
  );
  return match ?? null;
}
