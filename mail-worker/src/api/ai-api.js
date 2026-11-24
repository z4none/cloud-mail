import app from '../hono/hono';
import result from '../model/result';
import aiService from '../service/ai-service';

app.get('/ai/accounts', async (c) => {
	return c.json(result.ok(await aiService.accounts(c)));
});

app.get('/ai/emails', async (c) => {
	return c.json(result.ok(await aiService.search(c, c.req.query())));
});

app.post('/ai/emails/send', async (c) => {
	return c.json(result.ok(await aiService.send(c, await c.req.json())));
});

app.get('/ai/emails/:id', async (c) => {
	return c.json(result.ok(await aiService.detail(c, c.req.param('id'))));
});

app.post('/ai/emails/:id/reply', async (c) => {
	return c.json(result.ok(await aiService.reply(c, c.req.param('id'), await c.req.json())));
});
