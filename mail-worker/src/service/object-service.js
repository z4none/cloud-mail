import { and, eq } from 'drizzle-orm';
import orm from '../entity/orm';
import { att } from '../entity/att';
import settingService from './setting-service';
import r2Service from './r2-service';

const objectService = {
	async getForUser(c, key, userId) {
		if (!key || key.includes('..') || key.startsWith('/')) {
			return null;
		}

		const setting = await settingService.query(c);
		const isBackground = setting.background === key;

		if (!isBackground) {
			const ownedAttachment = await orm(c)
				.select({ attId: att.attId })
				.from(att)
				.where(and(eq(att.key, key), eq(att.userId, userId)))
				.limit(1)
				.get();

			if (!ownedAttachment) {
				return null;
			}
		}

		try {
			const object = await r2Service.getObj(c, key);
			if (!object) return null;

			if (object instanceof Response) return object;

			const headers = new Headers();
			const metadata = object.httpMetadata || {};
			if (metadata.contentType) headers.set('Content-Type', metadata.contentType);
			if (metadata.contentDisposition) headers.set('Content-Disposition', metadata.contentDisposition);
			if (metadata.cacheControl) headers.set('Cache-Control', metadata.cacheControl);
			headers.set('Cache-Control', 'private, no-store');
			return new Response(object.body || object, { headers });
		} catch (error) {
			if (error?.name === 'NoSuchKey' || error?.statusCode === 404) return null;
			throw error;
		}
	},
};

export default objectService;
