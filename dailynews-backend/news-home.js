const API_NEWS = "http://localhost:5000/api/news";

document.addEventListener("DOMContentLoaded", () => {
  loadNewsHome();
});

async function loadNewsHome() {
  const newsListBox = document.getElementById("newsList");
  const messageBox = document.getElementById("newsMessage");

  newsListBox.innerHTML = "";
  messageBox.innerText = "正在加载新闻...";

  try {
    const response = await fetch(API_NEWS);
    const result = await response.json();

    if (!response.ok || !result.success) {
      messageBox.innerText = result.message || "新闻加载失败";
      return;
    }

    const newsList = result.data || [];
    const publishedNews = newsList.filter((item) => item.status === "published");

    if (publishedNews.length === 0) {
      messageBox.innerText = "目前还没有已发布的新闻。请先到后台新增新闻。";
      return;
    }

    messageBox.innerText = "共加载 " + publishedNews.length + " 条新闻";

    publishedNews.forEach((news) => {
      const card = document.createElement("div");
      card.className = "news-card";

      const imageHtml = news.image_url
        ? `
          <img 
            class="news-image" 
            src="${escapeHtml(news.image_url)}" 
            alt="${escapeHtml(news.title || "")}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >
          <div class="news-placeholder" style="display:none;">DailyNews</div>
        `
        : `<div class="news-placeholder">DailyNews</div>`;

      card.innerHTML = `
        ${imageHtml}

        <div class="news-content">
          <div class="tag-row">
            <span class="news-category">${escapeHtml(news.category || "general")}</span>
            ${
              Number(news.is_vip) === 1
                ? '<span class="vip-tag">VIP</span>'
                : ''
            }
          </div>

          <h2 class="news-title">
            ${escapeHtml(limitText(news.title || "", 55))}
          </h2>

          <p class="news-summary">
            ${escapeHtml(limitText(news.summary || "暂无摘要", 90))}
          </p>

          <div class="bottom-row">
            <div class="news-meta">
            来源：${escapeHtml(limitText(news.source || "DailyNews", 36))}<br>
            作者：${escapeHtml(news.author || "DailyNews Admin")}　
            时间：${escapeHtml(news.created_at || "")}　
            浏览量：${news.views || 0}
          </div>

          <a class="read-more" href="./news-detail.html?id=${news.id}">
            阅读全文
          </a>
        </div>
      `;

      newsListBox.appendChild(card);
    });
  } catch (error) {
    console.error("Load news home error:", error);
    messageBox.innerText = "无法连接后端，请确认 node server.js 正在运行。";
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function limitText(text, maxLength) {
  const str = String(text || "");
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + "...";
}