import app from '../hono/hono';
import objectService from '../service/object-service';
import userContext from '../security/user-context';

async function serveObject(c) {
	const pathKey = c.req.path.split('/object/')[1] || '';
	const key = c.req.query('key') || (pathKey ? decodeURIComponent(pathKey) : '');
	const object = await objectService.getForUser(c, key, userContext.getUserId(c));

	if (!object) {
		return c.notFound();
	}

	object.headers.set('Cache-Control', 'private, no-store');
	return object;
}

app.get('/object', serveObject);
app.get('/object/*', serveObject);
