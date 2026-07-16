const express = require("express");
const router = express.Router();
const db = require("../db");
const { moderateComment } = require("../utils/commentModeration");

const createCommentsTableSql =
    "CREATE TABLE IF NOT EXISTS comments (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "news_id INTEGER NOT NULL, " +
    "author TEXT DEFAULT 'Daily News User', " +
    "content TEXT NOT NULL, " +
    "status TEXT DEFAULT 'published', " +
    "moderation_reason TEXT DEFAULT '', " +
    "moderation_flags TEXT DEFAULT '[]', " +
    "created_at TEXT DEFAULT CURRENT_TIMESTAMP" +
    ")";

db.run(createCommentsTableSql, (err) => {
    if (err) {
        console.error("Create comments table error:", err);
        return;
    }

    ensureCommentColumns();
});

function ensureCommentColumns() {
    db.all("PRAGMA table_info(comments)", [], (err, columns) => {
        if (err) {
            console.error("Read comments table structure error:", err);
            return;
        }

        const columnNames = columns.map((column) => column.name);

        if (!columnNames.includes("moderation_reason")) {
            db.run(
                "ALTER TABLE comments ADD COLUMN moderation_reason TEXT DEFAULT ''",
                (alterErr) => {
                    if (alterErr) {
                        console.error("Add moderation_reason column error:", alterErr);
                    }
                }
            );
        }

        if (!columnNames.includes("moderation_flags")) {
            db.run(
                "ALTER TABLE comments ADD COLUMN moderation_flags TEXT DEFAULT '[]'",
                (alterErr) => {
                    if (alterErr) {
                        console.error("Add moderation_flags column error:", alterErr);
                    }
                }
            );
        }
    });
}

router.get("/:newsId", (req, res) => {
    const newsId = Number(req.params.newsId);

    if (!Number.isInteger(newsId) || newsId <= 0) {
        return res.status(400).json({
            success: false,
            message: "新闻 ID 不正确。"
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
                message: "评论加载失败，请稍后再试。"
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
    const author =
        String(req.body.author || "Daily News User").trim() ||
        "Daily News User";
    const content = String(req.body.content || "").trim();

    if (!Number.isInteger(newsId) || newsId <= 0) {
        return res.status(400).json({
            success: false,
            message: "新闻 ID 不正确。"
        });
    }

    const moderation = moderateComment(content);

    if (!moderation.allowed || moderation.status === "rejected") {
        return res.status(400).json({
            success: false,
            status: "rejected",
            message:
                moderation.reason ||
                "评论包含不适合发布的内容，请修改后再提交。",
            flags: moderation.flags || []
        });
    }

    const commentStatus =
        moderation.status === "pending" ? "pending" : "published";

    const moderationReason = moderation.reason || "";
    const moderationFlags = JSON.stringify(moderation.flags || []);

    const sql =
        "INSERT INTO comments (" +
        "news_id, author, content, status, moderation_reason, " +
        "moderation_flags, created_at" +
        ") VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))";

    const values = [
        newsId,
        author,
        content,
        commentStatus,
        moderationReason,
        moderationFlags
    ];

    db.run(sql, values, function (err) {
        if (err) {
            console.error("Create comment error:", err);

            return res.status(500).json({
                success: false,
                message: "评论提交失败，请稍后再试。"
            });
        }

        if (commentStatus === "pending") {
            return res.status(202).json({
                success: true,
                status: "pending",
                message: "评论已提交，正在等待管理员审核。",
                data: {
                    id: this.lastID,
                    news_id: newsId,
                    author,
                    content,
                    status: "pending"
                }
            });
        }

        return res.status(201).json({
            success: true,
            status: "published",
            message: "评论发布成功。",
            data: {
                id: this.lastID,
                news_id: newsId,
                author,
                content,
                status: "published"
            }
        });
    });
});

module.exports = router;