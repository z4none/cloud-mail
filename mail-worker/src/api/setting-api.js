import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import userContext from "../security/user-context";
import aiService from '../service/ai-service';

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.post('/setting/aiToken', async (c) => {
	return c.json(result.ok(await settingService.generateAiToken(c)));
});

app.delete('/setting/aiToken', async (c) => {
	await settingService.revokeAiToken(c);
	return c.json(result.ok());
});

app.get('/setting/aiAccounts', async (c) => {
	return c.json(result.ok(await aiService.adminAccounts(c)));
});

app.put('/setting/aiAccounts', async (c) => {
	const { accountIds } = await c.req.json();
	await settingService.set(c, { aiAccountIds: accountIds });
	return c.json(result.ok(await aiService.adminAccounts(c)));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await c.req.json());
	return c.json(result.ok(setting));
})

