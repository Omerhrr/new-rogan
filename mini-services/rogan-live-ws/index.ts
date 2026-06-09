import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

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
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes (single or double) — matches Next.js dotenv behavior
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// Search multiple paths for the .env file (Bun --hot, Docker, etc.)
if (!process.env.JWT_SECRET) {
  const searchPaths = [
    resolve(__dirname, ".env"),
    resolve(__dirname, "../../.env"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
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

const PORT = parseInt(process.env.PORT || "3001", 10);

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
    const payload = jwt.verify(token, JWT_SECRET!, { algorithms: ["HS256"] }) as AuthenticatedSocketData;
    socket.data.user = payload;
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid or expired token";
    console.error(`[Auth] Token verification failed for socket ${socket.id}: ${msg}`);
    next(new Error("Invalid or expired token"));
  }
});

// ── In-memory state ──────────────────────────────────────────────
const streamViewers: Record<string, Set<string>> = {};
const activeStreams: Record<string, { creatorId: string; creatorName: string; title: string; viewerCount: number; thumbnailUrl?: string }> = {};

// Track socket -> userId mapping for room-based delivery
const socketUserMap: Record<string, string> = {};

// ── WebRTC Relay State ──────────────────────────────────────────
// Maps roomId -> broadcaster socket ID
const roomBroadcasters: Record<string, string> = {};
// Maps socket ID -> roomId (for both broadcaster and viewer cleanup)
const socketRoomMap: Record<string, string> = {};
// Maps roomId -> Set of viewer socket IDs
const roomViewerSockets: Record<string, Set<string>> = {};

// ── PK Battle State ─────────────────────────────────────────────
const activePKBattles: Record<string, { creator1Id: string; creator2Id: string; creator1Score: number; creator2Score: number; timerInterval?: ReturnType<typeof setInterval> }> = {};

// ── STUN/TURN Configuration ─────────────────────────────────────
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Add TURN servers for production NAT traversal:
  // { urls: "turn:your-turn-server:3478", username: "username", credential: "password" },
];

