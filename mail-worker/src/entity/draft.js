import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const mailDraft = sqliteTable('mail_draft', {
	draftId: integer('draft_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	accountId: integer('account_id').notNull(),
	receiveEmail: text('receive_email').default('[]').notNull(),
	subject: text('subject').default('').notNull(),
	content: text('content').default('').notNull(),
	text: text('text').default('').notNull(),
	sendType: text('send_type').default('').notNull(),
	replyEmailId: integer('reply_email_id').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default mailDraft;
