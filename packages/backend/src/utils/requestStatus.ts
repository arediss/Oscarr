/**
 * Request status constants — single source of truth for the backend.
 *
 * ACTIVE: request is in progress (blocks duplicate requests)
 * TERMINAL: request reached a final state
 * RETRYABLE: request can be retried by the scheduler
 */

export const REQUEST_STATUSES = ['pending', 'approved', 'declined', 'processing', 'available', 'failed'] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];

/** Statuses that block a user from creating a duplicate request */
export const ACTIVE_REQUEST_STATUSES: RequestStatus[] = ['pending', 'approved', 'processing', 'failed'];

/** Statuses that should be cascaded to 'available' when media becomes available */
export const COMPLETABLE_REQUEST_STATUSES: RequestStatus[] = ['approved', 'processing', 'failed'];

/** Statuses that can be retried */
export const RETRYABLE_REQUEST_STATUSES: RequestStatus[] = ['failed'];
