const yargs = require('yargs');
const http = require('http');
const R = require('ramda');
const Path = require('path');
const fs = require('fs');
const Url = require('url');

const BASE_CONFIG_FILE = 'talisker.config.js';

const MIME_TYPES = [
	{ ext: ['htm', 'html'], mimeType: 'text/html' },
	{ ext: ['jpg', 'jpe', 'jpeg'], mimeType: 'image/jpeg' },
	{ ext: ['png', ''], mimeType: 'image/png' },
	{ ext: ['css'], mimeType: 'text/css' },
	{ ext: ['js'], mimeType: 'text/javascript' },
	{ ext: ['gif'], mimeType: 'image/gif' },
	{ ext: ['svg'], mimeType: 'image/svg+xml' },
	{ ext: ['woff'], mimeType: 'font/woff' },
	{ ext: ['ttf'], mimeType: 'font/ttf' },
	{ ext: ['otf'], mimeType: 'font/otf' },
	{ ext: ['webp'], mimeType: 'image/webp' }
];

yargs.help();

const argv = yargs
	.option('port', { alias: 'p', describe: 'Talisker will listen on this port', type: 'number' })
	.option('config', { alias: 'c', describe: 'Path to config file', type: 'string' }).argv;

const config = (function getConfig() {
	const c = {
		port: 80,
		locations: []
	};

	try {
		const configPath = Path.join(process.cwd(), argv.config || BASE_CONFIG_FILE);
		Object.assign(c, R.merge(c, require(configPath)));
	} catch (error) {
		console.warn('Config error', error);
		console.log('Using default');
	}

	if (argv.port) {
		c.port = argv.port;
	}

	return c;
})();

async function processProxyPassResponse(request, response, location) {}

async function processFileServingResponse(request, response, location) {}

http
	.createServer(async (request, response) => {
		const { headers, url, method } = request;
		const location = config.locations.find(location => {
			if (!Array.isArray(location)) {
				throw new Error('Location is supposed to be an array');
			}

			if (location.length < 2) {
				throw new Error('Location requires to have at least 2 parameters');
			}

			const match = R.head(location);

			if (!(match instanceof RegExp)) {
				throw new Error('First argument of location should be regex.');
			}

			return match.test(url);
		});

		if (!location) {
			response.writeHead(502).end();
			return;
		}

		const body = await new Promise((resolve, reject) => {
			const body = [];

			request
				.on('error', err => {
					console.error(err);
					reject(err);
				})
				.on('data', chunk => {
					body.push(chunk);
				})
				.on('end', () => {
					resolve(Buffer.concat(body).toString());
				});
		});

		const [, matcher] = location;
		const routeOptions = typeof matcher === 'function' ? matcher({ url }) : matcher;

		if (routeOptions.proxyPass) {
			return new Promise(resolve => {
				const finalUrl = Url.resolve(routeOptions.proxyPass, url);

				console.log('proxy passing', finalUrl);

				const req = http.request(finalUrl, { method, headers }, r => {
					r.on('data', chunk => {
						response.write(chunk);
					});

					r.on('error', error => {
						console.error('Proxy pass error', error);
						response.writeHead(503).end(error);
					});

					r.on('end', () => {
						response.end();
						resolve();
					});
				});

				req.write(body);
				req.end();
			});
		} else if (routeOptions.root) {
			const basePath =
				R.head(routeOptions.root) === '/' ? routeOptions.root : Path.join(process.cwd(), routeOptions.root);
			const filePath = Path.join(basePath, url);
			let path = null;

			try {
				if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
					path = filePath;
				} else if (routeOptions.tryFiles) {
					if (!Array.isArray(routeOptions.tryFiles)) {
						throw new Error('tryFiles should be array');
					}

					for (const file of routeOptions.tryFiles) {
						const p = Path.join(basePath, file);

						if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
							path = p;
							break;
						}
					}

					if (!path) {
						path = Path.join(basePath, R.last(routeOptions.tryFiles));
					}
				}

				if (!path) {
					response.writeHead(404);
					response.end();
					return;
				}

				console.log('reading', path);
				const content = fs.readFileSync(path);

				const ext = path.split('.').pop();
				const mimeType = MIME_TYPES.find(mt => mt.ext.includes(ext));

				if (!mimeType) {
					response.writeHead(502).end(`Unknown extension "${ext}"`);
					return;
				}

				response.writeHead(200, { 'Content-Type': mimeType });
				response.end(content);

				return;
			} catch (error) {
				console.error('Reading file', error);

				response.writeHead(403);
				response.end();

				return;
			}
		} else {
			throw new Error('Unknown routing location');
		}
	})
	.listen(config.port, err => {
		if (err) {
			return console.log('Something bad happened', err);
		}

		console.log(`Server is listening on ${config.port}`);
	});
