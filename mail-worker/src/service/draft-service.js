import orm from '../entity/orm';
import mailDraft from '../entity/draft';
import account from '../entity/account';
import email from '../entity/email';
import { and, desc, eq } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import accountService from './account-service';

function now() {
	return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

const draftService = {
	recipients(value) {
		const list = Array.isArray(value) ? value : (value ? [value] : []);
		const recipients = list.map(item => String(item || '').trim()).filter(Boolean);
		if (recipients.some(item => !verifyUtils.isEmail(item))) {
			throw new BizError('Recipient email is invalid', 400);
		}
		return recipients;
	},

	async mailbox(c, accountId, userId) {
		const row = await accountService.selectById(c, Number(accountId));
		if (!row || row.userId !== Number(userId) || row.isDel === isDel.DELETE) {
			throw new BizError('This mailbox is not allowed', 403);
		}
		return row;
	},

	async create(c, params, userId) {
		const mailbox = await this.mailbox(c, params.accountId, userId);
		let recipients = this.recipients(params.to);
		let subject = String(params.subject || '').trim();
		const text = String(params.text || '');
		const content = String(params.html || (text ? `<pre>${this.escapeHtml(text)}</pre>` : ''));
		let sendType = ['reply', 'forward', 'send'].includes(params.sendType) ? params.sendType : '';
		let replyEmailId = Number(params.replyEmailId) || 0;

		if (replyEmailId) {
			const source = await orm(c).select().from(email).where(and(
				eq(email.emailId, replyEmailId),
				eq(email.accountId, mailbox.accountId),
				eq(email.isDel, isDel.NORMAL)
			)).get();
			if (!source) throw new BizError('Email not found', 404);
			sendType = 'reply';
			if (!recipients.length && source.sendEmail) recipients = this.recipients([source.sendEmail]);
			if (!subject) subject = this.replySubject(source.subject);
		}

		if (!subject && !text && !content && !recipients.length) {
			throw new BizError('Draft content is required', 400);
		}

		const timestamp = now();
		const row = await orm(c).insert(mailDraft).values({
			userId: mailbox.userId,
			accountId: mailbox.accountId,
			receiveEmail: JSON.stringify(recipients),
			subject,
			content,
			text,
			sendType,
			replyEmailId,
			createTime: timestamp,
			updateTime: timestamp,
		}).returning().get();
		return this.present(row, mailbox);
	},

	async list(c, userId) {
		const rows = await orm(c).select({
			draftId: mailDraft.draftId,
			accountId: mailDraft.accountId,
			receiveEmail: mailDraft.receiveEmail,
			subject: mailDraft.subject,
			content: mailDraft.content,
			text: mailDraft.text,
			sendType: mailDraft.sendType,
			replyEmailId: mailDraft.replyEmailId,
			createTime: mailDraft.createTime,
			email: account.email,
			name: account.name,
		}).from(mailDraft).innerJoin(account, eq(account.accountId, mailDraft.accountId)).where(and(
			eq(mailDraft.userId, userId),
			eq(account.isDel, isDel.NORMAL)
		)).orderBy(desc(mailDraft.draftId)).all();
		return rows.map(row => this.present(row, { email: row.email, name: row.name, accountId: row.accountId }));
	},

	async update(c, draftId, params, userId) {
		const existing = await this.owned(c, draftId, userId);
		const mailbox = params.accountId ? await this.mailbox(c, params.accountId, userId) : existing;
		const recipients = params.to !== undefined || params.receiveEmail !== undefined
			? this.recipients(params.to ?? params.receiveEmail)
			: JSON.parse(existing.receiveEmail || '[]');
		const subject = params.subject !== undefined ? String(params.subject || '') : existing.subject;
		const content = params.html !== undefined || params.content !== undefined
			? String(params.html ?? params.content ?? '')
			: existing.content;
		const text = params.text !== undefined ? String(params.text || '') : existing.text;
		await orm(c).update(mailDraft).set({
			accountId: mailbox.accountId,
			receiveEmail: JSON.stringify(recipients),
			subject,
			content,
			text,
			sendType: params.sendType !== undefined ? String(params.sendType || '') : existing.sendType,
			replyEmailId: params.emailId !== undefined ? Number(params.emailId) || 0 : existing.replyEmailId,
			updateTime: now(),
		}).where(eq(mailDraft.draftId, existing.draftId)).run();
		return { draftId: existing.draftId };
	},

	async remove(c, draftId, userId) {
		const existing = await this.owned(c, draftId, userId);
		await orm(c).delete(mailDraft).where(eq(mailDraft.draftId, existing.draftId)).run();
	},

	async owned(c, draftId, userId) {
		const row = await orm(c).select().from(mailDraft).where(and(
			eq(mailDraft.draftId, Number(draftId)),
			eq(mailDraft.userId, Number(userId))
		)).get();
		if (!row) throw new BizError('Draft not found', 404);
		return row;
	},

	present(row, mailbox) {
		return {
			draftId: row.draftId,
			serverDraftId: row.draftId,
			accountId: mailbox.accountId,
			sendEmail: mailbox.email,
			name: mailbox.name || '',
			receiveEmail: typeof row.receiveEmail === 'string' ? JSON.parse(row.receiveEmail || '[]') : row.receiveEmail,
			subject: row.subject || '',
			content: row.content || '',
			text: row.text || '',
			sendType: row.sendType || '',
			emailId: row.replyEmailId || 0,
			createTime: row.createTime,
		};
	},

	replySubject(subject) {
		const base = String(subject || '').replace(/^(\s*(re|fw|fwd|回复|转发)\s*[:：]\s*)+/i, '').trim();
		return base ? `Re: ${base}` : 'Re:';
	},

	escapeHtml(value) {
		return value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
	},
};

export default draftService;
