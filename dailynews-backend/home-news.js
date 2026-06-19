const HOME_NEWS_API = "/api/news";

document.addEventListener("DOMContentLoaded", () => {
  loadHomeNews();
});

async function loadHomeNews() {
  const listBox = document.getElementById("homeNewsList");
  const messageBox = document.getElementById("homeNewsMessage");

  if (!listBox || !messageBox) {
    console.warn("首页新闻容器没有找到，请检查 index.html 是否加入 homeNewsList 和 homeNewsMessage");
    return;
  }

  listBox.innerHTML = "";
  messageBox.innerText = "正在加载新闻...";

  try {
    const response = await fetch(HOME_NEWS_API);
    const result = await response.json();

    if (!response.ok || !result.success) {
      messageBox.innerText = "新闻加载失败";
      return;
    }

    const newsList = (result.data || [])
      .filter((item) => item.status === "published")
      .slice(0, 6);

    if (newsList.length === 0) {
      messageBox.innerText = "目前还没有已发布新闻。";
      return;
    }

    messageBox.innerText = "";

    newsList.forEach((news) => {
      const item = document.createElement("div");
      item.className = "home-news-item";

      const imageHtml = news.image_url
        ? `
          <img 
            class="home-news-thumb" 
            src="${escapeHtml(news.image_url)}" 
            alt="${escapeHtml(news.title || "")}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          />
          <div class="home-news-thumb-placeholder" style="display:none;">DailyNews</div>
        `
        : `<div class="home-news-thumb-placeholder">DailyNews</div>`;

      item.innerHTML = `
        ${imageHtml}

        <div class="home-news-info">
          <h3 class="home-news-title">${escapeHtml(news.title || "")}</h3>
          <p class="home-news-summary">${escapeHtml(news.summary || "暂无摘要")}</p>
          <div class="home-news-meta">
            ${escapeHtml(news.category || "general")} · 
            ${escapeHtml(news.source || "DailyNews")} · 
            ${escapeHtml(news.created_at || "")}
          </div>
        </div>

        <a class="home-news-read" href="./news-detail.html?id=${news.id}">
          阅读全文
        </a>
      `;

      listBox.appendChild(item);
    });
  } catch (error) {
    console.error("Load home news error:", error);
    messageBox.innerText = "无法连接新闻接口，请确认后端正在运行。";
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