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

http
	.createServer(async (request, response) => {
		const { headers, url, method } = request;
		const location = config.locations.find(location => {
			return location.match.test(url);
		});

		if (!location) {
			response.writeHead(502).end();
			return;
		}

		console.log('location', location);

		if (location.proxyPass) {
			return new Promise(resolve => {
				const finalUrl = Url.resolve(location.proxyPass, url);

				http.request(finalUrl, { method, headers }, r => {
					r.on('data', chunk => {
						response.write(chunk);
					});

					r.on('error', error => {
						response.writeHead(503).end(error);
					});

					r.on('end', () => {
						response.end();
						resolve();
					});
				});
			});
		} else if (location.root) {
			const basePath = R.head(location.root) === '/' ? location.root : Path.join(process.cwd(), location.root);
			const filePath = Path.join(basePath, url);
			let path = null;

			if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
				path = filePath;
			} else if (location.index) {
				path = Path.join(filePath, location.index);
			}

			if (!path) {
				response.writeHead(404).end();
				return;
			}

			try {
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
		}

		response.writeHead(502);
		response.end();
	})
	.listen(config.port, err => {
		if (err) {
			return console.log('Something bad happened', err);
		}

		console.log(`Server is listening on ${config.port}`);
	});
