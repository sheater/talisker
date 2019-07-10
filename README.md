# Talisker

This npm module is simple confugurable http reverse proxy. It is useful when your api and client written in JS are simple and both runs in same Docker container, and you don't want to install nginx because you want to be dependent only on JS.

## Features
- Proxying request to your API
- Serve static files in webserver way

## Usage
### Installing package
```sh
npm i --save talisker     # using npm
yarn add talisker         # using yarn
```

### Running 
Just put `talisker.config.js` to root within your project and run `talisker`. Talisker will automatically load that configuration. In case you don't want this configuration to be placed here or it's name should be another, run talisker with `--config` or `-c` option with path to your config file:
```sh
npx run talisker --config path_to_your_config
```
path is always relative to your current working directory.

If you want to use another port (80 is default) or port which is specified in your configuration file, use `--port` option followed by the number of port you want to use.

## Configuration
Configuration file should look like this:
```js
module.exports = {
	port: 8000,           // you can specify another port, 80 is default
	locations: [          // locations, it is explained below
		[/^\/graphql/, { proxyPass: 'http://localhost:4000' }],
		[/^\/assets/, { root: '/dist/client' }],
		[/^\/bundle.js/, { root: '/dist/client' }],
		[/^\//, ({ url }) => ({ root: '/dist/client', tryFiles: [url, 'index.html'] })],
	]
};
```

Locations are basically routes, if requested url matches the first occurrence (from top), this location is applied. Note that always first match is taken, others are skipped, so if your routes share same starting path, more general routes should be under more specific routes.

Every location requires two parameters (regexp) and options object with parameters based on what you want:
## Proxing
If you need to reverse proxy your request, just add `proxyPass` parameter with destination you want to be proxied (headers are forwarded)

## Serving static files
For serving static files, you have to provide `root` parameter with path to your static files. That path is always relative to current working directory unless you specify `useAbsolutePath: true`, then it is absolute path within your system.
Requested url is always appended. So if you have folders `assets` (like an example above) in your `dist/client`, and requested url looks like `/assets/image.png`, `dist/client/assets/image.png` is served.

You can also specify function instead of options object. It can be handy when your configuration is somehow dependent on url.
