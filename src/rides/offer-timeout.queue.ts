export const OFFER_TIMEOUT_QUEUE = 'offer-timeout';
export const CHECK_OFFER_TIMEOUT_JOB = 'check-offer-timeout';

export interface OfferTimeoutJobData {
  rideId: string;
  /** ISO timestamp of the batch this job was scheduled for, or null if that
   *  batch found zero drivers. Used to detect stale/redelivered jobs whose
   *  batch has since been superseded by a newer retry. */
  batchOfferedAt: string | null;
}
