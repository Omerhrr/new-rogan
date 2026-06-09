import mediasoup from 'mediasoup';
import { types } from 'mediasoup';

// ── Room state ──────────────────────────────────────────────────────────
interface Room {
  router: types.Router;
  producerTransport: types.WebRtcTransport | null;
  consumerTransports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
  /** Maps consumerId → consumerTransportId for cleanup */
  consumerTransportMap: Map<string, string>;
}

// ── Extended encoding type for simulcast (scaleResolutionDownBy is
//    supported by mediasoup at runtime but not in the TS types) ──────────
interface SimulcastEncoding {
  scaleResolutionDownBy: number;
  maxBitrate: number;
}

// ── MediaSoup SFU Manager ───────────────────────────────────────────────
export class MediaSoupManager {
  private worker: types.Worker | null = null;
  private rooms: Map<string, Room> = new Map();

  // ── Codec config (RouterRtpCodecCapability makes preferredPayloadType optional) ──
  private static readonly MEDIA_CODECS: types.RouterRtpCodecCapability[] = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000,
      },
    },
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'profile-level-id': '42e01f',
        'packetization-mode': 1,
        'level-asymmetry-allowed': 1,
      },
    },
  ];

  // ── Simulcast encodings for video producers ─────────────────────────
  private static readonly SIMULCAST_ENCODINGS: SimulcastEncoding[] = [
    { scaleResolutionDownBy: 4, maxBitrate: 100000 },
    { scaleResolutionDownBy: 2, maxBitrate: 300000 },
    { scaleResolutionDownBy: 1, maxBitrate: 900000 },
  ];

  // ── Transport defaults ──────────────────────────────────────────────
  private static readonly LISTEN_IPS: types.TransportListenIp[] = [
    { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1' },
  ];

  // ── Initialise worker ───────────────────────────────────────────────
  async init(): Promise<void> {
    this.worker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    this.worker.on('died', () => {
      console.error('[MediaSoup] Worker died! Exiting...');
      process.exit(1);
    });

    // Graceful shutdown on process signals
    const shutdown = async () => {
      console.log('[MediaSoup] Shutting down worker...');
      if (this.worker) {
        this.worker.close();
        this.worker = null;
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log(`[MediaSoup] Worker created (pid ${this.worker.pid})`);
  }

  // ── Get or create room ──────────────────────────────────────────────
  private async getOrCreateRoom(roomId: string): Promise<Room> {
    let room = this.rooms.get(roomId);
    if (room) return room;

    if (!this.worker) {
      throw new Error('MediaSoup worker not initialised');
    }

    const router = await this.worker.createRouter({
      mediaCodecs: MediaSoupManager.MEDIA_CODECS,
    });

    room = {
      router,
      producerTransport: null,
      consumerTransports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      consumerTransportMap: new Map(),
    };

    this.rooms.set(roomId, room);
    console.log(`[MediaSoup] Room created: ${roomId}`);
    return room;
  }

  // ── Router RTP capabilities ─────────────────────────────────────────
  async getRouterRtpCapabilities(roomId: string): Promise<types.RtpCapabilities> {
    const room = await this.getOrCreateRoom(roomId);
    return room.router.rtpCapabilities;
  }

  // ── Create WebRtcTransport helper ───────────────────────────────────
  private async createWebRtcTransport(router: types.Router): Promise<types.WebRtcTransport> {
    const transport = await router.createWebRtcTransport({
      listenIps: MediaSoupManager.LISTEN_IPS,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
    });

    // Set max incoming bitrate (primarily for producer transport)
    try {
      await transport.setMaxIncomingBitrate(1_500_000);
    } catch {
      // Non-fatal — some transport types may not support this
    }

    return transport;
  }

  // ── Producer transport (broadcaster send) ──────────────────────────
  async createProducerTransport(roomId: string): Promise<{
    id: string;
    iceParameters: types.IceParameters;
    iceCandidates: types.IceCandidate[];
    dtlsParameters: types.DtlsParameters;
  }> {
    const room = await this.getOrCreateRoom(roomId);

    // Close existing producer transport if any (only one broadcaster per room)
    if (room.producerTransport) {
      room.producerTransport.close();
      room.producerTransport = null;
    }

    const transport = await this.createWebRtcTransport(room.router);
    room.producerTransport = transport;

    console.log(`[MediaSoup] Producer transport created in room ${roomId} (${transport.id})`);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  // ── Consumer transport (viewer recv) ───────────────────────────────
  async createConsumerTransport(roomId: string): Promise<{
    id: string;
    iceParameters: types.IceParameters;
    iceCandidates: types.IceCandidate[];
    dtlsParameters: types.DtlsParameters;
  }> {
    const room = await this.getOrCreateRoom(roomId);
    const transport = await this.createWebRtcTransport(room.router);
    room.consumerTransports.set(transport.id, transport);

    console.log(`[MediaSoup] Consumer transport created in room ${roomId} (${transport.id})`);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  // ── Connect transport with DTLS ────────────────────────────────────
  async connectTransport(
    roomId: string,
    transportId: string,
    dtlsParameters: types.DtlsParameters,
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    let transport: types.WebRtcTransport | undefined;

    if (room.producerTransport?.id === transportId) {
      transport = room.producerTransport;
    } else {
      transport = room.consumerTransports.get(transportId);
    }

    if (!transport) throw new Error(`Transport not found: ${transportId} in room ${roomId}`);

    await transport.connect({ dtlsParameters });
    console.log(`[MediaSoup] Transport connected: ${transportId}`);
  }

  // ── Create producer (broadcaster) ──────────────────────────────────
  async createProducer(
    roomId: string,
    transportId: string,
    kind: string,
    rtpParameters: types.RtpParameters,
  ): Promise<{ id: string }> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    const transport = room.producerTransport;
    if (!transport || transport.id !== transportId) {
      throw new Error(`Producer transport not found: ${transportId} in room ${roomId}`);
    }

    // For video producers, inject simulcast encodings into rtpParameters
    // if the client hasn't already provided them
    if (kind === 'video' && (!rtpParameters.encodings || rtpParameters.encodings.length <= 1)) {
      rtpParameters = {
        ...rtpParameters,
        encodings: MediaSoupManager.SIMULCAST_ENCODINGS.map((enc, idx) => ({
          ...enc,
          // Preserve existing rid/ssrc if present
          ...(rtpParameters.encodings?.[idx] ?? {}),
        })) as types.RtpEncodingParameters[],
      };
    }

    const producerOptions: types.ProducerOptions = {
      kind: kind as types.MediaKind,
      rtpParameters,
    };

    const producer = await transport.produce(producerOptions);
    room.producers.set(producer.id, producer);

    // Handle producer closure
    producer.on('transportclose', () => {
      room.producers.delete(producer.id);
      console.log(`[MediaSoup] Producer ${producer.id} closed (transport closed)`);
    });

    console.log(`[MediaSoup] Producer created: ${producer.id} (${kind}) in room ${roomId}`);
    return { id: producer.id };
  }

  // ── Create consumer (viewer) ───────────────────────────────────────
  async createConsumer(
    roomId: string,
    consumerTransportId: string,
    producerId: string,
    rtpCapabilities: types.RtpCapabilities,
  ): Promise<{
    id: string;
    producerId: string;
    kind: string;
    rtpParameters: types.RtpParameters;
  }> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    const consumerTransport = room.consumerTransports.get(consumerTransportId);
    if (!consumerTransport) {
      throw new Error(`Consumer transport not found: ${consumerTransportId} in room ${roomId}`);
    }

    const producer = room.producers.get(producerId);
    if (!producer) throw new Error(`Producer not found: ${producerId} in room ${roomId}`);

    // Check if router can consume this producer
    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Router cannot consume producer ${producerId} with given RTP capabilities`);
    }

    const consumer = await consumerTransport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Client will resume after setting up
    });

    room.consumers.set(consumer.id, consumer);
    // Track which transport this consumer belongs to
    room.consumerTransportMap.set(consumer.id, consumerTransportId);

    // Handle consumer closure events
    consumer.on('transportclose', () => {
      room.consumers.delete(consumer.id);
      room.consumerTransportMap.delete(consumer.id);
      console.log(`[MediaSoup] Consumer ${consumer.id} closed (transport closed)`);
    });

    consumer.on('producerclose', () => {
      room.consumers.delete(consumer.id);
      room.consumerTransportMap.delete(consumer.id);
      console.log(`[MediaSoup] Consumer ${consumer.id} closed (producer closed)`);
    });

    console.log(`[MediaSoup] Consumer created: ${consumer.id} for producer ${producerId} in room ${roomId}`);

    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  // ── Resume consumer ────────────────────────────────────────────────
  async resumeConsumer(roomId: string, consumerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    const consumer = room.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer not found: ${consumerId} in room ${roomId}`);

    await consumer.resume();
    console.log(`[MediaSoup] Consumer resumed: ${consumerId}`);
  }

  // ── Set consumer preferred layers (quality switching) ──────────────
  async setConsumerPreferredLayers(
    roomId: string,
    consumerId: string,
    spatialLayer: number,
    temporalLayer: number,
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    const consumer = room.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer not found: ${consumerId} in room ${roomId}`);

    await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
  }

  // ── Close producer and clean up ────────────────────────────────────
  async closeProducer(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    // Close all producers in the room
    for (const [producerId, producer] of room.producers) {
      producer.close();
      room.producers.delete(producerId);
    }

    // Close producer transport
    if (room.producerTransport) {
      room.producerTransport.close();
      room.producerTransport = null;
    }

    console.log(`[MediaSoup] Producer closed in room ${roomId}`);
  }

  // ── Close a single consumer ────────────────────────────────────────
  async closeConsumer(roomId: string, consumerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);

    const consumer = room.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer not found: ${consumerId} in room ${roomId}`);

    consumer.close();
    room.consumers.delete(consumerId);
    room.consumerTransportMap.delete(consumerId);

    console.log(`[MediaSoup] Consumer closed: ${consumerId}`);
  }

  // ── Close consumer transport by ID (for disconnect cleanup) ────────
  async closeConsumerTransport(roomId: string, transportId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const transport = room.consumerTransports.get(transportId);
    if (!transport) return;

    // Close all consumers associated with this transport
    for (const [consumerId, mappedTransportId] of room.consumerTransportMap) {
      if (mappedTransportId === transportId) {
        const consumer = room.consumers.get(consumerId);
        if (consumer) {
          consumer.close();
          room.consumers.delete(consumerId);
        }
        room.consumerTransportMap.delete(consumerId);
      }
    }

    transport.close();
    room.consumerTransports.delete(transportId);

    console.log(`[MediaSoup] Consumer transport closed: ${transportId} in room ${roomId}`);
  }

  // ── Close entire room ──────────────────────────────────────────────
  async closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Close all consumers
    for (const [consumerId, consumer] of room.consumers) {
      consumer.close();
    }
    room.consumers.clear();
    room.consumerTransportMap.clear();

    // Close all producers
    for (const [producerId, producer] of room.producers) {
      producer.close();
    }
    room.producers.clear();

    // Close consumer transports
    for (const [transportId, transport] of room.consumerTransports) {
      transport.close();
    }
    room.consumerTransports.clear();

    // Close producer transport
    if (room.producerTransport) {
      room.producerTransport.close();
      room.producerTransport = null;
    }

    // Close router
    room.router.close();

    this.rooms.delete(roomId);
    console.log(`[MediaSoup] Room closed: ${roomId}`);
  }

  // ── Health / stats ─────────────────────────────────────────────────
  async getStats(roomId: string): Promise<{
    workerPid: number;
    roomCount: number;
    producerCount: number;
    consumerCount: number;
  }> {
    const room = this.rooms.get(roomId);
    return {
      workerPid: this.worker?.pid ?? -1,
      roomCount: this.rooms.size,
      producerCount: room ? room.producers.size : 0,
      consumerCount: room ? room.consumers.size : 0,
    };
  }
}
