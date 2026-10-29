/** Deluge Web (and the demo adapters) use this when the web session is gone. */
export function isSessionExpiredMessage(message: string): boolean {
  return /not authenticated/i.test(message.trim());
}
