import { Server } from "socket.io";

const io = new Server(3003, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory state for the MVP
const streamViewers: Record<string, Set<string>> = {};
const activeStreams: Record<string, { creatorId: string; creatorName: string; title: string; viewerCount: number; thumbnailUrl?: string }> = {};

io.on("connection", (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);

  // ---- Stream Events ----
  socket.on("stream:start", (data: { streamId: string; creatorId: string; creatorName: string; title: string }) => {
    const { streamId, creatorId, creatorName, title } = data;
    activeStreams[streamId] = { creatorId, creatorName, title, viewerCount: 0 };
    if (!streamViewers[streamId]) streamViewers[streamId] = new Set();
    io.emit("stream:live", { streamId, creatorId, creatorName, title, viewerCount: 0 });
    console.log(`[Stream] Started: ${title} by ${creatorName}`);
  });

  socket.on("stream:join", (data: { streamId: string; userId: string }) => {
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
    const { streamId } = data;
    delete activeStreams[streamId];
    delete streamViewers[streamId];
    io.emit("stream:ended", { streamId });
    console.log(`[Stream] Ended: ${streamId}`);
  });

  socket.on("stream:getLive", () => {
    socket.emit("stream:liveList", Object.entries(activeStreams).map(([id, s]) => ({
      streamId: id,
      ...s,
    })));
  });

  // ---- Chat Events ----
  socket.on("chat:message", (data: { streamId: string; userId: string; username: string; message: string; avatar?: string }) => {
    const chatMsg = {
      ...data,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: "chat" as const,
    };
    io.to(`stream:${data.streamId}`).emit("chat:message", chatMsg);
  });

  socket.on("chat:system", (data: { streamId: string; message: string }) => {
    io.to(`stream:${data.streamId}`).emit("chat:message", {
      id: `sys_${Date.now()}`,
      streamId: data.streamId,
      message: data.message,
      type: "system",
      timestamp: Date.now(),
    });
  });

  // ---- Gift Events ----
  socket.on("gift:send", (data: { streamId: string; senderId: string; senderName: string; receiverId: string; giftType: string; amount: number; message?: string }) => {
    const giftEvent = {
      ...data,
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
    const dmEvent = {
      ...data,
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    // Notify receiver
    io.emit(`dm:${data.receiverId}`, dmEvent);
    // Confirm to sender
    socket.emit("dm:sent", dmEvent);
  });

  socket.on("dm:typing", (data: { senderId: string; receiverId: string }) => {
    io.emit(`dm:typing:${data.receiverId}`, { senderId: data.senderId });
  });

  socket.on("dm:read", (data: { senderId: string; receiverId: string }) => {
    io.emit(`dm:read:${data.senderId}`, { readBy: data.receiverId });
  });

  // ---- Notification Events ----
  socket.on("notification:subscribe", (data: { userId: string }) => {
    socket.join(`notifications:${data.userId}`);
  });

  // ---- PK Battle Events ----
  socket.on("pk:challenge", (data: { fromCreatorId: string; toCreatorId: string; streamId: string }) => {
    io.emit(`pk:challenge:${data.toCreatorId}`, data);
  });

  socket.on("pk:update", (data: { streamId: string; creator1Score: number; creator2Score: number }) => {
    io.to(`stream:${data.streamId}`).emit("pk:update", data);
  });

  // ---- Private Stream Access Events ----
  socket.on("stream:accessRequest", (data: { streamId: string; userId: string; username: string; creatorId: string }) => {
    io.emit(`stream:accessRequest:${data.creatorId}`, data);
  });

  // ---- DM Request Events (for non-followers) ----
  socket.on("dm:request", (data: { senderId: string; senderName: string; receiverId: string; message: string }) => {
    io.emit(`dm:request:${data.receiverId}`, { ...data, id: `dmreq_${Date.now()}`, timestamp: Date.now() });
  });

  socket.on("dm:requestResponse", (data: { requestId: string; receiverId: string; senderId: string; accepted: boolean }) => {
    io.emit(`dm:requestResponse:${data.senderId}`, data);
  });

  // ---- Task/Service Status Update Events ----
  socket.on("task:update", (data: { requestId: string; status: string; buyerId: string; creatorId: string }) => {
    io.emit(`task:update:${data.buyerId}`, data);
    io.emit(`task:update:${data.creatorId}`, data);
  });

  // ---- Private Stream Started Notification ----
  socket.on("stream:privateStart", (data: { streamId: string; creatorId: string; creatorName: string; title: string; allowedUsers: string[] }) => {
    data.allowedUsers.forEach((uid: string) => {
      io.emit(`stream:invite:${uid}`, { streamId: data.streamId, creatorName: data.creatorName, title: data.title });
    });
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    console.log(`[WS] Disconnected: ${socket.id}`);
  });
});

console.log("🟢 Rogan Live WebSocket Server running on port 3003");
