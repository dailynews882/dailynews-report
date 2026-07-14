const express = require("express");
const router = express.Router();
const db = require("../db");

const createCommentsTableSql =
    "CREATE TABLE IF NOT EXISTS comments (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "news_id INTEGER NOT NULL, " +
    "author TEXT DEFAULT 'Daily News User', " +
    "content TEXT NOT NULL, " +
    "status TEXT DEFAULT 'published', " +
    "created_at TEXT DEFAULT CURRENT_TIMESTAMP" +
    ")";

db.run(createCommentsTableSql);

router.get("/:newsId", (req, res) => {
    const newsId = Number(req.params.newsId);

    if (!newsId) {
        return res.status(400).json({
            success: false,
            message: "新闻 ID 不正确"
        });
    }

    const sql =
        "SELECT id, news_id, author, content, status, created_at " +
        "FROM comments " +
        "WHERE news_id = ? AND status = 'published' " +
        "ORDER BY id DESC";

    db.all(sql, [newsId], (err, rows) => {
        if (err) {
            console.error("Load comments error:", err);

            return res.status(500).json({
                success: false,
                message: "评论加载失败"
            });
        }

        return res.json({
            success: true,
            data: rows || []
        });
    });
});

router.post("/", (req, res) => {
    const newsId = Number(req.body.news_id);
    const author = String(req.body.author || "Daily News User").trim();
    const content = String(req.body.content || "").trim();

    if (!newsId) {
        return res.status(400).json({
            success: false,
            message: "新闻 ID 不正确"
        });
    }

    if (!content) {
        return res.status(400).json({
            success: false,
            message: "请输入评论内容"
        });
    }

    if (content.length > 300) {
        return res.status(400).json({
            success: false,
            message: "评论内容不能超过 300 个字"
        });
    }

    const sql =
        "INSERT INTO comments (news_id, author, content, status, created_at) " +
        "VALUES (?, ?, ?, 'published', datetime('now', 'localtime'))";

    db.run(sql, [newsId, author || "Daily News User", content], function (err) {
        if (err) {
            console.error("Create comment error:", err);

            return res.status(500).json({
                success: false,
                message: "评论发布失败"
            });
        }

        return res.json({
            success: true,
            message: "评论发布成功",
            data: {
                id: this.lastID,
                news_id: newsId,
                author: author || "Daily News User",
                content: content
            }
        });
    });
});

module.exports = router;