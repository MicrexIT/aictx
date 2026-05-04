export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export function shouldRefreshSession(session: Session, now = new Date()): boolean {
  const expiresAt = new Date(session.expiresAt).getTime();
  return expiresAt - now.getTime() < 5 * 60 * 1000;
}
