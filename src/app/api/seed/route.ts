import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  try {
    // Clean up existing data
    await db.notification.deleteMany();
    await db.directMessage.deleteMany();
    await db.gift.deleteMany();
    await db.chatMessage.deleteMany();
    await db.transaction.deleteMany();
    await db.follow.deleteMany();
    await db.subscription.deleteMany();
    await db.stream.deleteMany();
    await db.ledgerAccount.deleteMany();
    await db.wallet.deleteMany();
    await db.user.deleteMany();

    const passwordHash = await hashPassword('password123');

    // Create creator users
    const creators = [];
    const creatorData = [
      { username: 'crypto_rogan', email: 'rogan@example.com', displayName: 'Crypto Rogan', bio: 'The original Rogan Live creator 🔥', avatar: null, role: 'creator' },
      { username: 'luna_dance', email: 'luna@example.com', displayName: 'Luna Dance', bio: 'Professional dancer & entertainer 💃', avatar: null, role: 'creator' },
      { username: 'dj_neon', email: 'neon@example.com', displayName: 'DJ Neon', bio: 'Live DJ sets every night 🎧', avatar: null, role: 'creator' },
      { username: 'gamer_max', email: 'max@example.com', displayName: 'Gamer Max', bio: 'Pro gamer & streamer 🎮', avatar: null, role: 'creator' },
      { username: 'chef_aria', email: 'aria@example.com', displayName: 'Chef Aria', bio: 'Cooking live every day 👩‍🍳', avatar: null, role: 'creator' },
    ];

    for (const data of creatorData) {
      const user = await db.user.create({
        data: { ...data, passwordHash },
      });
      await db.wallet.create({ data: { userId: user.id } });
      await db.ledgerAccount.create({ data: { userId: user.id, tkBalance: 50000 } }); // 500 TK starting
      creators.push(user);
    }

    // Create regular users
    const regularUsers = [];
    for (let i = 1; i <= 10; i++) {
      const user = await db.user.create({
        data: {
          username: `user${i}`,
          email: `user${i}@example.com`,
          displayName: `User ${i}`,
          passwordHash,
          role: 'user',
        },
      });
      await db.wallet.create({ data: { userId: user.id } });
      await db.ledgerAccount.create({ data: { userId: user.id, tkBalance: 10000 } }); // 100 TK starting
      regularUsers.push(user);
    }

    // Create streams for creators
    const streams = [];
    const streamData = [
      { creatorIdx: 0, title: 'Late Night Crypto Talk 🔥', viewerCount: 1247 },
      { creatorIdx: 1, title: 'Dance Party Friday! 💃', viewerCount: 892 },
      { creatorIdx: 2, title: 'EDM Live Mix Session 🎧', viewerCount: 634 },
      { creatorIdx: 3, title: 'Ranked Grind - Top 500 Push 🎮', viewerCount: 2103 },
      { creatorIdx: 4, title: 'Italian Pasta Night 👩‍🍳', viewerCount: 445 },
    ];

    for (const data of streamData) {
      const stream = await db.stream.create({
        data: {
          creatorId: creators[data.creatorIdx].id,
          title: data.title,
          streamKey: `sk_${Math.random().toString(36).slice(2, 15)}`,
          isLive: true,
          viewerCount: data.viewerCount,
          peakViewers: data.viewerCount + Math.floor(Math.random() * 500),
          startedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)),
        },
      });
      streams.push(stream);
    }

    // Create some gifts
    const giftTypes = ['rose', 'heart', 'fire', 'diamond', 'crown'];
    const giftPrices: Record<string, number> = { rose: 100, heart: 500, fire: 5000, diamond: 1000, crown: 10000 };

    for (let i = 0; i < 30; i++) {
      const sender = regularUsers[Math.floor(Math.random() * regularUsers.length)];
      const creator = creators[Math.floor(Math.random() * creators.length)];
      const stream = streams[creators.indexOf(creator)] || streams[0];
      const giftType = giftTypes[Math.floor(Math.random() * giftTypes.length)];
      const amount = giftPrices[giftType];

      await db.gift.create({
        data: {
          streamId: stream.id,
          senderId: sender.id,
          receiverId: creator.id,
          giftType,
          amount,
        },
      });
    }

    // Create some chat messages
    const chatMessages = [
      'Hey everyone! 🔥', 'Love this stream!', 'You\'re amazing!', 'Let\'s gooo!',
      'First time here, this is great!', 'Can you do a shoutout?', 'Sending gifts! 💎',
      'This is epic!', 'W stream!', 'Keep it up! 🚀',
    ];

    for (const stream of streams) {
      for (let i = 0; i < 5; i++) {
        const sender = regularUsers[Math.floor(Math.random() * regularUsers.length)];
        await db.chatMessage.create({
          data: {
            streamId: stream.id,
            userId: sender.id,
            message: chatMessages[Math.floor(Math.random() * chatMessages.length)],
            type: 'chat',
          },
        });
      }
    }

    // Create some follows
    for (const user of regularUsers) {
      for (const creator of creators) {
        if (Math.random() > 0.3) {
          await db.follow.create({
            data: { followerId: user.id, followingId: creator.id },
          });
        }
      }
    }

    // Create some DMs
    for (let i = 0; i < 5; i++) {
      const sender = regularUsers[Math.floor(Math.random() * regularUsers.length)];
      const receiver = creators[Math.floor(Math.random() * creators.length)];
      await db.directMessage.create({
        data: {
          senderId: sender.id,
          receiverId: receiver.id,
          message: `Hey! Love your streams! ${i}`,
          isPaid: i % 3 === 0,
          price: i % 3 === 0 ? 500 : 0,
        },
      });
    }

    // Create transactions for each gift (so wallet history has data)
    for (let i = 0; i < 30; i++) {
      const sender = regularUsers[Math.floor(Math.random() * regularUsers.length)];
      const creator = creators[Math.floor(Math.random() * creators.length)];
      const giftType = giftTypes[Math.floor(Math.random() * giftTypes.length)];
      const amount = giftPrices[giftType];

      await db.transaction.create({
        data: {
          type: 'gift_send',
          amount,
          fromUserId: sender.id,
          toUserId: creator.id,
          referenceId: `gift_seed_${i}`,
          metadata: JSON.stringify({ giftType }),
        },
      });
      await db.transaction.create({
        data: {
          type: 'gift_receive',
          amount: Math.floor(amount * 0.9), // 90% to creator after 10% platform fee
          fromUserId: sender.id,
          toUserId: creator.id,
          referenceId: `gift_seed_${i}_recv`,
          metadata: JSON.stringify({ giftType, fee: 0.10 }),
        },
      });
    }

    // Create deposit/withdraw transactions for creators
    for (const creator of creators) {
      // Deposit transaction
      await db.transaction.create({
        data: {
          type: 'deposit',
          amount: 50000, // 500 TK
          fromUserId: creator.id,
          toUserId: creator.id,
          metadata: JSON.stringify({ method: 'rogan_deposit' }),
        },
      });
    }
    for (const u of regularUsers) {
      await db.transaction.create({
        data: {
          type: 'deposit',
          amount: 10000, // 100 TK
          fromUserId: u.id,
          toUserId: u.id,
          metadata: JSON.stringify({ method: 'rogan_deposit' }),
        },
      });
    }

    // Create notifications
    for (const creator of creators) {
      await db.notification.create({
        data: {
          userId: creator.id,
          type: 'gift_received',
          title: 'Gift Received!',
          message: 'user1 sent you a rose!',
        },
      });
    }

    return NextResponse.json({
      message: 'Seed data created successfully',
      stats: {
        creators: creators.length,
        users: regularUsers.length,
        streams: streams.length,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Seed failed', details: String(error) }, { status: 500 });
  }
}
