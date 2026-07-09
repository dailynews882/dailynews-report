const messageBox = document.getElementById("messageBox");
const articleBox = document.getElementById("articleBox");

document.addEventListener("DOMContentLoaded", () => {
    loadNewsDetail();
});

async function loadNewsDetail() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
        showMessage("新闻ID不存在，无法加载新闻详情。");
        return;
    }

    const token = localStorage.getItem("token") || "";

    try {
        const response = await fetch(`/api/news/public/${encodeURIComponent(id)}`, {
            method: "GET",
            headers: token
                ? {
                    Authorization: `Bearer ${token}`
                }
                : {}
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showArticle(result.data);
            return;
        }

        if (result.code === "LOGIN_REQUIRED") {
            showLockedArticle(result.data, "请先登录", result.message, "login");
            return;
        }

        if (result.code === "VIP_REQUIRED") {
            showLockedArticle(result.data, "VIP专享内容", result.message, "vip");
            return;
        }

        showMessage(result.message || "新闻详情加载失败。");
    } catch (error) {
        console.error("Load news detail error:", error);
        showMessage("新闻详情加载失败，请检查服务器是否正常运行。");
    }
}

function showArticle(news) {
    if (!news) {
        showMessage("新闻内容不存在。");
        return;
    }

    messageBox.style.display = "none";

    const vipTag = Number(news.is_vip) === 1
        ? '<span class="vip-tag">VIP专享</span>'
        : "";

    const imageHtml = news.image_url
        ? `<img class="cover" src="${escapeHtml(news.image_url)}" alt="${escapeHtml(news.title || "新闻图片")}" onerror="this.style.display='none';" />`
        : "";

    articleBox.innerHTML = `
    <article class="article">
      <div class="tag-row">
        <span class="category">${escapeHtml(news.category || "general")}</span>
        ${vipTag}
      </div>

      <h1>${escapeHtml(news.title || "未命名新闻")}</h1>

      <div class="meta">
        来源：${escapeHtml(news.source || "DailyNews")}<br>
        作者：${escapeHtml(news.author || "DailyNews Admin")}<br>
        发布时间：${escapeHtml(formatDate(news.created_at))}<br>
        阅读量：${escapeHtml(news.views || 0)}
      </div>

      ${imageHtml}

      ${news.summary
            ? `<div class="summary">${escapeHtml(news.summary)}</div>`
            : ""
        }

      <div class="content">${escapeHtml(news.content || "")}</div>
    </article>
  `;
}

function showLockedArticle(news, title, text, type) {
    messageBox.style.display = "none";

    const preview = news
        ? `
      <article class="article" style="margin-bottom: 22px;">
        <div class="tag-row">
          <span class="category">${escapeHtml(news.category || "general")}</span>
          <span class="vip-tag">VIP专享</span>
        </div>
        <h1>${escapeHtml(news.title || "VIP新闻")}</h1>
        ${news.summary
            ? `<div class="summary">${escapeHtml(news.summary)}</div>`
            : ""
        }
      </article>
    `
        : "";

    const actionHtml = type === "login"
        ? `
      <div class="action-row">
        <a class="primary-btn" href="/index.html">返回首页登录</a>
        <a class="secondary-btn" href="/subscribe.html">查看VIP订阅</a>
      </div>
    `
        : `
      <div class="action-row">
        <a class="secondary-btn" href="/subscribe.html">升级VIP会员</a>
        <a class="primary-btn" href="/index.html">返回首页</a>
      </div>
    `;

    articleBox.innerHTML = `
    ${preview}
    <section class="lock-box">
      <div class="lock-title">${escapeHtml(title)}</div>
      <div class="lock-text">${escapeHtml(text || "该内容需要VIP会员权限。")}</div>
      ${actionHtml}
    </section>
  `;
}

function showMessage(text) {
    messageBox.style.display = "block";
    messageBox.innerText = text;
    articleBox.innerHTML = "";
}

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    if (!value) {
        return "";
    }

    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (error) {
        return value;
    }
}