import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RidesService } from './rides.service';
import { OFFER_TIMEOUT_QUEUE, OfferTimeoutJobData } from './offer-timeout.queue';

@Processor(OFFER_TIMEOUT_QUEUE)
export class OfferTimeoutProcessor extends WorkerHost {
  constructor(private readonly ridesService: RidesService) {
    super();
  }

  async process(job: Job<OfferTimeoutJobData>): Promise<void> {
    await this.ridesService.handleOfferTimeout(job.data.rideId, job.data.batchOfferedAt);
  }
}
