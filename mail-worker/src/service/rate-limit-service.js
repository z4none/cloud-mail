import BizError from '../error/biz-error';

const windows = {
	'/login': { limit: 10, ttl: 600 },
	'/register': { limit: 5, ttl: 600 },
	'/public/genToken': { limit: 5, ttl: 600 },
	'/public/addUser': { limit: 10, ttl: 60 },
	'/public/emailList': { limit: 60, ttl: 60 },
	'/oauth': { limit: 20, ttl: 600 },
};

const rateLimitService = {
	async check(c) {
		const path = c.req.path;
		const rule = Object.entries(windows).find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
		if (!rule) return;

		const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
		const key = `rate-limit:${path}:${ip.split(',')[0].trim()}`;
		const current = Number(await c.env.kv.get(key) || 0);
		if (current >= rule.limit) {
			throw new BizError('Too many requests', 429);
		}
		await c.env.kv.put(key, String(current + 1), { expirationTtl: rule.ttl });
	},
};

export default rateLimitService;
