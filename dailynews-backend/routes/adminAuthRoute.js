const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "请输入管理员账号和密码。"
            });
        }

        const configuredUsername = process.env.ADMIN_USERNAME;
        const configuredPasswordHash =
            process.env.ADMIN_PASSWORD_HASH;
        const adminJwtSecret = process.env.ADMIN_JWT_SECRET;

        if (
            !configuredUsername ||
            !configuredPasswordHash ||
            !adminJwtSecret
        ) {
            console.error(
                "Admin authentication environment variables are missing."
            );

            return res.status(500).json({
                success: false,
                message: "管理员登录配置不完整，请联系系统管理员。"
            });
        }

        if (username !== configuredUsername) {
            return res.status(401).json({
                success: false,
                message: "管理员账号或密码错误。"
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            configuredPasswordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "管理员账号或密码错误。"
            });
        }

        const token = jwt.sign(
            {
                username: configuredUsername,
                role: "admin",
                type: "admin_access"
            },
            adminJwtSecret,
            {
                expiresIn: "8h"
            }
        );

        return res.json({
            success: true,
            message: "管理员登录成功。",
            token,
            admin: {
                username: configuredUsername,
                role: "admin"
            }
        });
    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            success: false,
            message: "管理员登录失败，请稍后重试。"
        });
    }
});

router.get("/verify", (req, res) => {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "管理员未登录。"
        });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    try {
        const decoded = jwt.verify(
            token,
            process.env.ADMIN_JWT_SECRET
        );

        if (
            decoded.role !== "admin" ||
            decoded.type !== "admin_access"
        ) {
            return res.status(403).json({
                success: false,
                message: "没有管理员权限。"
            });
        }

        return res.json({
            success: true,
            admin: {
                username: decoded.username,
                role: decoded.role
            }
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "管理员登录已失效，请重新登录。"
        });
    }
});

module.exports = router;