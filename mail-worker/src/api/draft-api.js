import app from '../hono/hono';
import result from '../model/result';
import draftService from '../service/draft-service';
import userContext from '../security/user-context';

app.get('/draft/list', async (c) => {
	return c.json(result.ok(await draftService.list(c, userContext.getUserId(c))));
});

app.put('/draft/:id', async (c) => {
	const data = await draftService.update(c, c.req.param('id'), await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/draft/:id', async (c) => {
	await draftService.remove(c, c.req.param('id'), userContext.getUserId(c));
	return c.json(result.ok());
});
