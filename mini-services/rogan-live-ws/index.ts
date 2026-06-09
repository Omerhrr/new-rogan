import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { MediaSoupManager } from "./mediasoup-manager.js";

// ── Resolve directory for ESM (Bun --hot) ──────────────────────────
let __dirname: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  __dirname = dirname(__filename);
} catch {
  __dirname = process.cwd();
}

// ── Load JWT_SECRET from env, parent .env, or dev fallback ──────────
function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

// Search multiple paths for the .env file (Bun --hot, Docker, etc.)
if (!process.env.JWT_SECRET) {
  const searchPaths = [
    resolve(__dirname, ".env"),                    // local .env
    resolve(__dirname, "../../.env"),               // parent project .env
    resolve(process.cwd(), ".env"),                 // current working dir
    resolve(process.cwd(), "../../.env"),           // cwd parent .env
  ];
  for (const envPath of searchPaths) {
    const loaded = loadEnvFile(envPath);
    if (loaded.JWT_SECRET) {
      process.env.JWT_SECRET = loaded.JWT_SECRET;
      console.log(`[Config] Loaded JWT_SECRET from ${envPath}`);
      break;
    }
  }
}

// IMPORTANT: This fallback MUST match the one in src/lib/auth.ts exactly
const DEV_JWT_SECRET = "rogan-live-dev-only-insecure-secret";
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET environment variable is not set. WebSocket server refusing to start.");
    process.exit(1);
  }
  JWT_SECRET = DEV_JWT_SECRET;
  console.warn("⚠️  WARNING: JWT_SECRET not set. Using development default. Set JWT_SECRET in .env for security.");
}

// Diagnostic: print hash of secret so you can verify it matches the Next.js app
const secretHash = createHash("sha256").update(JWT_SECRET).digest("hex").slice(0, 8);
console.log(`[Config] JWT_SECRET hash: ${secretHash} (must match Next.js app)`);

const ALLOWED_ORIGINS = (process.env.WS_ORIGINS || "http://localhost:3000").split(",");

// ── MediaSoup SFU initialisation ──────────────────────────────────────
const mediaSoupManager = new MediaSoupManager();
mediaSoupManager.init().then(() => {
  console.log('[MediaSoup] SFU initialized');
}).catch((err) => {
  console.error('[MediaSoup] Failed to initialize:', err.message);
  console.warn('[MediaSoup] WebRTC streaming will not be available');
});

const PORT = parseInt(process.env.PORT || '3001', 10);

