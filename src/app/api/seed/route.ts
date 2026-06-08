import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, getUserFromRequest } from '@/lib/auth';

// SECURITY: Seed endpoint is dangerous — restrict heavily
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Block in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Forbidden in production' }, { status: 403 });
    }

    // SECURITY: Require admin authentication even in development
    const user = await getUserFromRequest();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required. In dev, use seed script directly.' }, { status: 403 });
    }

    // Clean up existing data (Phase 3 models first due to foreign keys)
    await db.serviceReview.deleteMany();
    await db.pKBattle.deleteMany();
    await db.subscriptionTier.deleteMany();
    // Phase 1+2 models
    await db.notification.deleteMany();
    await db.directMessage.deleteMany();
    await db.serviceRequest.deleteMany();
    await db.serviceListing.deleteMany();
    await db.streamAccess.deleteMany();
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
      { username: 'crypto_rogan', email: 'rogan@example.com', displayName: 'Crypto Rogan', bio: 'The original Rogan Live creator', avatar: null, role: 'creator' },
      { username: 'luna_dance', email: 'luna@example.com', displayName: 'Luna Dance', bio: 'Professional dancer & entertainer', avatar: null, role: 'creator' },
      { username: 'dj_neon', email: 'neon@example.com', displayName: 'DJ Neon', bio: 'Live DJ sets every night', avatar: null, role: 'creator' },
      { username: 'gamer_max', email: 'max@example.com', displayName: 'Gamer Max', bio: 'Pro gamer & streamer', avatar: null, role: 'creator' },
      { username: 'chef_aria', email: 'aria@example.com', displayName: 'Chef Aria', bio: 'Cooking live every day', avatar: null, role: 'creator' },
    ];

    for (const data of creatorData) {
      const user = await db.user.create({
        data: { ...data, passwordHash },
      });
      await db.wallet.create({ data: { userId: user.id } });
      await db.ledgerAccount.create({ data: { userId: user.id, tkBalance: 50000 } }); // 500 TK starting
      creators.push(user);
    }

    // Create an admin user for seed management
    const adminUser = await db.user.create({
      data: { username: 'admin', email: 'admin@rogan.live', displayName: 'Admin', passwordHash, role: 'admin' },
    });
    await db.wallet.create({ data: { userId: adminUser.id } });
    await db.ledgerAccount.create({ data: { userId: adminUser.id, tkBalance: 99999900 } });

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
      { creatorIdx: 0, title: 'Late Night Crypto Talk', viewerCount: 1247, isPrivate: false },
      { creatorIdx: 1, title: 'Dance Party Friday!', viewerCount: 892, isPrivate: false },
      { creatorIdx: 2, title: 'EDM Live Mix Session', viewerCount: 634, isPrivate: false },
      { creatorIdx: 3, title: 'Ranked Grind - Top 500 Push', viewerCount: 2103, isPrivate: false },
      { creatorIdx: 4, title: 'Italian Pasta Night', viewerCount: 445, isPrivate: false },
    ];

    for (const data of streamData) {
      const stream = await db.stream.create({
        data: {
          creatorId: creators[data.creatorIdx].id,
          title: data.title,
          streamKey: `sk_${Math.random().toString(36).slice(2, 15)}`,
          isLive: true,
          isPrivate: data.isPrivate,
          viewerCount: data.viewerCount,
          peakViewers: data.viewerCount + Math.floor(Math.random() * 500),
          startedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)),
        },
      });
      streams.push(stream);
    }

    // Create private streams
    const privateStreams = [];
    const privateStreamData = [
      { creatorIdx: 0, title: 'VIP Crypto Analysis', viewerCount: 15 },
      { creatorIdx: 1, title: 'Private Dance Lesson', viewerCount: 3 },
      { creatorIdx: 3, title: 'Exclusive Gaming Coaching', viewerCount: 5 },
    ];

    for (const data of privateStreamData) {
      const stream = await db.stream.create({
        data: {
          creatorId: creators[data.creatorIdx].id,
          title: data.title,
          streamKey: `sk_priv_${Math.random().toString(36).slice(2, 15)}`,
          isLive: true,
          isPrivate: true,
          viewerCount: data.viewerCount,
          peakViewers: data.viewerCount + 2,
          startedAt: new Date(Date.now() - Math.floor(Math.random() * 1800000)),
        },
      });
      privateStreams.push(stream);
    }

    // Grant access to some users for private streams
    await db.streamAccess.create({ data: { streamId: privateStreams[0].id, userId: regularUsers[0].id } });
    await db.streamAccess.create({ data: { streamId: privateStreams[0].id, userId: regularUsers[1].id } });
    await db.streamAccess.create({ data: { streamId: privateStreams[1].id, userId: regularUsers[2].id } });
    await db.streamAccess.create({ data: { streamId: privateStreams[2].id, userId: regularUsers[0].id } });

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
      'Hey everyone!', 'Love this stream!', 'You are amazing!', 'Let us go!',
      'First time here, this is great!', 'Can you do a shoutout?', 'Sending gifts!',
      'This is epic!', 'W stream!', 'Keep it up!',
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
    for (let i = 0; i < 8; i++) {
      const sender = regularUsers[Math.floor(Math.random() * regularUsers.length)];
      const receiver = creators[Math.floor(Math.random() * creators.length)];
      const isPaid = i % 3 === 0;
      await db.directMessage.create({
        data: {
          senderId: sender.id,
          receiverId: receiver.id,
          message: `Hey! Love your streams! ${i}`,
          isPaid,
          price: isPaid ? 500 : 0,
          isRead: Math.random() > 0.4,
        },
      });
    }

    // Create DM conversations between users
    const dmMessages = [
      { from: 0, to: 1, msg: 'Hey! Love your streams!' },
      { from: 1, to: 2, msg: 'Can I get a shoutout?' },
      { from: 2, to: 3, msg: 'Your DJ sets are amazing!' },
      { from: 3, to: 4, msg: 'GG on that last game!' },
      { from: 4, to: 0, msg: 'The pasta recipe was great!' },
      { from: 5, to: 0, msg: 'How do I get into crypto?' },
      { from: 6, to: 1, msg: 'I want to learn to dance too!' },
      { from: 0, to: 2, msg: 'When is your next set?' },
    ];

    for (const dm of dmMessages) {
      const sender = regularUsers[dm.from];
      const receiver = creators[dm.to % creators.length];
      await db.directMessage.create({
        data: {
          senderId: sender.id,
          receiverId: receiver.id,
          message: dm.msg,
          isPaid: false,
          price: 0,
          isRead: Math.random() > 0.5,
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
          amount: Math.floor(amount * 0.9),
          fromUserId: sender.id,
          toUserId: creator.id,
          referenceId: `gift_seed_${i}_recv`,
          metadata: JSON.stringify({ giftType, fee: 0.10 }),
        },
      });
    }

    // Create deposit/withdraw transactions for creators
    for (const creator of creators) {
      await db.transaction.create({
        data: {
          type: 'deposit',
          amount: 50000,
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
          amount: 10000,
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

    // ===== PHASE 2: Service Listings =====
    const serviceData = [
      { creatorIdx: 0, title: '1-on-1 Crypto Consultation', description: 'Get personalized crypto investment advice in a 30-minute video call.', category: 'video_call', price: 50, deliveryDays: 1, rating: 4.8, reviewCount: 24 },
      { creatorIdx: 0, title: 'Custom Market Analysis Video', description: 'I will create a personalized 10-minute video analyzing the crypto markets.', category: 'custom_video', price: 25, deliveryDays: 2, rating: 4.5, reviewCount: 12 },
      { creatorIdx: 1, title: 'Private Dance Lesson', description: 'Learn your favorite dance moves in a private 1-hour video call session.', category: 'coaching', price: 35, deliveryDays: 1, rating: 5.0, reviewCount: 8 },
      { creatorIdx: 1, title: 'Personalized Dance Shoutout', description: 'I will create a custom dance video shoutout for you or a friend!', category: 'shoutout', price: 10, deliveryDays: 2, rating: 4.9, reviewCount: 45 },
      { creatorIdx: 2, title: 'Custom DJ Mix for Your Event', description: 'I will create a personalized 1-hour DJ mix tailored to your event.', category: 'custom_video', price: 75, deliveryDays: 5, rating: 4.7, reviewCount: 18 },
      { creatorIdx: 2, title: 'Live DJ Coaching Session', description: 'Learn DJing basics or advanced techniques in a 1-hour live coaching session.', category: 'coaching', price: 40, deliveryDays: 1, rating: 4.6, reviewCount: 6 },
      { creatorIdx: 3, title: 'Gaming Coaching - Rank Up!', description: '1-hour coaching session to help you improve your gameplay.', category: 'coaching', price: 30, deliveryDays: 1, rating: 4.9, reviewCount: 32 },
      { creatorIdx: 3, title: 'Custom Gaming Highlight Video', description: 'Send me your gameplay clips and I will edit them into an epic highlight reel.', category: 'custom_video', price: 20, deliveryDays: 3, rating: 4.4, reviewCount: 15 },
      { creatorIdx: 4, title: 'Personalized Recipe & Cooking Guide', description: 'Tell me your dietary preferences and I will create a custom recipe video.', category: 'custom_video', price: 15, deliveryDays: 2, rating: 4.8, reviewCount: 20 },
      { creatorIdx: 4, title: 'Cooking Class - Italian Specialties', description: 'Join me for a live 1-hour cooking class where we make authentic Italian pasta.', category: 'video_call', price: 25, deliveryDays: 1, rating: 5.0, reviewCount: 11 },
    ];

    for (const data of serviceData) {
      await db.serviceListing.create({
        data: {
          creatorId: creators[data.creatorIdx].id,
          title: data.title,
          description: data.description,
          category: data.category,
          price: data.price * 100,
          deliveryDays: data.deliveryDays,
          rating: data.rating,
          reviewCount: data.reviewCount,
          isActive: true,
        },
      });
    }

    // ===== PHASE 2: Service Requests =====
    const requestData = [
      { buyerIdx: 0, serviceCreatorIdx: 0, serviceTitle: '1-on-1 Crypto Consultation', message: 'I would like to discuss my BTC and ETH holdings.', status: 'accepted', price: 50 },
      { buyerIdx: 1, serviceCreatorIdx: 1, serviceTitle: 'Personalized Dance Shoutout', message: 'Can you make a birthday shoutout for my friend Sarah?', status: 'in_progress', price: 10 },
      { buyerIdx: 2, serviceCreatorIdx: 3, serviceTitle: 'Gaming Coaching - Rank Up!', message: 'I am stuck in Gold and want to reach Platinum.', status: 'delivered', deliveryMessage: 'Here is my analysis of your gameplay!', price: 30 },
      { buyerIdx: 3, serviceCreatorIdx: 2, serviceTitle: 'Custom DJ Mix for Your Event', message: 'I need a chill lo-fi mix for my study group sessions.', status: 'pending', price: 75 },
      { buyerIdx: 4, serviceCreatorIdx: 4, serviceTitle: 'Cooking Class - Italian Specialties', message: 'I want to learn to make carbonara!', status: 'completed', price: 25 },
      { buyerIdx: 5, serviceCreatorIdx: 0, serviceTitle: 'Custom Market Analysis Video', message: 'Can you analyze the altcoin market?', status: 'cancelled', price: 25 },
    ];

    const allServices = await db.serviceListing.findMany();

    for (const data of requestData) {
      const matchingService = allServices.find(
        (s) => s.creatorId === creators[data.serviceCreatorIdx].id && s.title === data.serviceTitle
      );

      if (matchingService) {
        await db.serviceRequest.create({
          data: {
            serviceId: matchingService.id,
            buyerId: regularUsers[data.buyerIdx].id,
            creatorId: creators[data.serviceCreatorIdx].id,
            message: data.message,
            status: data.status,
            price: data.price * 100,
            deliveryMessage: data.deliveryMessage || null,
          },
        });
      }
    }

    // ===== PHASE 3: Subscription Tiers =====
    const tierData = [
      { creatorIdx: 0, name: 'Basic Fan', tier: 'basic', price: 500, benefits: ['Chat badge', 'Emotes access'] },
      { creatorIdx: 0, name: 'Premium Supporter', tier: 'premium', price: 2000, benefits: ['Chat badge', 'Emotes access', 'Private chat access', 'Priority Q&A'] },
      { creatorIdx: 0, name: 'VIP Inner Circle', tier: 'vip', price: 5000, benefits: ['All premium perks', '1-on-1 monthly call', 'Exclusive content', 'Behind the scenes'] },
      { creatorIdx: 1, name: 'Dance Fan', tier: 'basic', price: 500, benefits: ['Chat badge', 'Dance emotes'] },
      { creatorIdx: 1, name: 'Dance VIP', tier: 'premium', price: 2000, benefits: ['Chat badge', 'Dance emotes', 'Private lessons discount', 'Shoutout priority'] },
      { creatorIdx: 2, name: 'Beat Lover', tier: 'basic', price: 500, benefits: ['Chat badge', 'Song requests'] },
      { creatorIdx: 2, name: 'DJ VIP', tier: 'vip', price: 5000, benefits: ['All premium perks', 'Custom mix monthly', 'Backstage access', 'Early releases'] },
      { creatorIdx: 3, name: 'Gamer Buddy', tier: 'basic', price: 500, benefits: ['Chat badge', 'Game emotes'] },
      { creatorIdx: 3, name: 'Pro Gamer Sub', tier: 'premium', price: 2000, benefits: ['Chat badge', 'Game emotes', 'Coaching discount', 'Play together Fridays'] },
      { creatorIdx: 4, name: 'Foodie Fan', tier: 'basic', price: 500, benefits: ['Chat badge', 'Recipe access'] },
      { creatorIdx: 4, name: 'Kitchen VIP', tier: 'premium', price: 2000, benefits: ['Chat badge', 'Recipe access', 'Private cooking class discount', 'Custom recipes'] },
    ];

    for (const data of tierData) {
      await db.subscriptionTier.create({
        data: {
          creatorId: creators[data.creatorIdx].id,
          name: data.name,
          tier: data.tier,
          price: data.price,
          benefits: JSON.stringify(data.benefits),
          isActive: true,
        },
      });
    }

    // ===== PHASE 3: Active Subscriptions =====
    const subscriptionData = [
      { subscriberIdx: 0, creatorIdx: 0, tier: 'premium', price: 2000 },
      { subscriberIdx: 1, creatorIdx: 0, tier: 'basic', price: 500 },
      { subscriberIdx: 2, creatorIdx: 1, tier: 'premium', price: 2000 },
      { subscriberIdx: 3, creatorIdx: 3, tier: 'basic', price: 500 },
      { subscriberIdx: 4, creatorIdx: 4, tier: 'premium', price: 2000 },
      { subscriberIdx: 5, creatorIdx: 2, tier: 'basic', price: 500 },
      { subscriberIdx: 6, creatorIdx: 0, tier: 'vip', price: 5000 },
      { subscriberIdx: 7, creatorIdx: 1, tier: 'basic', price: 500 },
      { subscriberIdx: 8, creatorIdx: 3, tier: 'premium', price: 2000 },
      { subscriberIdx: 9, creatorIdx: 2, tier: 'vip', price: 5000 },
    ];

    for (const data of subscriptionData) {
      await db.subscription.create({
        data: {
          subscriberId: regularUsers[data.subscriberIdx].id,
          creatorId: creators[data.creatorIdx].id,
          tier: data.tier,
          price: data.price,
          isActive: true,
          startDate: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 3600000)),
        },
      });
    }

    // ===== PHASE 3: PK Battles =====
    await db.pKBattle.create({
      data: {
        streamId: streams[0].id,
        creator1Id: creators[0].id,
        creator2Id: creators[1].id,
        creator1Score: 4500,
        creator2Score: 3200,
        status: 'active',
        duration: 300,
        startedAt: new Date(Date.now() - 120000),
      },
    });

    await db.pKBattle.create({
      data: {
        streamId: streams[3].id,
        creator1Id: creators[3].id,
        creator2Id: creators[2].id,
        creator1Score: 8200,
        creator2Score: 7600,
        status: 'completed',
        duration: 300,
        startedAt: new Date(Date.now() - 3600000),
        endedAt: new Date(Date.now() - 3300000),
        winnerId: creators[3].id,
      },
    });

    const pkStream = await db.stream.create({
      data: {
        creatorId: creators[4].id,
        title: 'PK Battle Stream',
        streamKey: `sk_pk_${Math.random().toString(36).slice(2, 15)}`,
        isLive: true,
        isPrivate: false,
        viewerCount: 523,
        peakViewers: 800,
        startedAt: new Date(Date.now() - 300000),
      },
    });

    await db.pKBattle.create({
      data: {
        streamId: pkStream.id,
        creator1Id: creators[4].id,
        creator2Id: creators[0].id,
        creator1Score: 0,
        creator2Score: 0,
        status: 'pending',
        duration: 600,
      },
    });

    // ===== PHASE 3: Service Reviews =====
    const allRequests = await db.serviceRequest.findMany({
      where: { status: 'completed' },
    });

    const reviewData = [
      { rating: 5, comment: 'Absolutely amazing! Best consultation ever.' },
      { rating: 4, comment: 'Great session, learned a lot.' },
      { rating: 5, comment: 'The cooking class was so fun!' },
      { rating: 4, comment: 'Really good service, delivered on time.' },
      { rating: 5, comment: 'Went above and beyond! Highly recommend.' },
    ];

    for (let i = 0; i < Math.min(reviewData.length, allRequests.length); i++) {
      const req = allRequests[i];
      const rev = reviewData[i];
      const existingReview = await db.serviceReview.findUnique({ where: { requestId: req.id } });
      if (!existingReview) {
        await db.serviceReview.create({
          data: {
            serviceId: req.serviceId,
            requestId: req.id,
            reviewerId: req.buyerId,
            creatorId: req.creatorId,
            rating: rev.rating,
            comment: rev.comment,
          },
        });
      }
    }

    const completedRequests = allRequests.slice(0, 5);
    if (completedRequests.length > 0) {
      const allServicesList = await db.serviceListing.findMany();
      const extraReviews = [
        { serviceIdx: 0, reviewerIdx: 0, rating: 5, comment: 'Crypto Rogan gave me the best investment advice.' },
        { serviceIdx: 1, reviewerIdx: 1, rating: 4, comment: 'Good analysis video, very detailed.' },
        { serviceIdx: 6, reviewerIdx: 2, rating: 5, comment: 'Gamer Max helped me climb from Gold to Diamond!' },
        { serviceIdx: 9, reviewerIdx: 3, rating: 5, comment: 'Best cooking class ever!' },
      ];

      for (const rev of extraReviews) {
        if (rev.serviceIdx < allServicesList.length) {
          const service = allServicesList[rev.serviceIdx];
          const tempRequest = await db.serviceRequest.create({
            data: {
              serviceId: service.id,
              buyerId: regularUsers[rev.reviewerIdx].id,
              creatorId: service.creatorId,
              message: 'Seed review request',
              status: 'completed',
              price: service.price,
              deliveryMessage: 'Seed delivery message',
            },
          });

          const existingRev = await db.serviceReview.findUnique({ where: { requestId: tempRequest.id } });
          if (!existingRev) {
            await db.serviceReview.create({
              data: {
                serviceId: service.id,
                requestId: tempRequest.id,
                reviewerId: regularUsers[rev.reviewerIdx].id,
                creatorId: service.creatorId,
                rating: rev.rating,
                comment: rev.comment,
              },
            });
          }
        }
      }
    }

    return NextResponse.json({
      message: 'Seed data created successfully (Phase 1 + Phase 2 + Phase 3)',
      stats: {
        creators: creators.length,
        users: regularUsers.length,
        admin: 1,
        streams: streams.length + privateStreams.length + 1,
        privateStreams: privateStreams.length,
        serviceListings: serviceData.length,
        serviceRequests: requestData.length,
        streamAccessGrants: 4,
        subscriptionTiers: tierData.length,
        subscriptions: subscriptionData.length,
        pkBattles: 3,
        serviceReviews: reviewData.length + 4,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    // SECURITY: Don't expose internal error details to client
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 });
  }
}
