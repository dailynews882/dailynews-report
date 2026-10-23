"use strict";

const identity = require("./adminIdentity");

// Match the existing admin token contract without treating a member token,
// a query parameter, or a client-supplied role as administrative authority.
function hasNewsAdminAccess(req) {
  return identity.permits(req.newsAdmin, "news.manage");
}
function attachNewsAdmin(req, res, next) {
  identity.resolveAdmin(req, (_error, admin) => { req.newsAdmin = admin || null; next(); });
}

module.exports = { hasNewsAdminAccess, attachNewsAdmin };