const io = new Server(PORT, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// SECURITY: JWT authentication middleware for WebSocket connections
interface AuthenticatedSocketData {
  userId: string;
  email: string;
  role: string;
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) {
    return next(new Error("Authentication required"));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthenticatedSocketData;
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

// In-memory state for the MVP
const streamViewers: Record<string, Set<string>> = {};
const activeStreams: Record<string, { creatorId: string; creatorName: string; title: string; viewerCount: number; thumbnailUrl?: string }> = {};

// Track socket -> userId mapping for room-based delivery
const socketUserMap: Record<string, string> = {};
// Track socket -> set of (roomId, consumerTransportId) for WebRTC cleanup on disconnect
const socketWebRtcMap: Record<string, Array<{ roomId: string; consumerTransportId: string }>> = {};

io.on("connection", (socket) => {
  const user = socket.data.user as AuthenticatedSocketData;
  console.log(`[WS] Connected: ${socket.id} (User: ${user.userId})`);

  // SECURITY: Auto-join user to their own room for targeted DMs and notifications
  socket.join(`user:${user.userId}`);

  // ---- User Identification ----
  // Clients must send this event after connecting to be auto-joined to their user room
  socket.on("user:identify", (data: { userId: string }) => {
    const { userId } = data;
    if (!userId) return;
    socketUserMap[socket.id] = userId;
    socket.join(`user:${userId}`);
    console.log(`[WS] User ${userId} identified on socket ${socket.id}, joined room user:${userId}`);
  });

  // ---- Stream Events ----
  socket.on("stream:start", (data: { streamId: string; creatorId: string; creatorName: string; title: string }) => {
    // SECURITY: Only allow starting streams as yourself
    if (data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot start stream as another user" });
      return;
    }
    const { streamId, creatorId, creatorName, title } = data;
    activeStreams[streamId] = { creatorId, creatorName, title, viewerCount: 0 };
    if (!streamViewers[streamId]) streamViewers[streamId] = new Set();
    io.emit("stream:live", { streamId, creatorId, creatorName, title, viewerCount: 0 });
    console.log(`[Stream] Started: ${title} by ${creatorName}`);
  });

  socket.on("stream:join", (data: { streamId: string; userId: string }) => {
    // SECURITY: Only allow joining as yourself
    if (data.userId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot join stream as another user" });
      return;
    }
    const { streamId, userId } = data;
    socket.join(`stream:${streamId}`);
    if (!streamViewers[streamId]) streamViewers[streamId] = new Set();
    streamViewers[streamId].add(userId);
    if (activeStreams[streamId]) {
      activeStreams[streamId].viewerCount = streamViewers[streamId].size;
      io.to(`stream:${streamId}`).emit("stream:viewers", {
        streamId,
        viewerCount: streamViewers[streamId].size,
      });
    }
    console.log(`[Stream] ${userId} joined ${streamId} (${streamViewers[streamId].size} viewers)`);
  });

  socket.on("stream:leave", (data: { streamId: string; userId: string }) => {
    // SECURITY: Only allow leaving as yourself
    if (data.userId !== user.userId && user.role !== "admin") {
      return; // Silently ignore invalid leave
    }
    const { streamId, userId } = data;
    socket.leave(`stream:${streamId}`);
    if (streamViewers[streamId]) {
      streamViewers[streamId].delete(userId);
      if (activeStreams[streamId]) {
        activeStreams[streamId].viewerCount = streamViewers[streamId].size;
        io.to(`stream:${streamId}`).emit("stream:viewers", {
          streamId,
          viewerCount: streamViewers[streamId].size,
        });
      }
    }
  });

  socket.on("stream:end", (data: { streamId: string }) => {
    // SECURITY: Only the stream creator or admin can end a stream
    const stream = activeStreams[data.streamId];
    if (!stream) return;
    if (stream.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Only the stream creator can end this stream" });
      return;
    }
    delete activeStreams[data.streamId];
    delete streamViewers[data.streamId];
    // Clean up MediaSoup room resources
    mediaSoupManager.closeRoom(data.streamId).catch((err) => {
      console.error(`[MediaSoup] Failed to close room ${data.streamId}:`, err.message);
    });
    io.emit("stream:ended", { streamId: data.streamId });
    console.log(`[Stream] Ended: ${data.streamId}`);
  });

  socket.on("stream:getLive", () => {
    socket.emit("stream:liveList", Object.entries(activeStreams).map(([id, s]) => ({
      streamId: id,
      ...s,
    })));
  });

  // ---- Chat Events ----
  socket.on("chat:message", (data: { streamId: string; userId: string; username: string; message: string; avatar?: string }) => {
    // SECURITY: Only allow sending chat as yourself
    if (data.userId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot send chat as another user" });
      return;
    }
    // SECURITY: Sanitize and limit message length
    const sanitizedMessage = data.message.replace(/<[^>]*>/g, "").trim().slice(0, 500);
    if (!sanitizedMessage) return;

    const chatMsg = {
      streamId: data.streamId,
      userId: data.userId,
      username: data.username,
      message: sanitizedMessage,
      avatar: data.avatar,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: "chat" as const,
    };
    io.to(`stream:${data.streamId}`).emit("chat:message", chatMsg);
  });

  socket.on("chat:system", (data: { streamId: string; message: string }) => {
    // SECURITY: Only allow system messages from stream creator or admin
    const stream = activeStreams[data.streamId];
    if (!stream || (stream.creatorId !== user.userId && user.role !== "admin")) {
      return;
    }
    io.to(`stream:${data.streamId}`).emit("chat:message", {
      id: `sys_${Date.now()}`,
      streamId: data.streamId,
      message: data.message.slice(0, 200),
      type: "system",
      timestamp: Date.now(),
    });
  });

  // ---- Gift Events ----
  socket.on("gift:send", (data: { streamId: string; senderId: string; senderName: string; receiverId: string; giftType: string; amount: number; message?: string }) => {
    // SECURITY: Only allow sending gifts as yourself
    if (data.senderId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot send gifts as another user" });
      return;
    }
    // SECURITY: Validate amount is positive and reasonable
    if (!data.amount || data.amount <= 0 || data.amount > 10000000) {
      socket.emit("error", { message: "Invalid gift amount" });
      return;
    }
    const giftEvent = {
      streamId: data.streamId,
      senderId: data.senderId,
      senderName: data.senderName,
      receiverId: data.receiverId,
      giftType: data.giftType,
      amount: data.amount,
      message: data.message ? data.message.slice(0, 200) : undefined,
      id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    // Broadcast gift to stream room
    io.to(`stream:${data.streamId}`).emit("gift:received", giftEvent);
    // Send notification to creator via user room
    io.to(`user:${data.receiverId}`).emit("notification", {
      userId: data.receiverId,
      type: "gift_received",
      title: "Gift Received!",
      message: `${data.senderName} sent you a ${data.giftType}!`,
      data: giftEvent,
    });
    console.log(`[Gift] ${data.senderName} -> ${data.giftType} (${data.amount} TK)`);
  });

  // ---- DM Events ----
  socket.on("dm:send", (data: { senderId: string; receiverId: string; message: string }) => {
    // SECURITY: Only allow sending DMs as yourself
    if (data.senderId !== user.userId) {
      socket.emit("error", { message: "Cannot send DMs as another user" });
      return;
    }
    // SECURITY: Sanitize and limit message length
    const sanitizedMessage = data.message.replace(/<[^>]*>/g, "").trim().slice(0, 1000);
    if (!sanitizedMessage) return;

    const dmEvent = {
      senderId: data.senderId,
      receiverId: data.receiverId,
      message: sanitizedMessage,
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    // Notify receiver via user room
    io.to(`user:${data.receiverId}`).emit("dm:received", dmEvent);
    // Confirm to sender
    socket.emit("dm:sent", dmEvent);
  });

  socket.on("dm:typing", (data: { senderId: string; receiverId: string }) => {
    // SECURITY: Only allow as yourself
    if (data.senderId !== user.userId) return;
    io.to(`user:${data.receiverId}`).emit("dm:typing", { senderId: data.senderId });
  });

  socket.on("dm:read", (data: { senderId: string; receiverId: string }) => {
    // SECURITY: Only the receiver can mark as read
    if (data.receiverId !== user.userId) return;
    io.to(`user:${data.senderId}`).emit("dm:read", { readBy: data.receiverId });
  });

  // ---- Notification Events ----
  socket.on("notification:subscribe", (data: { userId: string }) => {
    // SECURITY: Only subscribe to your own notifications
    // Note: Users are already auto-joined to `user:${userId}` on connection
    // This handler is kept for backwards compatibility
    if (data.userId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot subscribe to another user's notifications" });
      return;
    }
    // Already in user:${userId} room from connection
  });

  // ---- PK Battle Events ----
  const activePKBattles: Record<string, { creator1Id: string; creator2Id: string; creator1Score: number; creator2Score: number; timerInterval?: ReturnType<typeof setInterval> }> = {};

  socket.on("pk:challenge", (data: { fromCreatorId: string; toCreatorId: string; streamId: string; fromCreatorName: string }) => {
    // SECURITY: Only challenge as yourself
    if (data.fromCreatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot issue challenge as another creator" });
      return;
    }
    io.to(`user:${data.toCreatorId}`).emit("pk:challenge", data);
  });

  socket.on("pk:update", (data: { streamId: string; creator1Score: number; creator2Score: number }) => {
    // SECURITY: Only stream creator or admin can broadcast PK updates
    const stream = activeStreams[data.streamId];
    if (!stream || (stream.creatorId !== user.userId && user.role !== "admin")) {
      return;
    }
    io.to(`stream:${data.streamId}`).emit("pk:update", data);
  });

  socket.on("pk:start", (data: { battleId: string; streamId: string; creator1Id: string; creator2Id: string; duration: number }) => {
    // SECURITY: Only one of the participants can start the battle
    if (data.creator1Id !== user.userId && data.creator2Id !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Only participants can start a PK battle" });
      return;
    }
    activePKBattles[data.battleId] = {
      creator1Id: data.creator1Id,
      creator2Id: data.creator2Id,
      creator1Score: 0,
      creator2Score: 0,
    };
    // Notify both creators via user rooms
    io.to(`user:${data.creator1Id}`).emit("pk:started", { battleId: data.battleId, streamId: data.streamId, opponentId: data.creator2Id });
    io.to(`user:${data.creator2Id}`).emit("pk:started", { battleId: data.battleId, streamId: data.streamId, opponentId: data.creator1Id });
    // Broadcast to stream viewers
    io.to(`stream:${data.streamId}`).emit("pk:started", { battleId: data.battleId, creator1Id: data.creator1Id, creator2Id: data.creator2Id, duration: data.duration });
    console.log(`[PK] Battle started: ${data.creator1Id} vs ${data.creator2Id}`);
  });

  socket.on("pk:giftScore", (data: { battleId: string; streamId: string; receiverCreatorId: string; amount: number }) => {
    const battle = activePKBattles[data.battleId];
    if (!battle) return;
    // SECURITY: Validate amount is positive and reasonable
    if (!data.amount || data.amount <= 0 || data.amount > 10000000) return;
    if (data.receiverCreatorId === battle.creator1Id) {
      battle.creator1Score += data.amount;
    } else if (data.receiverCreatorId === battle.creator2Id) {
      battle.creator2Score += data.amount;
    }
    io.to(`stream:${data.streamId}`).emit("pk:scoreUpdate", {
      battleId: data.battleId,
      creator1Score: battle.creator1Score,
      creator2Score: battle.creator2Score,
    });
  });

  socket.on("pk:end", (data: { battleId: string; streamId: string; winnerId: string | null }) => {
    const battle = activePKBattles[data.battleId];
    if (!battle) return;
    // SECURITY: Only participants can end the battle
    if (battle.creator1Id !== user.userId && battle.creator2Id !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Only participants can end a PK battle" });
      return;
    }
    io.to(`stream:${data.streamId}`).emit("pk:ended", {
      battleId: data.battleId,
      winnerId: data.winnerId,
      creator1Score: battle.creator1Score,
      creator2Score: battle.creator2Score,
    });
    delete activePKBattles[data.battleId];
    console.log(`[PK] Battle ended: ${data.battleId}, winner: ${data.winnerId || 'draw'}`);
  });

  socket.on("pk:timer", (data: { battleId: string; streamId: string; timeRemaining: number }) => {
    // SECURITY: Validate timeRemaining is reasonable
    if (data.timeRemaining < 0 || data.timeRemaining > 3600) return;
    io.to(`stream:${data.streamId}`).emit("pk:timer", { battleId: data.battleId, timeRemaining: data.timeRemaining });
  });

  // ---- Private Stream Access Events ----
  socket.on("stream:accessRequest", (data: { streamId: string; userId: string; username: string; creatorId: string }) => {
    // SECURITY: Only request access as yourself
    if (data.userId !== user.userId) {
      socket.emit("error", { message: "Cannot request access as another user" });
      return;
    }
    io.to(`user:${data.creatorId}`).emit("stream:accessRequest", data);
  });

  // ---- DM Request Events (for non-followers) ----
  socket.on("dm:request", (data: { senderId: string; senderName: string; receiverId: string; message: string }) => {
    // SECURITY: Only send DM requests as yourself
    if (data.senderId !== user.userId) {
      socket.emit("error", { message: "Cannot send DM requests as another user" });
      return;
    }
    const sanitizedMessage = data.message.replace(/<[^>]*>/g, "").trim().slice(0, 500);
    if (!sanitizedMessage) return;
    io.to(`user:${data.receiverId}`).emit("dm:request", { ...data, message: sanitizedMessage, id: `dmreq_${Date.now()}`, timestamp: Date.now() });
  });

  socket.on("dm:requestResponse", (data: { requestId: string; receiverId: string; senderId: string; accepted: boolean }) => {
    // SECURITY: Only the receiver can respond to DM requests
    if (data.receiverId !== user.userId) {
      socket.emit("error", { message: "Cannot respond to DM requests for another user" });
      return;
    }
    io.to(`user:${data.senderId}`).emit("dm:requestResponse", data);
  });

  // ---- Task/Service Status Update Events ----
  socket.on("task:update", (data: { requestId: string; status: string; buyerId: string; creatorId: string }) => {
    // SECURITY: Only buyer or creator can send task updates
    if (data.buyerId !== user.userId && data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Not authorized to update this task" });
      return;
    }
    io.to(`user:${data.buyerId}`).emit("task:update", data);
    io.to(`user:${data.creatorId}`).emit("task:update", data);
  });

  // ---- Private Stream Started Notification ----
  socket.on("stream:privateStart", (data: { streamId: string; creatorId: string; creatorName: string; title: string; allowedUsers: string[] }) => {
    // SECURITY: Only the creator can start private streams
    if (data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Not authorized to start private stream" });
      return;
    }
    data.allowedUsers.forEach((uid: string) => {
      io.to(`user:${uid}`).emit("stream:invite", { streamId: data.streamId, creatorName: data.creatorName, title: data.title });
    });
  });

  // ── WebRTC Signalling Events ──────────────────────────────────────

  // Get router RTP capabilities
  socket.on('webrtc:getRouterRtpCapabilities', async (data: { roomId: string }, callback) => {
    try {
      const rtpCapabilities = await mediaSoupManager.getRouterRtpCapabilities(data.roomId);
      callback({ rtpCapabilities });
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Create producer transport (broadcaster)
  socket.on('webrtc:createProducerTransport', async (data: { roomId: string }, callback) => {
    try {
      const transportOptions = await mediaSoupManager.createProducerTransport(data.roomId);
      callback(transportOptions);
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Create consumer transport (viewer)
  socket.on('webrtc:createConsumerTransport', async (data: { roomId: string }, callback) => {
    try {
      const transportOptions = await mediaSoupManager.createConsumerTransport(data.roomId);
      // Track consumer transport for cleanup on disconnect
      if (!socketWebRtcMap[socket.id]) socketWebRtcMap[socket.id] = [];
      socketWebRtcMap[socket.id].push({ roomId: data.roomId, consumerTransportId: transportOptions.id });
      callback(transportOptions);
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Connect transport (both producer and consumer)
  socket.on('webrtc:connectTransport', async (data: { roomId: string; transportId: string; dtlsParameters: any }, callback) => {
    try {
      await mediaSoupManager.connectTransport(data.roomId, data.transportId, data.dtlsParameters);
      callback({});
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Produce media (broadcaster)
  socket.on('webrtc:produce', async (data: { roomId: string; transportId: string; kind: string; rtpParameters: any }, callback) => {
    try {
      const { id } = await mediaSoupManager.createProducer(data.roomId, data.transportId, data.kind, data.rtpParameters);
      callback({ id });
      // Notify all viewers in the stream room about the new producer
      socket.to(`stream:${data.roomId}`).emit('webrtc:newProducer', { producerId: id, kind: data.kind });
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Consume media (viewer)
  socket.on('webrtc:consume', async (data: { roomId: string; consumerTransportId: string; producerId: string; rtpCapabilities: any }, callback) => {
    try {
      const consumer = await mediaSoupManager.createConsumer(data.roomId, data.consumerTransportId, data.producerId, data.rtpCapabilities);
      callback(consumer);
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Resume consumer
  socket.on('webrtc:resumeConsumer', async (data: { roomId: string; consumerId: string }, callback) => {
    try {
      await mediaSoupManager.resumeConsumer(data.roomId, data.consumerId);
      callback({});
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Set consumer preferred layers (quality switching)
  socket.on('webrtc:setPreferredLayers', async (data: { roomId: string; consumerId: string; spatialLayer: number; temporalLayer: number }, callback) => {
    try {
      await mediaSoupManager.setConsumerPreferredLayers(data.roomId, data.consumerId, data.spatialLayer, data.temporalLayer);
      callback({});
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Close producer
  socket.on('webrtc:closeProducer', async (data: { roomId: string }, callback) => {
    try {
      await mediaSoupManager.closeProducer(data.roomId);
      callback({});
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // Close consumer
  socket.on('webrtc:closeConsumer', async (data: { roomId: string; consumerId: string }, callback) => {
    try {
      await mediaSoupManager.closeConsumer(data.roomId, data.consumerId);
      callback({});
    } catch (err) {
      callback({ error: (err as Error).message });
    }
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    const userId = socketUserMap[socket.id];
    if (userId) {
      delete socketUserMap[socket.id];
    }
    // Clean up WebRTC consumer transports for this socket
    const webrtcEntries = socketWebRtcMap[socket.id];
    if (webrtcEntries) {
      for (const { roomId, consumerTransportId } of webrtcEntries) {
        mediaSoupManager.closeConsumerTransport(roomId, consumerTransportId).catch((err) => {
          console.error(`[MediaSoup] Failed to close consumer transport on disconnect:`, err.message);
        });
      }
      delete socketWebRtcMap[socket.id];
    }
    console.log(`[WS] Disconnected: ${socket.id} (User: ${user.userId})`);
  });
});

console.log(`🟢 Rogan Live WebSocket Server running on port ${PORT} (authenticated)`);
