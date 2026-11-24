import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src';
import jwtUtils from '../src/utils/jwt-utils';
import rateLimitService from '../src/service/rate-limit-service';
import r2Service from '../src/service/r2-service';
import emailService from '../src/service/email-service';
import aiService from '../src/service/ai-service';
import settingService from '../src/service/setting-service';
import draftService from '../src/service/draft-service';

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

describe('outbound provider errors', () => {
	it('preserves a provider rejection instead of hiding it as 501', () => {
		const error = emailService.providerError({ message: 'Invalid `to` field', statusCode: 422 });
		expect(error.message).toBe('Invalid `to` field');
		expect(error.code).toBe(422);
		expect(emailService.providerError({ message: 'provider unavailable', statusCode: 500 }).code).toBe(400);
	});

	it('omits reply headers that are not message ids', () => {
		expect(emailService.replyHeaders('user@fynxlab.com')).toEqual({
			'in-reply-to': '<user@fynxlab.com>',
			references: '<user@fynxlab.com>',
		});
		expect(emailService.replyHeaders('<first@example.test> <second@example.test>').references).toBe('<first@example.test> <second@example.test>');
		expect(emailService.replyHeaders('not a message id')).toBeNull();
	});
});

describe('AI mailbox access', () => {
	it('parses and deduplicates authorized account ids', () => {
		expect(settingService.parseAiAccountIds('[2,2,0,"3"]')).toEqual([2, 3]);
		expect(settingService.parseAiAccountIds('not-json')).toEqual([]);
	});

	it('accepts only the matching token hash', async () => {
		const hash = await settingService.hashAiToken('secret-token');
		const actual = await settingService.hashAiToken('secret-token');
		expect(aiService.tokenMatches(actual, hash)).toBe(true);
		expect(aiService.tokenMatches(await settingService.hashAiToken('other-token'), hash)).toBe(false);
		expect(aiService.tokenMatches('', hash)).toBe(false);
	});

	it('rejects mailboxes outside the authorized set', () => {
		const accounts = [{ accountId: 7, email: 'hi@musicraft.io', userId: 1 }];
		expect(aiService.requireAccount(accounts, 7).email).toBe('hi@musicraft.io');
		expect(() => aiService.requireAccount(accounts, 8)).toThrowError('This mailbox is not allowed');
	});

	it('builds an English reply subject without changing the message body', () => {
		expect(aiService.replySubject('回复：Invoice')).toBe('Re: Invoice');
	});

	it('compares ISO timestamps with the stored UTC text format', () => {
		expect(aiService.normalizeSince('2026-11-24T00:00:00Z')).toBe('2026-11-24 00:00:00');
	});
});

describe('server drafts', () => {
	it('rejects an invalid draft recipient and keeps a valid address', () => {
		expect(draftService.recipients(['person@example.com'])).toEqual(['person@example.com']);
		expect(() => draftService.recipients(['not-an-email'])).toThrowError('Recipient email is invalid');
	});

	it('uses an English reply subject for a saved reply draft', () => {
		expect(draftService.replySubject('转发：Invoice')).toBe('Re: Invoice');
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
