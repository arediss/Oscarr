/**
 * Request status constants — shared single source of truth for backend + frontend.
 *
 * ACTIVE: request is in progress (blocks duplicate requests)
 * COMPLETABLE: request should be cascaded to 'available' when media becomes available
 */

export const REQUEST_STATUSES = ['pending', 'approved', 'declined', 'processing', 'available', 'failed'] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];

/** Statuses that block a user from creating a duplicate request. */
export const ACTIVE_REQUEST_STATUSES: readonly RequestStatus[] = ['pending', 'approved', 'processing', 'failed'];

/** Statuses that should be cascaded to 'available' when media becomes available. */
export const COMPLETABLE_REQUEST_STATUSES: readonly RequestStatus[] = ['approved', 'processing', 'failed'];

/** Retryable statuses — failed requests get retried by the scheduler. */
export const RETRYABLE_REQUEST_STATUSES: readonly RequestStatus[] = ['failed'];
