const express = require("express");
const router = express.Router();
const db = require("../db");

const ALLOWED_STATUSES = [
    "published",
    "pending",
    "rejected",
    "hidden",
    "deleted"
];

router.get("/", (req, res) => {
    const status = String(req.query.status || "").trim();
    const newsId = Number(req.query.news_id);

    const conditions = [];
    const values = [];

    if (status) {
        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "评论状态不正确。"
            });
        }

        conditions.push("status = ?");
        values.push(status);
    }

    if (req.query.news_id !== undefined && req.query.news_id !== "") {
        if (!Number.isInteger(newsId) || newsId <= 0) {
            return res.status(400).json({
                success: false,
                message: "新闻 ID 不正确。"
            });
        }

        conditions.push("news_id = ?");
        values.push(newsId);
    }

    let sql =
        "SELECT id, news_id, author, content, status, " +
        "moderation_reason, moderation_flags, created_at " +
        "FROM comments";

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY id DESC";

    db.all(sql, values, (err, rows) => {
        if (err) {
            console.error("Admin load comments error:", err);

            return res.status(500).json({
                success: false,
                message: "评论列表加载失败。"
            });
        }

        const data = (rows || []).map((row) => {
            let parsedFlags = [];

            try {
                parsedFlags = JSON.parse(row.moderation_flags || "[]");
            } catch (parseErr) {
                parsedFlags = [];
            }

            return {
                ...row,
                moderation_flags: parsedFlags
            };
        });

        return res.json({
            success: true,
            count: data.length,
            data
        });
    });
});

router.patch("/:id/status", (req, res) => {
    const commentId = Number(req.params.id);
    const status = String(req.body.status || "").trim();

    if (!Number.isInteger(commentId) || commentId <= 0) {
        return res.status(400).json({
            success: false,
            message: "评论 ID 不正确。"
        });
    }

    if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: "评论状态不正确。"
        });
    }

    const sql =
        "UPDATE comments " +
        "SET status = ? " +
        "WHERE id = ?";

    db.run(sql, [status, commentId], function (err) {
        if (err) {
            console.error("Admin update comment status error:", err);

            return res.status(500).json({
                success: false,
                message: "评论状态更新失败。"
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "没有找到这条评论。"
            });
        }

        return res.json({
            success: true,
            message: "评论状态更新成功。",
            data: {
                id: commentId,
                status
            }
        });
    });
});

router.delete("/:id", (req, res) => {
    const commentId = Number(req.params.id);

    if (!Number.isInteger(commentId) || commentId <= 0) {
        return res.status(400).json({
            success: false,
            message: "评论 ID 不正确。"
        });
    }

    const sql =
        "UPDATE comments " +
        "SET status = 'deleted' " +
        "WHERE id = ?";

    db.run(sql, [commentId], function (err) {
        if (err) {
            console.error("Admin delete comment error:", err);

            return res.status(500).json({
                success: false,
                message: "评论删除失败。"
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "没有找到这条评论。"
            });
        }

        return res.json({
            success: true,
            message: "评论已删除。",
            data: {
                id: commentId,
                status: "deleted"
            }
        });
    });
});

module.exports = router;