const http = require("node:http");
const {
  Duplex,
} = require("node:stream");

class MemorySocket extends Duplex {
  constructor() {
    super();
    this.buffers = [];
    this.remoteAddress =
      "127.0.0.1";
    this.remotePort = 43120;
  }

  _read() {}

  _write(
    chunk,
    _encoding,
    callback
  ) {
    this.buffers.push(
      Buffer.from(chunk)
    );
    callback();
  }

  setTimeout() {
    return this;
  }

  setNoDelay() {
    return this;
  }

  setKeepAlive() {
    return this;
  }
}

function normalizedHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(
      ([key, value]) => [
        key.toLowerCase(),
        String(value),
      ]
    )
  );
}

async function requestInProcess(
  app,
  {
    method = "GET",
    path = "/",
    headers = {},
    body = "",
  } = {}
) {
  const payload = Buffer.from(
    String(body || "")
  );
  const socket =
    new MemorySocket();
  const req =
    new http.IncomingMessage(
      socket
    );
  req.method = method;
  req.url = path;
  req.headers = normalizedHeaders({
    host: "127.0.0.1",
    connection: "close",
    ...(payload.length
      ? {
          "content-length":
            payload.length,
        }
      : {}),
    ...headers,
  });
  req.rawHeaders = Object.entries(
    req.headers
  ).flatMap(([key, value]) => [
    key,
    value,
  ]);
  req.socket = socket;
  req.connection = socket;

  const res =
    new http.ServerResponse(req);
  res.assignSocket(socket);

  const completed = new Promise(
    (resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              `${method} ${path} 메모리 HTTP 응답이 완료되지 않았습니다.`
            )
          ),
        5_000
      );
      const settle = (callback) =>
        (value) => {
          clearTimeout(timeout);
          callback(value);
        };
      res.once(
        "finish",
        settle(resolve)
      );
      res.once(
        "error",
        settle(reject)
      );
      socket.once(
        "error",
        settle(reject)
      );
    }
  );

  if (payload.length) {
    req.push(payload);
  }
  req.push(null);
  req.complete = true;
  app(req, res);
  await completed;

  return {
    body: Buffer.concat(
      socket.buffers
    ).toString("utf8"),
    headers: Object.fromEntries(
      Object.entries(
        res.getHeaders()
      ).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value)
          ? value.join(", ")
          : String(value),
      ])
    ),
    status: res.statusCode,
  };
}

module.exports = {
  requestInProcess,
};
