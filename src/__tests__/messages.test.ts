import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let authToken: string;
let workspaceId: string;
let channelId: string;
let messageId: string;

const testUser = {
  email: `messages-test-${Date.now()}@example.com`,
  password: 'password123',
  displayName: 'Message Test User',
};

beforeAll(async () => {
  app = await buildApp();

  // Create test user
  const signupResponse = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: testUser,
  });

  const signupBody = JSON.parse(signupResponse.body);
  authToken = signupBody.token;

  // Create workspace
  const workspaceResponse = await app.inject({
    method: 'POST',
    url: '/workspaces',
    headers: { Authorization: `Bearer ${authToken}` },
    payload: { name: 'Message Test Workspace' },
  });

  const workspaceBody = JSON.parse(workspaceResponse.body);
  workspaceId = workspaceBody.workspace.id;

  // Get the general channel created with workspace
  const channelsResponse = await app.inject({
    method: 'GET',
    url: `/channels?workspaceId=${workspaceId}`,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  const channelsBody = JSON.parse(channelsResponse.body);
  channelId = channelsBody.channels.find((c: any) => c.name === 'general').id;
});

afterAll(async () => {
  await app.close();
});

describe('Message Routes', () => {
  describe('POST /messages', () => {
    it('should create a message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/messages',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          channelId,
          body: 'Hello, world!',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.message).toBeDefined();
      expect(body.message.body).toBe('Hello, world!');
      expect(body.message.sender).toBeDefined();
      expect(body.message.sender.displayName).toBe(testUser.displayName);

      messageId = body.message.id;
    });

    it('should reject empty message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/messages',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          channelId,
          body: '',
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should require channelId or dmThreadId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/messages',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          body: 'Hello',
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /messages', () => {
    it('should list messages for channel', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/messages?channelId=${channelId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.items).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    });

    it('should support pagination limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/messages?channelId=${channelId}&limit=1`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.items.length).toBeLessThanOrEqual(1);
    });
  });

  describe('PATCH /messages/:id', () => {
    it('should edit own message', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/messages/${messageId}`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          body: 'Hello, edited world!',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.message.body).toBe('Hello, edited world!');
    });
  });

  describe('POST /messages/:id/reactions', () => {
    it('should add reaction', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/messages/${messageId}/reactions`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          emoji: '👍',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.reaction).toBeDefined();
      expect(body.reaction.emoji).toBe('👍');
    });

    it('should return existing reaction if duplicate', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/messages/${messageId}/reactions`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          emoji: '👍',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.created).toBe(false);
    });
  });

  describe('DELETE /messages/:id/reactions/:emoji', () => {
    it('should remove reaction', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/messages/${messageId}/reactions/${encodeURIComponent('👍')}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('DELETE /messages/:id', () => {
    it('should soft delete message', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/messages/${messageId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify message is soft deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/messages/${messageId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const body = JSON.parse(getResponse.body);
      expect(body.message.isDeleted).toBe(true);
      expect(body.message.body).toBe('[Message deleted]');
    });
  });
});
