const API_NEWS = "http://localhost:5000/api/news";

document.addEventListener("DOMContentLoaded", () => {
  loadNewsDetail();
});

async function loadNewsDetail() {
  const newsId = getNewsIdFromUrl();

  const messageBox = document.getElementById("detailMessage");
  const detailBox = document.getElementById("newsDetailBox");

  if (!messageBox || !detailBox) {
    console.error("找不到 detailMessage 或 newsDetailBox，请检查 news-detail.html");
    return;
  }

  if (!newsId) {
    messageBox.innerText = "没有找到新闻 ID，请从新闻列表点击进入。";
    return;
  }

  messageBox.innerText = "正在加载新闻详情...";
  detailBox.innerHTML = "";

  try {
    const response = await fetch(`${API_NEWS}/${newsId}`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      messageBox.innerText = result.message || "新闻详情加载失败";
      return;
    }

    const news = result.data;

    messageBox.innerText = "";

    const imageHtml = news.image_url
      ? `
        <img 
          class="detail-image" 
          src="${escapeHtml(news.image_url)}" 
          alt="${escapeHtml(news.title || "")}"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div class="detail-image-placeholder" style="display:none;">DailyNews</div>
      `
      : `<div class="detail-image-placeholder">DailyNews</div>`;

    detailBox.innerHTML = `
      <article class="detail-card">
        <div class="detail-top">
          <span class="detail-category">${escapeHtml(news.category || "general")}</span>
          ${
            Number(news.is_vip) === 1
              ? '<span class="detail-vip">VIP</span>'
              : ""
          }
        </div>

        <h1 class="detail-title">${escapeHtml(news.title || "")}</h1>

        <div class="detail-meta">
          来源：${escapeHtml(news.source || "DailyNews")}　
          作者：${escapeHtml(news.author || "DailyNews Admin")}　
          时间：${escapeHtml(news.created_at || "")}　
          浏览量：${news.views || 0}
        </div>

        ${imageHtml}

        <div class="detail-summary">
          ${escapeHtml(news.summary || "")}
        </div>

        <div class="detail-content">
          ${formatContent(news.content || "")}
        </div>

        ${
          news.video_url
            ? `
              <div class="detail-video-box">
                <a class="detail-video-link" href="${escapeHtml(news.video_url)}" target="_blank">
                  打开视频链接
                </a>
              </div>
            `
            : ""
        }

        <div class="detail-actions">
          <a href="./news-home.html" class="detail-back">返回新闻列表</a>
          <a href="./index.html" class="detail-back">返回首页</a>
        </div>
      </article>
    `;
  } catch (error) {
    console.error("Load news detail error:", error);
    messageBox.innerText = "无法连接后端，请确认 node server.js 正在运行。";
  }
}

function getNewsIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatContent(content) {
  const safeText = escapeHtml(content);

  return safeText
    .split(/\n+/)
    .filter((paragraph) => paragraph.trim() !== "")
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}