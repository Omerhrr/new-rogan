import { Server } from "socket.io";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set. WebSocket server refusing to start.");
  process.exit(1);
}

const ALLOWED_ORIGINS = (process.env.WS_ORIGINS || "http://localhost:3000").split(",");

const io = new Server(3003, {
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

io.on("connection", (socket) => {
  const user = socket.data.user as AuthenticatedSocketData;
  console.log(`[WS] Connected: ${socket.id} (User: ${user.userId})`);

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
    // Send notification to creator
    io.emit("notification", {
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
    // Notify receiver
    io.emit(`dm:${data.receiverId}`, dmEvent);
    // Confirm to sender
    socket.emit("dm:sent", dmEvent);
  });

  socket.on("dm:typing", (data: { senderId: string; receiverId: string }) => {
    // SECURITY: Only allow as yourself
    if (data.senderId !== user.userId) return;
    io.emit(`dm:typing:${data.receiverId}`, { senderId: data.senderId });
  });

  socket.on("dm:read", (data: { senderId: string; receiverId: string }) => {
    // SECURITY: Only the receiver can mark as read
    if (data.receiverId !== user.userId) return;
    io.emit(`dm:read:${data.senderId}`, { readBy: data.receiverId });
  });

  // ---- Notification Events ----
  socket.on("notification:subscribe", (data: { userId: string }) => {
    // SECURITY: Only subscribe to your own notifications
    if (data.userId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot subscribe to another user's notifications" });
      return;
    }
    socket.join(`notifications:${data.userId}`);
  });

  // ---- PK Battle Events ----
  const activePKBattles: Record<string, { creator1Id: string; creator2Id: string; creator1Score: number; creator2Score: number; timerInterval?: ReturnType<typeof setInterval> }> = {};

  socket.on("pk:challenge", (data: { fromCreatorId: string; toCreatorId: string; streamId: string; fromCreatorName: string }) => {
    // SECURITY: Only challenge as yourself
    if (data.fromCreatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Cannot issue challenge as another creator" });
      return;
    }
    io.emit(`pk:challenge:${data.toCreatorId}`, data);
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
    // Notify both creators
    io.emit(`pk:started:${data.creator1Id}`, { battleId: data.battleId, streamId: data.streamId, opponentId: data.creator2Id });
    io.emit(`pk:started:${data.creator2Id}`, { battleId: data.battleId, streamId: data.streamId, opponentId: data.creator1Id });
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
    io.emit(`stream:accessRequest:${data.creatorId}`, data);
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
    io.emit(`dm:request:${data.receiverId}`, { ...data, message: sanitizedMessage, id: `dmreq_${Date.now()}`, timestamp: Date.now() });
  });

  socket.on("dm:requestResponse", (data: { requestId: string; receiverId: string; senderId: string; accepted: boolean }) => {
    // SECURITY: Only the receiver can respond to DM requests
    if (data.receiverId !== user.userId) {
      socket.emit("error", { message: "Cannot respond to DM requests for another user" });
      return;
    }
    io.emit(`dm:requestResponse:${data.senderId}`, data);
  });

  // ---- Task/Service Status Update Events ----
  socket.on("task:update", (data: { requestId: string; status: string; buyerId: string; creatorId: string }) => {
    // SECURITY: Only buyer or creator can send task updates
    if (data.buyerId !== user.userId && data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Not authorized to update this task" });
      return;
    }
    io.emit(`task:update:${data.buyerId}`, data);
    io.emit(`task:update:${data.creatorId}`, data);
  });

  // ---- Private Stream Started Notification ----
  socket.on("stream:privateStart", (data: { streamId: string; creatorId: string; creatorName: string; title: string; allowedUsers: string[] }) => {
    // SECURITY: Only the creator can start private streams
    if (data.creatorId !== user.userId && user.role !== "admin") {
      socket.emit("error", { message: "Not authorized to start private stream" });
      return;
    }
    data.allowedUsers.forEach((uid: string) => {
      io.emit(`stream:invite:${uid}`, { streamId: data.streamId, creatorName: data.creatorName, title: data.title });
    });
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    console.log(`[WS] Disconnected: ${socket.id} (User: ${user.userId})`);
  });
});

console.log("🟢 Rogan Live WebSocket Server running on port 3003 (authenticated)");
