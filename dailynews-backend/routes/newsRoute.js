const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  verifyAdminToken,
} = require("../middleware/adminAuth");
const { checkUserToken } = require("../middleware/userAuth");
const { hasNewsAdminAccess } = require("../middleware/newsReadAccess");
router.use("/public-page", require("./publicNewsPageRoute")(db));
const NEWS_COUNTRY_METADATA = Object.freeze({
  sg: {
    name: "Singapore",
    region: "Asia",
  },
  us: {
    name: "United States",
    region: "North America",
  },
  cn: {
    name: "China",
    region: "Asia",
  },
  gb: {
    name: "United Kingdom",
    region: "Europe",
  },
  my: {
    name: "Malaysia",
    region: "Asia",
  },
});

function resolveNewsCountry(countryCode) {
  const normalizedCode = String(countryCode || "")
    .trim()
    .toLowerCase();

  if (!normalizedCode) {
    return {
      country_code: null,
      country_name: null,
      region: null,
    };
  }

  const metadata =
    NEWS_COUNTRY_METADATA[normalizedCode];

  if (!metadata) {
    return null;
  }

  return {
    country_code: normalizedCode,
    country_name: metadata.name,
    region: metadata.region,
  };
}

// 获取新闻列表

router.get("/", (req, res) => {
  const country = String(
    req.query.country || ""
  )
    .trim()
    .toLowerCase();

  if (
    country &&
    country !== "all" &&
    !/^[a-z]{2}$/.test(country)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid country code",
    });
  }

  res.set("Cache-Control", "private, no-store");
  res.vary("Authorization");
  const conditions = hasNewsAdminAccess(req) ? [] : ["status = 'published'"];
  const parameters = [];

  if (country && country !== "all") {
    conditions.push("country_code = ?");
    parameters.push(country);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const sql = `
      SELECT
          id,
          title,
          category,
          country_code,
          country_name,
          region,
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
      ${whereClause}
      ORDER BY created_at DESC
  `;

  db.all(sql, parameters, (err, rows) => {
    if (err) {
      console.error(
        "Get news list error:",
        err.message
      );

      return res.status(500).json({
        success: false,
        message: "Failed to get news list",
      });
    }

    res.json({
      success: true,
      filters: {
        country:
          country && country !== "all"
            ? country
            : null,
      },
      data: rows,
    });
  });
});

// 获取单条新闻详情
function isVipUser(user) {
  if (!user) {
    return false;
  }

  const memberLevel = String(user.member_level || "").toLowerCase();
  const subscriptionStatus = String(user.subscription_status || "").toLowerCase();
  const expireAt = user.vip_expire_at ? new Date(user.vip_expire_at) : null;
  const now = new Date();

  if (memberLevel === "vip") {
    if (!expireAt || expireAt > now) {
      return true;
    }
  }

  if (subscriptionStatus === "active") {
    if (!expireAt || expireAt > now) {
      return true;
    }
  }

  return false;
}

// 前台新闻详情接口：普通新闻公开，VIP新闻需要VIP会员
function readNewsDetail(req, res, allowAdmin = false) {
  res.set("Cache-Control", "private, no-store");
  res.vary("Authorization");
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "新闻 ID 无效" });
  db.get("SELECT * FROM news WHERE id=?", [id], (err, news) => {
    if (err) return res.status(500).json({ success: false, message: "新闻详情获取失败" });
    if (!news) return res.status(404).json({ success: false, message: "新闻不存在" });
    // Admin editing retains full access and does not inflate public view counts.
    if (allowAdmin && hasNewsAdminAccess(req)) return res.json({ success: true, data: news });
    if (news.status !== "published") return res.status(403).json({ success: false, code: "NEWS_NOT_PUBLISHED", message: "该新闻暂未发布" });
    const deliver = () => {
      db.run("UPDATE news SET views=COALESCE(views,0)+1 WHERE id=? AND status='published'", [id], error => {
        if (error) console.error("Update news views error:", error.code);
        else news.views = Number(news.views || 0) + 1;
        return res.json({ success: true, data: news });
      });
    };
    if (Number(news.is_vip) !== 1) return deliver();
    return checkUserToken(req, (authError, tokenUser) => {
      if (authError) return res.status(authError.status).json({ success: false, code: authError.code, message: authError.message });
      db.get("SELECT id,member_level,subscription_status,vip_expire_at FROM users WHERE id=?", [tokenUser.id], (userErr, user) => {
        if (userErr) return res.status(500).json({ success: false, message: "会员状态检查失败" });
        if (!isVipUser(user)) return res.status(403).json({
          success: false, code: "VIP_REQUIRED", message: "这是一篇VIP专享新闻，请升级后阅读完整内容。",
          data: { id: news.id, title: news.title, category: news.category, summary: news.summary,
            image_url: news.image_url, source: news.source, author: news.author, created_at: news.created_at, is_vip: news.is_vip }
        });
        return deliver();
      });
    });
  });
}

router.get("/public/:id", (req, res) => readNewsDetail(req, res));
router.get("/:id", (req, res) => readNewsDetail(req, res, true));

// Existing admin write routes remain unchanged.
router.post("/", verifyAdminToken, (req, res) => {
  const {
    title,
    category,
    country_code,
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

  const country = resolveNewsCountry(country_code);

  if (!country) {
    return res.status(400).json({
      success: false,
      message: "Invalid country code",
    });
  }

  const sql = `
    INSERT INTO news (
      title,
      category,
      country_code,
      country_name,
      region,
      summary,
      content,
      image_url,
      video_url,
      source,
      author,
      status,
      is_vip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    title,
    category || "general",
    country.country_code,
    country.country_name,
    country.region,
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
router.put("/:id", verifyAdminToken, (req, res) => {
  const { id } = req.params;

  const {
    title,
    category,
    country_code,
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

  const country = resolveNewsCountry(country_code);

  if (!country) {
    return res.status(400).json({
      success: false,
      message: "Invalid country code",
    });
  }

  const sql = `
    UPDATE news
    SET
      title = ?,
      category = ?,
      country_code = ?,
      country_name = ?,
      region = ?,
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
    country.country_code,
    country.country_name,
    country.region,
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

// 管理员发布新闻
router.patch(
  "/:id/publish",
  verifyAdminToken,
  (req, res) => {
    const { id } = req.params;

    const sql = `
            UPDATE news
            SET
                status = 'published',
                published_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

    db.run(sql, [id], function (err) {
      if (err) {
        console.error(
          "Publish news error:",
          err.message
        );

        return res.status(500).json({
          success: false,
          message: "发布新闻失败",
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: "新闻不存在",
        });
      }

      return res.json({
        success: true,
        message: "新闻发布成功",
        data: {
          id: Number(id),
          status: "published",
        },
      });
    });
  }
);

// 删除新闻
router.delete("/:id", verifyAdminToken, (req, res) => {
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
