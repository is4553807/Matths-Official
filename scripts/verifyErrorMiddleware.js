const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const {
  buildErrorViewModel,
  errorHandler,
  notFoundHandler,
  renderErrorPage,
} = require("../middleware/errorMiddleware");
const { isAdmin } = require("../middleware/authMiddleware");

function mockRequest({ url = "/admin", user = null } = {}) {
  return {
    originalUrl: url,
    session: user ? { user } : {},
  };
}

function mockResponse() {
  return {
    headersSent: false,
    headers: {},
    statusCode: 200,
    view: null,
    model: null,
    jsonBody: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    render(view, model) {
      this.view = view;
      this.model = model;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

const signedInUser = { id: "user-1", name: "테스트 사용자" };
const errorCss = fs.readFileSync(
  path.join(__dirname, "..", "public", "css", "error.css"),
  "utf8"
);

assert.match(errorCss, /html:has\(\.matths-error-page\)[\s\S]*overflow-x:\s*clip/);
assert.match(errorCss, /\.matths-error-main[\s\S]*overflow:\s*clip/);

{
  const req = mockRequest({ user: signedInUser });
  const res = mockResponse();
  const error = Object.assign(
    new Error("운영자만 접근할 수 있습니다."),
    {
      status: 403,
      code: "ADMIN_ACCESS_REQUIRED",
    }
  );
  renderErrorPage(req, res, { error, status: 403 });
  assert.equal(res.statusCode, 403);
  assert.equal(res.view, "error");
  assert.equal(res.model.statusCode, 403);
  assert.equal(res.model.primaryAction.href, "/main");
  assert.equal(res.model.secondaryAction.href, "/faq");
  assert.equal(res.headers["Cache-Control"], "no-store");
}

{
  const req = mockRequest({ user: signedInUser });
  let propagatedError = null;
  isAdmin(req, mockResponse(), (error) => {
    propagatedError = error;
  });
  assert.equal(propagatedError.status, 403);
  assert.equal(propagatedError.code, "ADMIN_ACCESS_REQUIRED");
}

{
  const req = mockRequest({ user: { role: "admin", name: "운영자" } });
  let nextCalled = false;
  isAdmin(req, mockResponse(), (error) => {
    assert.equal(error, undefined);
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
}

{
  const model = buildErrorViewModel({
    req: mockRequest(),
    status: 401,
    error: new Error("로그인이 필요합니다."),
  });
  assert.equal(model.primaryAction.href, "/login");
}

{
  const model = buildErrorViewModel({
    req: mockRequest({ user: signedInUser }),
    status: 501,
    error: new Error("결제 화면을 준비 중입니다."),
  });
  assert.equal(model.primaryAction.href, "/pricing");
  assert.equal(model.primaryAction.label, "이용권으로 돌아가기");
}

{
  const req = mockRequest({ url: "/missing" });
  const res = mockResponse();
  notFoundHandler(req, res, (error) => {
    errorHandler(error, req, res, () => {});
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.view, "error");
}

{
  const req = mockRequest({ url: "/api/v1/missing" });
  const res = mockResponse();
  notFoundHandler(req, res, (error) => {
    errorHandler(error, req, res, () => {});
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.view, null);
  assert.equal(
    res.jsonBody.message,
    "요청한 주소에 해당하는 페이지가 없습니다."
  );
}

{
  const req = mockRequest({ url: "/api/v1/private" });
  const res = mockResponse();
  const error = Object.assign(new Error("이 API를 이용할 권한이 없습니다."), {
    status: 403,
  });
  errorHandler(error, req, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.equal(res.view, null);
  assert.deepEqual(res.jsonBody, {
    message: "이 API를 이용할 권한이 없습니다.",
  });
}

const renderModel = buildErrorViewModel({
  req: mockRequest({ user: signedInUser }),
  status: 403,
  error: Object.assign(new Error("운영자만 접근할 수 있습니다."), {
    status: 403,
    code: "ADMIN_ACCESS_REQUIRED",
  }),
});

ejs
  .renderFile(path.join(__dirname, "..", "views", "error.ejs"), renderModel)
  .then((html) => {
    assert.match(html, /403/);
    assert.match(html, /운영자만 접근할 수 있습니다/);
    assert.match(html, /\/css\/error\.css/);
    assert.match(html, /대시보드로 돌아가기/);
    console.log("Error page middleware verification passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
