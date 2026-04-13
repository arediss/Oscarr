export type ButtonState =
  | 'available'
  | 'can_request_quality'
  | 'downloading'
  | 'upcoming'
  | 'searching'
  | 'already_requested'
  | 'partially_available'
  | 'partially_searching'
  | 'partially_error'
  | 'blocked'
  | 'can_request';

export interface ButtonStateInputs {
  isAvailable: boolean;
  isPartiallyAvailable: boolean;
  isDownloading: boolean;
  isUpcoming: boolean;
  isSearching: boolean;
  userHasRequest: boolean;
  canRequestNewQuality: boolean;
  blacklisted: boolean;
  searchMissingState: 'idle' | 'searching' | 'error';
}

export function resolveButtonState(inputs: ButtonStateInputs): ButtonState {
  const {
    isAvailable, isPartiallyAvailable, isDownloading, isUpcoming,
    isSearching, userHasRequest, canRequestNewQuality, blacklisted,
    searchMissingState,
  } = inputs;

  // Priority order matches the original ternary chain exactly
  if (isAvailable && !canRequestNewQuality) return 'available';
  if (isAvailable && canRequestNewQuality) return 'can_request_quality';
  if (isDownloading) return 'downloading';
  if (isUpcoming) return 'upcoming';
  if (isSearching) return 'searching';
  if (canRequestNewQuality) return 'can_request_quality';
  if (userHasRequest && !canRequestNewQuality && !isPartiallyAvailable) return 'already_requested';
  if (isPartiallyAvailable) {
    if (searchMissingState === 'searching') return 'partially_searching';
    if (searchMissingState === 'error') return 'partially_error';
    return 'partially_available';
  }
  if (blacklisted) return 'blocked';
  return 'can_request';
}
