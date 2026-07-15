import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export interface RideOfferPayload {
  rideId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  distanceKm: number;
  offerExpiresInMs: number;
}

export interface RideOfferClosedPayload {
  rideId: string;
  reason: 'assigned_to_other' | 'expired';
}

const driverRoom = (driverId: string) => `driver:${driverId}`;

/**
 * Pure notification push — drivers connect here to learn about offers in
 * real time, but still accept via the REST endpoint. This gateway has no
 * bearing on the concurrency guarantee, which lives entirely in
 * RidesService.acceptRide's Redis lock + conditional Postgres update.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RideOffersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RideOffersGateway.name);

  handleConnection(client: Socket): void {
    const driverId = client.handshake.query.driverId;
    if (typeof driverId !== 'string' || !driverId) {
      this.logger.warn(`Rejecting connection with no driverId query param: ${client.id}`);
      client.disconnect(true);
      return;
    }
    void client.join(driverRoom(driverId));
    this.logger.log(`Driver ${driverId} connected (socket ${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  notifyOffer(driverId: string, payload: RideOfferPayload): void {
    this.server.to(driverRoom(driverId)).emit('ride:offer', payload);
  }

  notifyOfferClosed(driverId: string, payload: RideOfferClosedPayload): void {
    this.server.to(driverRoom(driverId)).emit('ride:offer:closed', payload);
  }
}
