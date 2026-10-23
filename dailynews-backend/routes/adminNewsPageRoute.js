"use strict";
const express = require("express");
const PAGE_SIZE = 10;

// Mounted behind verifyAdminToken; the public feed and legacy list stay unchanged.
module.exports = function adminNewsPageRoute(db) {
  const router = express.Router();
  router.get("/", (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.vary("Authorization");
    const { page = "1", search = "", status = "all", ai = "all" } = req.query;
    if (typeof page !== "string" || !/^[1-9]\d{0,6}$/.test(page) || Number(page) > 1000000 ||
        typeof search !== "string" || search.length > 200 ||
        !["all", "published", "pending", "draft", "unpublished"].includes(status) ||
        !["all", "generated", "not_generated", "generating"].includes(ai)) {
      return res.status(400).json({ success: false, message: "新闻分页或筛选参数无效。" });
    }
    const conditions = [], parameters = [];
    if (search.trim()) {
      conditions.push("LOWER(COALESCE(title,'') || ' ' || COALESCE(category,'') || ' ' || COALESCE(source,'') || ' ' || COALESCE(author,'')) LIKE ? ESCAPE '\\'");
      parameters.push("%" + search.trim().toLowerCase().replace(/[\\%_]/g, "\\$&") + "%");
    }
    if (status !== "all") { conditions.push("LOWER(COALESCE(status,'draft'))=?"); parameters.push(status); }
    if (ai === "generated") conditions.push("LENGTH(TRIM(COALESCE(summary,'')))>0");
    if (ai === "not_generated") conditions.push("LENGTH(TRIM(COALESCE(summary,'')))=0");
    // The current schema has no persisted 'generating' state.
    if (ai === "generating") conditions.push("0=1");
    const requested = Number(page);
    const sql = `WITH filtered AS (
      SELECT id,title,category,country_code,country_name,region,summary,image_url,video_url,
        source,author,status,is_vip,views,created_at,updated_at FROM news
      ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
    ), meta AS (
      SELECT COUNT(*) AS total,MAX(1,CAST((COUNT(*)+?-1)/? AS INTEGER)) AS pages FROM filtered
    ), stats AS (
      SELECT COUNT(*) AS total,
        COALESCE(SUM(date(created_at,'localtime')=date('now','localtime')),0) AS today,
        COALESCE(SUM(LOWER(COALESCE(author,'')) LIKE '%gnews%'),0) AS api,
        COALESCE(SUM(LOWER(status)='pending'),0) AS pending FROM news
    ), selected AS (
      SELECT * FROM filtered ORDER BY created_at DESC,id DESC
      LIMIT ? OFFSET ((SELECT MIN(?,pages) FROM meta)-1)*?
    ) SELECT selected.*,meta.total AS _total,meta.pages AS _pages,MIN(?,meta.pages) AS _page,
      stats.total AS _stats_total,stats.today AS _today,stats.api AS _api,stats.pending AS _pending
      FROM meta CROSS JOIN stats LEFT JOIN selected ON 1=1
      ORDER BY selected.created_at DESC,selected.id DESC`;
    parameters.push(PAGE_SIZE, PAGE_SIZE, PAGE_SIZE, requested, PAGE_SIZE, requested);
    db.all(sql, parameters, (error, rows) => {
      if (error) return res.status(503).json({ success: false, message: "新闻暂时无法加载，请稍后重试。" });
      const meta = rows[0];
      const data = rows.filter(row => row.id !== null).map(row => {
        const { _total, _pages, _page, _stats_total, _today, _api, _pending, ...news } = row;
        return news;
      });
      res.json({ success: true, data,
        pagination: { page: meta._page, pageSize: PAGE_SIZE, total: meta._total, totalPages: meta._pages },
        statistics: { total: meta._stats_total, today: meta._today, api: meta._api, pending: meta._pending } });
    });
  });
  return router;
};
