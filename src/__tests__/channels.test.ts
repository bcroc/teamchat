import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let authToken: string;
let workspaceId: string;
let channelId: string;

const testUser = {
  email: `channels-test-${Date.now()}@example.com`,
  password: 'password123',
  displayName: 'Channel Test User',
};

beforeAll(async () => {
  app = await buildApp();

  // Create test user and workspace
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
    payload: { name: 'Test Workspace' },
  });

  const workspaceBody = JSON.parse(workspaceResponse.body);
  workspaceId = workspaceBody.workspace.id;
});

afterAll(async () => {
  await app.close();
});

describe('Channel Routes', () => {
  describe('POST /channels', () => {
    it('should create a channel', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/channels',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          workspaceId,
          name: 'test-channel',
          description: 'A test channel',
          isPrivate: false,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.channel).toBeDefined();
      expect(body.channel.name).toBe('test-channel');
      expect(body.channel.description).toBe('A test channel');
      expect(body.channel.isPrivate).toBe(false);

      channelId = body.channel.id;
    });

    it('should reject invalid channel name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/channels',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          workspaceId,
          name: 'Invalid Name!',
          isPrivate: false,
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should reject duplicate channel name in workspace', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/channels',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          workspaceId,
          name: 'test-channel',
          isPrivate: false,
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /channels', () => {
    it('should list channels for workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/channels?workspaceId=${workspaceId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.channels).toBeDefined();
      expect(Array.isArray(body.channels)).toBe(true);
      // Should have general (created with workspace) + test-channel
      expect(body.channels.length).toBeGreaterThanOrEqual(2);
    });

    it('should require workspaceId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/channels',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /channels/:id', () => {
    it('should get channel details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/channels/${channelId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.channel).toBeDefined();
      expect(body.channel.id).toBe(channelId);
      expect(body.channel.members).toBeDefined();
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/channels/00000000-0000-0000-0000-000000000000',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /channels/:id', () => {
    it('should update channel description', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/channels/${channelId}`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.channel.description).toBe('Updated description');
    });
  });
});
