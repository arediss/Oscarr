/** Request statuses that block a user from creating a duplicate request */
export const ACTIVE_REQUEST_STATUSES = ['pending', 'approved', 'processing', 'failed'] as const;
