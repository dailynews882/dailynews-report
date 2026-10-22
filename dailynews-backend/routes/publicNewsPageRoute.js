"use strict";

const express = require("express");
const { PAGE_SIZE } = require("../config/newsFeed");

module.exports = function publicNewsPageRoute(db) {
  const router = express.Router();
  router.get("/", (req, res) => {
    res.set("Cache-Control", "no-store");
    const pageText = req.query.page === undefined ? "1" : req.query.page;
    const snapshotText = req.query.snapshot;
    const country = typeof req.query.country === "string" ? req.query.country.trim().toLowerCase() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
    if (typeof pageText !== "string" || !/^[1-9]\d{0,6}$/.test(pageText) || Number(pageText) > 1000000 ||
        (snapshotText !== undefined && (typeof snapshotText !== "string" || !/^\d+$/.test(snapshotText) || !Number.isSafeInteger(Number(snapshotText)))) ||
        (req.query.country !== undefined && typeof req.query.country !== "string") ||
        (req.query.category !== undefined && typeof req.query.category !== "string") ||
        (country && country !== "all" && !/^[a-z]{2}$/.test(country)) ||
        (category && !/^[a-z0-9_-]{1,50}$/.test(category))) {
      return res.status(400).json({ success: false, message: "新闻分页或筛选参数无效。" });
    }
    const parameters = [snapshotText === undefined ? null : Number(snapshotText)];
    const conditions = ["n.status='published'", "n.id<=bounds.snapshot"];
    if (country && country !== "all") { conditions.push("n.country_code=?"); parameters.push(country); }
    if (category) { conditions.push("LOWER(TRIM(n.category))=?"); parameters.push(category); }
    const requested = Number(pageText);
    // One SQL statement gives count + rows the same SQLite read snapshot.
    // The max-id boundary keeps newly inserted news from shifting later pages.
    const sql = `WITH bounds AS (
        SELECT COALESCE(?,MAX(id),0) AS snapshot FROM news
      ), filtered AS (
        SELECT n.id,n.title,n.category,n.country_code,n.country_name,n.region,n.summary,
          n.image_url,n.video_url,n.source,n.author,n.status,n.is_vip,n.views,n.created_at,n.updated_at
        FROM news n CROSS JOIN bounds WHERE ${conditions.join(" AND ")}
      ), meta AS (
        SELECT COUNT(*) AS total,MAX(1,CAST((COUNT(*)+?-1)/? AS INTEGER)) AS total_pages FROM filtered
      ), selected AS (
        SELECT * FROM filtered ORDER BY created_at DESC,id DESC
        LIMIT ? OFFSET ((SELECT MIN(?,total_pages) FROM meta)-1)*?
      )
      SELECT selected.*,meta.total AS _total,meta.total_pages AS _pages,
        MIN(?,meta.total_pages) AS _page,bounds.snapshot AS _snapshot
      FROM meta CROSS JOIN bounds LEFT JOIN selected ON 1=1
      ORDER BY selected.created_at DESC,selected.id DESC`;
    parameters.push(PAGE_SIZE, PAGE_SIZE, PAGE_SIZE, requested, PAGE_SIZE, requested);
    db.all(sql, parameters, (error, rows) => {
      if (error) return res.status(503).json({ success: false, message: "新闻暂时无法加载，请稍后重试。" });
      const meta = rows[0];
      const data = rows.filter(row => row.id !== null).map(row => {
        const { _total, _pages, _page, _snapshot, ...news } = row;
        return news;
      });
      return res.json({ success: true, data, filters: { country: country === "all" ? "" : country, category },
        pagination: { page: meta._page, pageSize: PAGE_SIZE, total: meta._total, totalPages: meta._pages, snapshot: meta._snapshot } });
    });
  });
  return router;
};
