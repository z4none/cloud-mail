import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { and, desc, eq, inArray, like, lt, or, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { isDel, emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import settingService from './setting-service';
import emailService from './email-service';
import attService from './att-service';
import verifyUtils from '../utils/verify-utils';
import draftService from './draft-service';

const SUMMARY_LENGTH = 280;

const aiService = {
	async authenticate(c) {
		const header = c.req.header('Authorization') || '';
		const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
		const { aiTokenHash } = await settingService.query(c);
		const hash = token ? await settingService.hashAiToken(token) : '';
		if (!token || !aiTokenHash || !this.tokenMatches(hash, aiTokenHash)) {
			throw new BizError('Invalid API token', 401);
		}
		c.set('ai', true);
	},

	tokenMatches(actual, expected) {
		if (!actual || !expected || actual.length !== expected.length) return false;
		let difference = 0;
		for (let index = 0; index < actual.length; index += 1) {
			difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
		}
		return difference === 0;
	},

	async allowedAccounts(c) {
		const { aiAccountIds } = await settingService.query(c);
		const ids = settingService.parseAiAccountIds(aiAccountIds);
		if (!ids.length) return [];
		const rows = await orm(c).select({
			accountId: account.accountId,
			email: account.email,
			name: account.name,
			userId: account.userId,
		}).from(account).where(and(
			inArray(account.accountId, ids),
			eq(account.isDel, isDel.NORMAL)
		)).all();
		if (rows.length !== ids.length) {
			await settingService.set(c, { aiAccountIds: rows.map(row => row.accountId) });
		}
		return rows;
	},

	async accounts(c) {
		const rows = await this.allowedAccounts(c);
		return rows.map(({ accountId, email: address, name }) => ({ accountId, email: address, name }));
	},

	async adminAccounts(c) {
		const [rows, selected] = await Promise.all([
			orm(c).select({
				accountId: account.accountId,
				email: account.email,
				name: account.name,
			}).from(account).where(eq(account.isDel, isDel.NORMAL)).all(),
			this.accounts(c),
		]);
		const { aiTokenHash } = await settingService.query(c);
		return {
			enabled: !!aiTokenHash,
			accountIds: selected.map(item => item.accountId),
			accounts: rows,
		};
	},

	requireAccount(accounts, accountId) {
		const row = accounts.find(item => item.accountId === Number(accountId));
		if (!row) throw new BizError('This mailbox is not allowed', 403);
		return row;
	},

	async search(c, params) {
		const accounts = await this.allowedAccounts(c);
		const accountIds = accounts.map(item => item.accountId);
		if (params.accountId && !accountIds.includes(Number(params.accountId))) {
			throw new BizError('This mailbox is not allowed', 403);
		}
		if (!accountIds.length) return { emails: [], nextCursor: null };

		const conditions = [
			inArray(email.accountId, params.accountId ? [Number(params.accountId)] : accountIds),
			eq(email.isDel, isDel.NORMAL),
		];
		const keyword = String(params.keyword || '').trim().slice(0, 100);
		if (keyword) {
			const pattern = `%${keyword.replace(/[%_]/g, '')}%`;
			conditions.push(or(like(email.subject, pattern), like(email.name, pattern), like(email.sendEmail, pattern)));
		}
		if (params.unread === '1' || params.unread === 'true') {
			conditions.push(eq(email.unread, emailConst.unread.UNREAD));
		}
		const since = this.normalizeSince(params.since);
		if (since) conditions.push(gte(email.createTime, since));
		const cursor = Number(params.cursor);
		if (cursor) conditions.push(lt(email.emailId, cursor));

		const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
		const rows = await orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			threadId: email.threadId,
			sendEmail: email.sendEmail,
			name: email.name,
			subject: email.subject,
			recipient: email.recipient,
			createTime: email.createTime,
			unread: email.unread,
			type: email.type,
			text: sql`substr(coalesce(${email.text}, ''), 1, ${SUMMARY_LENGTH})`.as('text'),
		}).from(email).where(and(...conditions)).orderBy(desc(email.emailId)).limit(limit).all();

		return {
			emails: rows,
			nextCursor: rows.length === limit ? rows.at(-1).emailId : null,
		};
	},

	async detail(c, emailId) {
		const accounts = await this.allowedAccounts(c);
		const row = await this.readableEmail(c, emailId, accounts);
		const threadId = await emailService.ensureThreadId(c, row);
		const thread = await orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			threadId: email.threadId,
			sendEmail: email.sendEmail,
			name: email.name,
			subject: email.subject,
			recipient: email.recipient,
			createTime: email.createTime,
			unread: email.unread,
			type: email.type,
			text: email.text,
		}).from(email).where(and(
			eq(email.userId, row.userId),
			eq(email.accountId, row.accountId),
			eq(email.threadId, threadId),
			eq(email.isDel, isDel.NORMAL)
		)).all();
		const attachments = await attService.selectByEmailIds(c, [row.emailId]);
		return {
			email: this.presentEmail(row, attachments),
			thread: thread.map(item => this.presentEmail(item)),
		};
	},

	async readableEmail(c, emailId, accounts) {
		const row = await orm(c).select().from(email).where(and(
			eq(email.emailId, Number(emailId)),
			eq(email.isDel, isDel.NORMAL)
		)).get();
		if (!row) throw new BizError('Email not found', 404);
		if (!accounts.some(item => item.accountId === row.accountId)) {
			throw new BizError('This mailbox is not allowed', 403);
		}
		return row;
	},

	presentEmail(row, attachments = []) {
		return {
			emailId: row.emailId,
			accountId: row.accountId,
			threadId: row.threadId,
			from: { name: row.name || '', email: row.sendEmail || '' },
			to: row.recipient || '[]',
			subject: row.subject || '',
			text: row.text || '',
			html: row.content || '',
			unread: row.unread,
			type: row.type,
			createTime: row.createTime,
			attachments: attachments.map(item => ({
				filename: item.filename,
				mimeType: item.mimeType,
				size: item.size,
			})),
		};
	},

	async createDraft(c, params) {
		const accounts = await this.allowedAccounts(c);
		const mailbox = this.requireAccount(accounts, params.accountId);
		return draftService.create(c, params, mailbox.userId);
	},

	async reply(c, emailId, params) {
		const accounts = await this.allowedAccounts(c);
		const row = await this.readableEmail(c, emailId, accounts);
		const mailbox = this.requireAccount(accounts, row.accountId);
		const text = String(params.text || '');
		const html = String(params.html || (text ? `<pre>${this.escapeHtml(text)}</pre>` : ''));
		if (!text && !html) throw new BizError('Message body is required', 400);
		const sent = await emailService.send(c, {
			accountId: mailbox.accountId,
			name: mailbox.name,
			sendType: 'reply',
			emailId: row.emailId,
			receiveEmail: [row.sendEmail],
			text,
			content: html,
			subject: params.subject || this.replySubject(row.subject),
			attachments: [],
		}, mailbox.userId);
		return this.sentResult(sent);
	},

	async send(c, params) {
		const accounts = await this.allowedAccounts(c);
		const mailbox = this.requireAccount(accounts, params.accountId);
		const receiveEmail = Array.isArray(params.to) ? params.to : [params.to];
		if (receiveEmail.some(item => !verifyUtils.isEmail(String(item || '').trim()))) {
			throw new BizError('Recipient email is invalid', 400);
		}
		const text = String(params.text || '');
		const html = String(params.html || (text ? `<pre>${this.escapeHtml(text)}</pre>` : ''));
		if (!String(params.subject || '').trim()) throw new BizError('Subject is required', 400);
		if (!text && !html) throw new BizError('Message body is required', 400);
		const sent = await emailService.send(c, {
			accountId: mailbox.accountId,
			name: mailbox.name,
			sendType: 'send',
			receiveEmail: receiveEmail.map(item => String(item).trim()),
			text,
			content: html,
			subject: String(params.subject).trim(),
			attachments: [],
		}, mailbox.userId);
		return this.sentResult(sent);
	},

	sentResult(rows) {
		const row = rows?.[0] || {};
		return { emailId: row.emailId, threadId: row.threadId, messageId: row.messageId };
	},

	normalizeSince(value) {
		const raw = String(value || '').trim();
		if (!raw) return '';
		const parsed = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
		if (Number.isNaN(parsed.getTime())) return raw.slice(0, 19).replace('T', ' ');
		return parsed.toISOString().slice(0, 19).replace('T', ' ');
	},

	replySubject(subject) {
		const base = String(subject || '').replace(/^(\s*(re|fw|fwd|回复|转发)\s*[:：]\s*)+/i, '').trim();
		return base ? `Re: ${base}` : 'Re:';
	},

	escapeHtml(value) {
		return value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
	},
};

export default aiService;
