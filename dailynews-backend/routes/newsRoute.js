const express = require("express");
const router = express.Router();
const db = require("../db");

// 获取新闻列表
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      id,
      title,
      category,
      summary,
      image_url,
      video_url,
      source,
      author,
      status,
      is_vip,
      views,
      created_at,
      updated_at
    FROM news
    ORDER BY created_at DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Get news list error:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to get news list",
      });
    }

    res.json({
      success: true,
      data: rows,
    });
  });
});

// 获取单条新闻详情
router.get("/:id", (req, res) => {
  const { id } = req.params;

  const updateViewsSql = `
    UPDATE news 
    SET views = views + 1 
    WHERE id = ?
  `;

  db.run(updateViewsSql, [id], (updateErr) => {
    if (updateErr) {
      console.error("Update news views error:", updateErr.message);
    }

    const sql = `
      SELECT *
      FROM news
      WHERE id = ?
    `;

    db.get(sql, [id], (err, row) => {
      if (err) {
        console.error("Get news detail error:", err.message);
        return res.status(500).json({
          success: false,
          message: "Failed to get news detail",
        });
      }

      if (!row) {
        return res.status(404).json({
          success: false,
          message: "News not found",
        });
      }

      res.json({
        success: true,
        data: row,
      });
    });
  });
});

// 新增新闻
router.post("/", (req, res) => {
  const {
    title,
    category,
    summary,
    content,
    image_url,
    video_url,
    source,
    author,
    status,
    is_vip,
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({
      success: false,
      message: "Title and content are required",
    });
  }

  const sql = `
    INSERT INTO news (
      title,
      category,
      summary,
      content,
      image_url,
      video_url,
      source,
      author,
      status,
      is_vip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    title,
    category || "general",
    summary || "",
    content,
    image_url || "",
    video_url || "",
    source || "",
    author || "DailyNews Admin",
    status || "published",
    is_vip ? 1 : 0,
  ];

  db.run(sql, values, function (err) {
    if (err) {
      console.error("Create news error:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to create news",
      });
    }

    res.json({
      success: true,
      message: "News created successfully",
      data: {
        id: this.lastID,
      },
    });
  });
});

// 修改新闻
router.put("/:id", (req, res) => {
  const { id } = req.params;

  const {
    title,
    category,
    summary,
    content,
    image_url,
    video_url,
    source,
    author,
    status,
    is_vip,
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({
      success: false,
      message: "Title and content are required",
    });
  }

  const sql = `
    UPDATE news
    SET
      title = ?,
      category = ?,
      summary = ?,
      content = ?,
      image_url = ?,
      video_url = ?,
      source = ?,
      author = ?,
      status = ?,
      is_vip = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const values = [
    title,
    category || "general",
    summary || "",
    content,
    image_url || "",
    video_url || "",
    source || "",
    author || "DailyNews Admin",
    status || "published",
    is_vip ? 1 : 0,
    id,
  ];

  db.run(sql, values, function (err) {
    if (err) {
      console.error("Update news error:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to update news",
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "News not found",
      });
    }

    res.json({
      success: true,
      message: "News updated successfully",
    });
  });
});

// 删除新闻
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    DELETE FROM news
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      console.error("Delete news error:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to delete news",
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "News not found",
      });
    }

    res.json({
      success: true,
      message: "News deleted successfully",
    });
  });
});

module.exports = router;