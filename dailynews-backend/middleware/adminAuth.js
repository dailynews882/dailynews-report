const jwt = require("jsonwebtoken");

function verifyAdminToken(req, res, next) {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "管理员未登录或登录已失效。"
        });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "管理员 Token 不存在。"
        });
    }

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

        req.admin = decoded;
        next();
    } catch (error) {
        console.error("Verify admin token error:", error.message);

        return res.status(401).json({
            success: false,
            message: "管理员登录已失效，请重新登录。"
        });
    }
}

module.exports = {
    verifyAdminToken
};