"use strict";

const jwt = require("jsonwebtoken");

// Match the existing admin token contract without treating a member token,
// a query parameter, or a client-supplied role as administrative authority.
function hasNewsAdminAccess(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
  if (!match || !process.env.ADMIN_JWT_SECRET) return false;
  try {
    const admin = jwt.verify(match[1], process.env.ADMIN_JWT_SECRET, { algorithms: ["HS256"] });
    return admin.role === "admin" && admin.type === "admin_access";
  } catch (_) { return false; }
}

module.exports = { hasNewsAdminAccess };
