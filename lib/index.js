const yargs = require("yargs");
const http = require("http");
const R = require("ramda");
const Path = require("path");
const fs = require("fs");
const Url = require("url");

const BASE_CONFIG_FILE = "talisker.config.js";

const MIME_TYPES = [
  { ext: ["htm", "html"], mimeType: "text/html" },
  { ext: ["jpg", "jpe", "jpeg"], mimeType: "image/jpeg" },
  { ext: ["png", ""], mimeType: "image/png" },
  { ext: ["css"], mimeType: "text/css" },
  { ext: ["js"], mimeType: "text/javascript" },
  { ext: ["gif"], mimeType: "image/gif" },
  { ext: ["svg"], mimeType: "image/svg+xml" },
  { ext: ["woff"], mimeType: "font/woff" },
  { ext: ["ttf"], mimeType: "font/ttf" },
  { ext: ["otf"], mimeType: "font/otf" },
  { ext: ["webp"], mimeType: "image/webp" }
];

yargs.help();

class HttpError extends Error {}
class BadRequestHttpError extends HttpError {}
class NotFoundHttpError extends HttpError {}
class InternalServerHttpError extends HttpError {}

const argv = yargs
  .option("port", {
    alias: "p",
    describe: "Talisker will listen on this port",
    type: "number"
  })
  .option("config", {
    alias: "c",
    describe: "Path to config file",
    type: "string"
  }).argv;

const config = (function getConfig() {
  const c = {
    port: 80,
    locations: []
  };

  try {
    const configPath = Path.join(
      process.cwd(),
      argv.config || BASE_CONFIG_FILE
    );
    Object.assign(c, R.merge(c, require(configPath)));
  } catch (error) {
    console.warn("Config error", error);
    console.log("Using default");
  }

  if (argv.port) {
    c.port = argv.port;
  }

  return c;
})();

function deserializeBody(request) {
  return new Promise((resolve, reject) => {
    const body = [];

    request
      .on("error", err => reject(err))
      .on("data", chunk => body.push(chunk))
      .on("end", () => resolve(Buffer.concat(body).toString()));
  });
}

function resolveLocation(request) {
  const { headers, url, method } = request;
  const location = config.locations.find(location => {
    if (!Array.isArray(location)) {
      throw new Error("Location is supposed to be an array");
    }

    if (location.length !== 2) {
      throw new Error(
        "Location requires to have 2 parameters (regex & object)"
      );
    }

    const match = R.head(location);

    if (!(match instanceof RegExp)) {
      throw new Error("First argument of location should be regex.");
    }

    return match.test(url);
  });

  if (!location) {
    throw new Error(`Undefined location for "${url}"`);
  }

  const matcher = R.last(location);

  return typeof matcher === "function" ? matcher({ url }) : matcher;
}

function proxyPass(request, body, destination) {
  return new Promise(resolve => {
    const finalUrl = Url.resolve(destination, request.url);

    console.log("proxy passing", finalUrl);

    const { method, headers } = request;
    const { protocol, hostname, port, path, query } = Url.parse(finalUrl);

    const req = http.request(
      { protocol, hostname, port, path, query, method, headers },
      r => {
        const response = [];

        r.on("data", chunk => response.push(chunk));
        r.on("end", () =>
          resolve({
            headers: r.headers,
            body: Buffer.concat(response).toString()
          })
        );
        r.on("error", error => reject(`Proxy pass error ${error.stack}`));
      }
    );

    req.write(body);
    req.end();
  });
}

function serveStaticFile(request, { root, tryFiles, useAbsolutePath }) {
  const basePath = useAbsolutePath ? root : Path.join(process.cwd(), root);
  const exactPath = Path.join(basePath, request.url);
  let path = null;

  if (fs.existsSync(exactPath) && fs.lstatSync(exactPath).isFile()) {
    path = exactPath;
  } else if (tryFiles) {
    if (!Array.isArray(tryFiles)) {
      throw new Error("tryFiles should be array");
    }

    for (const file of tryFiles) {
      const p = Path.join(basePath, file);

      if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
        path = p;
        break;
      }
    }

    if (!path) {
      path = Path.join(basePath, R.last(tryFiles));
    }
  }

  if (!path) {
    throw new NotFoundHttpError();
  }

  console.log("reading", path);
  const content = fs.readFileSync(path);

  const ext = path.split(".").pop();
  const mimeType = MIME_TYPES.find(mt => mt.ext.includes(ext));

  if (!mimeType) {
    throw new BadRequestHttpError(`Unknown extension "${ext}"`);
  }

  return {
    headers: {
      "Content-Type": mimeType
    },
    body: content
  };
}

http
  .createServer(async (request, response) => {
    try {
      const location = resolveLocation(request);
      let result = null;

      if (location.proxyPass) {
        const body = await deserializeBody(request);

        result = await proxyPass(request, body, location.proxyPass);
      } else if (location.root) {
        const { root, tryFiles, useAbsolutePath } = location;

        result = await serveStaticFile(request, {
          root,
          tryFiles,
          useAbsolutePath
        });
      } else {
        throw new Error("Unknown routing location");
      }

      if (!result) {
        throw new Error("No result");
      }

      R.forEachObjIndexed(
        (value, key) => response.setHeader(key, value),
        result.headers
      );

      response.statusCode = 200;
      response.end(result.body);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error instanceof BadRequestHttpError) {
          response.statusCode = 400;
        } else if (error instanceof NotFoundHttpError) {
          response.statusCode = 404;
        } else if (error instanceof InternalServerHttpError) {
          response.statusCode = 500;
        }

        response.end(error.toString());
      } else {
        response.statusCode = 500;
        response.end(error.stack);
      }
    }
  })
  .listen(config.port, err => {
    if (err) {
      return console.log("Something bad happened", err);
    }

    console.log(`Server is listening on ${config.port}`);
  });
