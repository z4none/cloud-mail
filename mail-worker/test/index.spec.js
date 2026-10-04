import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src';
import jwtUtils from '../src/utils/jwt-utils';
import rateLimitService from '../src/service/rate-limit-service';
import r2Service from '../src/service/r2-service';
import emailService from '../src/service/email-service';

const context = { env: { jwt_secret: 'test-secret' } };

describe('protected objects', () => {
	it('rejects unauthenticated object reads', async () => {
		const request = new Request('http://example.com/api/object?key=attachments/test.txt');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
	});
});

describe('JWT sessions', () => {
	it('creates and verifies an expiring token', async () => {
		const token = await jwtUtils.generateToken(context, { userId: 42, token: 'session-token' }, 60);
		const payload = await jwtUtils.verifyToken(context, token);

		expect(payload.userId).toBe(42);
		expect(payload.token).toBe('session-token');
		expect(payload.exp).toBeTypeOf('number');
	});

	it('rejects a token signed with a different secret', async () => {
		const token = await jwtUtils.generateToken(context, { userId: 42, token: 'session-token' }, 60);
		const payload = await jwtUtils.verifyToken({ env: { jwt_secret: 'wrong-secret' } }, token);

		expect(payload).toBeNull();
	});
});

describe('storage selection', () => {
	it('prioritizes configured S3, then R2, then KV', async () => {
		const withSetting = (setting, env = {}) => ({ get: () => setting, env });

		expect(await r2Service.storageType(withSetting({ bucket: 'bucket', endpoint: 'https://s3.example.com', s3AccessKey: 'key', s3SecretKey: 'secret' }, { r2: {} }))).toBe('S3');
		expect(await r2Service.storageType(withSetting({ bucket: '', endpoint: '', s3AccessKey: '', s3SecretKey: '' }, { r2: {} }))).toBe('R2');
		expect(await r2Service.storageType(withSetting({ bucket: '', endpoint: '', s3AccessKey: '', s3SecretKey: '' }))).toBe('KV');
	});
});

describe('email thread matching', () => {
	it('normalizes reply and forward prefixes before subject fallback', () => {
		expect(emailService.normalizeThreadSubject('Re: 回复： Fwd: Project update')).toBe('project update');
	});

	it('extracts every RFC reply reference for exact matching', () => {
		expect(emailService.threadReferenceIds({
			inReplyTo: '<first@example.test>',
			relation: '<first@example.test> <second@example.test>'
		})).toEqual(['<first@example.test>', '<second@example.test>']);
	});
});

describe('rate limits', () => {
	it('rejects requests after the configured threshold', async () => {
		const values = new Map();
		const kv = {
			get: async (key) => values.get(key) || null,
			put: async (key, value) => values.set(key, value),
		};
		const request = (path) => ({
			req: {
				path,
				header: (name) => name === 'CF-Connecting-IP' ? '127.0.0.1' : undefined,
			},
			env: { kv },
		});

		for (let index = 0; index < 10; index += 1) {
			await rateLimitService.check(request('/login'));
		}

		await expect(rateLimitService.check(request('/login'))).rejects.toMatchObject({ code: 429 });
	});
});