io.on("connection", (socket) => {
  const user = socket.data.user as AuthenticatedSocketData;
  console.log(`[WS] Connected: ${socket.id} (User: ${user.userId})`);

  // SECURITY: Auto-join user to their own room for targeted DMs and notifications
  socket.join(`user:${user.userId}`);

  // ---- User Identification ----
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
      return;
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

    // Clean up WebRTC state for this room
    const broadcasterSocketId = roomBroadcasters[data.streamId];
    if (broadcasterSocketId) {
      // Notify all viewers that the broadcaster left
      io.to(`stream:${data.streamId}`).emit("webrtc:broadcaster-left", { roomId: data.streamId });
      // Clean up viewer tracking
      const viewers = roomViewerSockets[data.streamId];
      if (viewers) {
        for (const viewerSid of viewers) {
          delete socketRoomMap[viewerSid];
        }
        delete roomViewerSockets[data.streamId];
      }
      delete socketRoomMap[broadcasterSocketId];
      delete roomBroadcasters[data.streamId];
    }

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
    io.to(`stream:${data.streamId}`).emit("gift:received", giftEvent);
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
    if (data.senderId !== user.userId) {
      socket.emit("error", { message: "Cannot send DMs as another user" });
      return;
    }
    const sanitizedMessage = data.message.replace(/<[^>]*>/g, "").trim().slice(0, 1000);
    if (!sanitizedMessage) return;

    const dmEvent = {
      senderId: data.senderId,
      receiverId: data.receiverId,
      message: sanitizedMessage,
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    io.to(`user:${data.receiverId}`).emit("dm:received", dmEvent);
    socket.emit("dm:sent", dmEvent);
  });

  socket.on("dm:typing", (data: { senderId: string; receiverId: string }) => {
    if (data.senderId !== user.userId) return;
    io.to(`user:${data.receiverId}`).emit("dm:typing", { senderId: data.senderId });
  });

  socket.on("dm:read", (data: { senderId: string; receiverId: string }) => {
    if (data.receiverId !== user.userId) return;
    io.to(`user:${data.senderId}`).emit("dm:read", { readBy: data.receiverId });
  });

  // ---- Notification Events ----
  socket.on("notification:subscribe", (data: { userId: string }) => {
    if (data.userId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot subscribe to another user's notifications" });
      return;
    }
  });

  // ---- PK Battle Events ----
  socket.on("pk:challenge", (data: { fromCreatorId: string; toCreatorId: string; streamId: string; fromCreatorName: string }) => {
    if (data.fromCreatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot issue challenge as another creator" });
      return;
    }
    io.to(`user:${data.toCreatorId}`).emit("pk:challenge", data);
  });

  socket.on("pk:update", (data: { streamId: string; creator1Score: number; creator2Score: number }) => {
    const stream = activeStreams[data.streamId];
    if (!stream || (stream.creatorId !== user.userId && user.role !== "admin")) {
      return;
    }
    io.to(`stream:${data.streamId}`).emit("pk:update", data);
  });

  socket.on("pk:start", (data: { battleId: string; streamId: string; creator1Id: string; creator2Id: string; duration: number }) => {
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
    io.to(`user:${data.creator1Id}`).emit("pk:started", { battleId: data.battleId, streamId: data.streamId, opponentId: data.creator2Id });
    io.to(`user:${data.creator2Id}`).emit("pk:started", { battleId: data.battleId, streamId: data.streamId, opponentId: data.creator1Id });
    io.to(`stream:${data.streamId}`).emit("pk:started", { battleId: data.battleId, creator1Id: data.creator1Id, creator2Id: data.creator2Id, duration: data.duration });
    console.log(`[PK] Battle started: ${data.creator1Id} vs ${data.creator2Id}`);
  });

  socket.on("pk:giftScore", (data: { battleId: string; streamId: string; receiverCreatorId: string; amount: number }) => {
    const battle = activePKBattles[data.battleId];
    if (!battle) return;
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
    if (data.timeRemaining < 0 || data.timeRemaining > 3600) return;
    io.to(`stream:${data.streamId}`).emit("pk:timer", { battleId: data.battleId, timeRemaining: data.timeRemaining });
  });

  // ---- Private Stream Access Events ----
  socket.on("stream:accessRequest", (data: { streamId: string; userId: string; username: string; creatorId: string }) => {
    if (data.userId !== user.userId) {
      socket.emit("error", { message: "Cannot request access as another user" });
      return;
    }
    io.to(`user:${data.creatorId}`).emit("stream:accessRequest", data);
  });

  // ---- DM Request Events ----
  socket.on("dm:request", (data: { senderId: string; senderName: string; receiverId: string; message: string }) => {
    if (data.senderId !== user.userId) {
      socket.emit("error", { message: "Cannot send DM requests as another user" });
      return;
    }
    const sanitizedMessage = data.message.replace(/<[^>]*>/g, "").trim().slice(0, 500);
    if (!sanitizedMessage) return;
    io.to(`user:${data.receiverId}`).emit("dm:request", { ...data, message: sanitizedMessage, id: `dmreq_${Date.now()}`, timestamp: Date.now() });
  });

  socket.on("dm:requestResponse", (data: { requestId: string; receiverId: string; senderId: string; accepted: boolean }) => {
    if (data.receiverId !== user.userId) {
      socket.emit("error", { message: "Cannot respond to DM requests for another user" });
      return;
    }
    io.to(`user:${data.senderId}`).emit("dm:requestResponse", data);
  });

  // ---- Task/Service Status Update Events ----
  socket.on("task:update", (data: { requestId: string; status: string; buyerId: string; creatorId: string }) => {
    if (data.buyerId !== user.userId && data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Not authorized to update this task" });
      return;
    }
    io.to(`user:${data.buyerId}`).emit("task:update", data);
    io.to(`user:${data.creatorId}`).emit("task:update", data);
  });

  // ---- Private Stream Started Notification ----
  socket.on("stream:privateStart", (data: { streamId: string; creatorId: string; creatorName: string; title: string; allowedUsers: string[] }) => {
    if (data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Not authorized to start private stream" });
      return;
    }
    data.allowedUsers.forEach((uid: string) => {
      io.to(`user:${uid}`).emit("stream:invite", { streamId: data.streamId, creatorName: data.creatorName, title: data.title });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // WebRTC Signaling Relay Events (Production-Grade Mesh P2P)
  // ══════════════════════════════════════════════════════════════════
  //
  // Architecture: Socket.IO relays SDP offers/answers and ICE candidates
  // between broadcasters and viewers. Each viewer gets a direct P2P
  // PeerConnection to the broadcaster (mesh topology).
  //
  // For scaling beyond ~15 viewers per stream, deploy a MediaSoup/LiveKit
  // SFU on a proper Linux server and swap the signaling handlers below.
  // ══════════════════════════════════════════════════════════════════

  // Broadcaster signals they are ready to accept viewer connections
  socket.on("webrtc:broadcaster-ready", (data: { roomId: string }) => {
    const { roomId } = data;

    // Only one broadcaster per room
    const existingBroadcaster = roomBroadcasters[roomId];
    if (existingBroadcaster && existingBroadcaster !== socket.id) {
      // Check if the old broadcaster is still connected
      const oldSocket = io.sockets.sockets.get(existingBroadcaster);
      if (oldSocket) {
        socket.emit("webrtc:error", { message: "Room already has an active broadcaster" });
        return;
      }
    }

    roomBroadcasters[roomId] = socket.id;
    socketRoomMap[socket.id] = roomId;
    if (!roomViewerSockets[roomId]) roomViewerSockets[roomId] = new Set();

    console.log(`[WebRTC] Broadcaster ready in room ${roomId} (socket: ${socket.id})`);

    // Send ICE server configuration to the broadcaster
    socket.emit("webrtc:ice-servers", { iceServers: ICE_SERVERS });
  });

  // Viewer requests to join a room and receive the broadcaster's stream
  socket.on("webrtc:viewer-join", (data: { roomId: string }) => {
    const { roomId } = data;
    const broadcasterSocketId = roomBroadcasters[roomId];

    if (!broadcasterSocketId) {
      socket.emit("webrtc:error", { message: "No broadcaster in this room yet" });
      return;
    }

    // Track this viewer
    if (!roomViewerSockets[roomId]) roomViewerSockets[roomId] = new Set();
    roomViewerSockets[roomId].add(socket.id);
    socketRoomMap[socket.id] = roomId;

    console.log(`[WebRTC] Viewer ${socket.id} joining room ${roomId} (broadcaster: ${broadcasterSocketId})`);

    // Send ICE server configuration to the viewer
    socket.emit("webrtc:ice-servers", { iceServers: ICE_SERVERS });

    // Notify broadcaster to create a PeerConnection for this viewer
    io.to(broadcasterSocketId).emit("webrtc:viewer-joined", {
      viewerSocketId: socket.id,
      roomId,
    });
  });

  // Broadcaster sends SDP offer to a specific viewer
  socket.on("webrtc:offer", (data: { roomId: string; targetSocketId: string; sdp: RTCSessionDescriptionInit }) => {
    // Validate: only the room's broadcaster can send offers
    if (roomBroadcasters[data.roomId] !== socket.id) {
      socket.emit("webrtc:error", { message: "Only broadcaster can send offers" });
      return;
    }

    console.log(`[WebRTC] Offer from ${socket.id} -> ${data.targetSocketId} in room ${data.roomId}`);

    // Relay the offer to the specific viewer
    io.to(data.targetSocketId).emit("webrtc:offer", {
      fromSocketId: socket.id,
      roomId: data.roomId,
      sdp: data.sdp,
    });
  });

  // Viewer sends SDP answer back to the broadcaster
  socket.on("webrtc:answer", (data: { roomId: string; targetSocketId: string; sdp: RTCSessionDescriptionInit }) => {
    console.log(`[WebRTC] Answer from ${socket.id} -> ${data.targetSocketId} in room ${data.roomId}`);

    // Relay the answer to the broadcaster
    io.to(data.targetSocketId).emit("webrtc:answer", {
      fromSocketId: socket.id,
      roomId: data.roomId,
      sdp: data.sdp,
    });
  });

  // ICE candidate exchange between any two peers
  socket.on("webrtc:ice-candidate", (data: { roomId: string; targetSocketId: string; candidate: RTCIceCandidateInit }) => {
    // Relay the ICE candidate to the target peer
    io.to(data.targetSocketId).emit("webrtc:ice-candidate", {
      fromSocketId: socket.id,
      candidate: data.candidate,
    });
  });

  // Broadcaster requests ICE restart (connection recovery)
  socket.on("webrtc:restart-ice", (data: { roomId: string; targetSocketId: string }) => {
    if (roomBroadcasters[data.roomId] !== socket.id) {
      return;
    }
    // Notify the viewer to restart ICE
    io.to(data.targetSocketId).emit("webrtc:restart-ice", {
      fromSocketId: socket.id,
      roomId: data.roomId,
    });
    console.log(`[WebRTC] ICE restart requested: ${socket.id} -> ${data.targetSocketId}`);
  });

  // Viewer signals they are leaving the WebRTC session
  socket.on("webrtc:viewer-leave", (data: { roomId: string }) => {
    const broadcasterSocketId = roomBroadcasters[data.roomId];
    if (broadcasterSocketId) {
      // Notify broadcaster that this viewer left
      io.to(broadcasterSocketId).emit("webrtc:viewer-left", {
        viewerSocketId: socket.id,
        roomId: data.roomId,
      });
    }
    if (roomViewerSockets[data.roomId]) {
      roomViewerSockets[data.roomId].delete(socket.id);
    }
    delete socketRoomMap[socket.id];
    console.log(`[WebRTC] Viewer ${socket.id} left room ${data.roomId}`);
  });

  // Broadcaster signals they are stopping the WebRTC session
  socket.on("webrtc:broadcaster-stop", (data: { roomId: string }) => {
    // Notify all viewers that the broadcaster stopped
    io.to(`stream:${data.roomId}`).emit("webrtc:broadcaster-left", {
      roomId: data.roomId,
    });

    // Clean up tracking
    const viewers = roomViewerSockets[data.roomId];
    if (viewers) {
      for (const viewerSid of viewers) {
        delete socketRoomMap[viewerSid];
      }
      delete roomViewerSockets[data.roomId];
    }
    delete roomBroadcasters[data.roomId];
    delete socketRoomMap[socket.id];
    console.log(`[WebRTC] Broadcaster stopped in room ${data.roomId}`);
  });

  // ---- Get current producers (for late-joining viewers) ----
  socket.on("webrtc:get-broadcaster", (data: { roomId: string }, callback) => {
    const broadcasterSocketId = roomBroadcasters[data.roomId];
    callback({ broadcasterSocketId: broadcasterSocketId || null });
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    const userId = socketUserMap[socket.id];
    if (userId) {
      delete socketUserMap[socket.id];
    }

    // Clean up WebRTC state
    const roomId = socketRoomMap[socket.id];
    if (roomId) {
      // Check if this socket was a broadcaster
      if (roomBroadcasters[roomId] === socket.id) {
        console.log(`[WebRTC] Broadcaster disconnected: ${socket.id} in room ${roomId}`);
        // Notify all viewers
        io.to(`stream:${roomId}`).emit("webrtc:broadcaster-left", { roomId });
        // Clean up viewer tracking
        const viewers = roomViewerSockets[roomId];
        if (viewers) {
          for (const viewerSid of viewers) {
            delete socketRoomMap[viewerSid];
          }
          delete roomViewerSockets[roomId];
        }
        delete roomBroadcasters[roomId];
      } else {
        // This was a viewer
        console.log(`[WebRTC] Viewer disconnected: ${socket.id} in room ${roomId}`);
        const broadcasterSocketId = roomBroadcasters[roomId];
        if (broadcasterSocketId) {
          io.to(broadcasterSocketId).emit("webrtc:viewer-left", {
            viewerSocketId: socket.id,
            roomId,
          });
        }
        if (roomViewerSockets[roomId]) {
          roomViewerSockets[roomId].delete(socket.id);
        }
      }
      delete socketRoomMap[socket.id];
    }

    console.log(`[WS] Disconnected: ${socket.id} (User: ${user.userId})`);
  });
});

console.log(`🟢 Rogan Live WebSocket Server running on port ${PORT} (authenticated)`);
console.log(`[WebRTC] Mesh P2P signaling relay active`);
console.log(`[WebRTC] ICE servers: ${ICE_SERVERS.map(s => s.urls).join(', ')}`);
