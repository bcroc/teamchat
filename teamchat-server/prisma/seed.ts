import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test users
  const passwordHash = await argon2.hash('password123');

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      passwordHash,
      displayName: 'Alice',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      passwordHash,
      displayName: 'Bob',
    },
  });

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@example.com' },
    update: {},
    create: {
      email: 'charlie@example.com',
      passwordHash,
      displayName: 'Charlie',
    },
  });

  console.log('Created users:', { alice: alice.id, bob: bob.id, charlie: charlie.id });

  // Create a workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Acme Inc',
    },
  });

  console.log('Created workspace:', workspace.id);

  // Add members to workspace
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: alice.id },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: alice.id,
      role: 'owner',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: bob.id },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: bob.id,
      role: 'admin',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: charlie.id },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: charlie.id,
      role: 'member',
    },
  });

  // Create channels
  const generalChannel = await prisma.channel.upsert({
    where: {
      workspaceId_name: { workspaceId: workspace.id, name: 'general' },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'general',
      description: 'General discussions',
      isPrivate: false,
      createdBy: alice.id,
    },
  });

  const randomChannel = await prisma.channel.upsert({
    where: {
      workspaceId_name: { workspaceId: workspace.id, name: 'random' },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'random',
      description: 'Random stuff',
      isPrivate: false,
      createdBy: alice.id,
    },
  });

  const privateChannel = await prisma.channel.upsert({
    where: {
      workspaceId_name: { workspaceId: workspace.id, name: 'leadership' },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'leadership',
      description: 'Leadership discussions',
      isPrivate: true,
      createdBy: alice.id,
    },
  });

  console.log('Created channels');

  // Add all users to public channels
  for (const user of [alice, bob, charlie]) {
    for (const channel of [generalChannel, randomChannel]) {
      await prisma.channelMember.upsert({
        where: {
          channelId_userId: { channelId: channel.id, userId: user.id },
        },
        update: {},
        create: {
          channelId: channel.id,
          userId: user.id,
        },
      });
    }
  }

  // Add only alice and bob to private channel
  for (const user of [alice, bob]) {
    await prisma.channelMember.upsert({
      where: {
        channelId_userId: { channelId: privateChannel.id, userId: user.id },
      },
      update: {},
      create: {
        channelId: privateChannel.id,
        userId: user.id,
      },
    });
  }

  // Create some sample messages
  await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      channelId: generalChannel.id,
      senderId: alice.id,
      body: 'Welcome to the general channel! 👋',
    },
  });

  await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      channelId: generalChannel.id,
      senderId: bob.id,
      body: 'Hey everyone! Excited to be here.',
    },
  });

  await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      channelId: generalChannel.id,
      senderId: charlie.id,
      body: 'Hello! Looking forward to collaborating.',
    },
  });

  // Create a DM thread between alice and bob
  const [userAId, userBId] = [alice.id, bob.id].sort();
  const dmThread = await prisma.dmThread.upsert({
    where: {
      workspaceId_userAId_userBId: { workspaceId: workspace.id, userAId, userBId },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userAId,
      userBId,
    },
  });

  await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      dmThreadId: dmThread.id,
      senderId: alice.id,
      body: 'Hey Bob, can we sync up on the project?',
    },
  });

  await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      dmThreadId: dmThread.id,
      senderId: bob.id,
      body: 'Sure! Let me know when you are free.',
    },
  });

  console.log('Created sample messages');

  console.log('Seeding complete!');
  console.log('\nTest credentials:');
  console.log('  alice@example.com / password123 (owner)');
  console.log('  bob@example.com / password123 (admin)');
  console.log('  charlie@example.com / password123 (member)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
