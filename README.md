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
  port: 80,             // you can specify another port, 80 is default
  locations: [          // locations, it is explained below
    { match: /^\/graphql/, proxyPass: 'http://localhost:4000' },
    { match: /^\//, root: './dist/client', index: 'index.html' }
  ]
};
```

Locations are basically routes, if requested url matches the first occurrence (from top), this location is applied. Note that always first match is taken, others are skipped, so if your routes share same starting path, more general routes should be under more specific routes.

Every location requires `match` parameter (regexp) and one of following parameters:
- `proxyPass` - your request is proxied (headers are forwarded) to another server
- `root` - serving files from this path (url is appended), you can also use `index` parameter to specify index file which is served when no specific file in your request is present
