const API_NEWS = "/api/news";
const FAVORITES_KEY = "dailynewsFavorites";
const LIKES_KEY = "dailynewsLikes";

document.addEventListener("DOMContentLoaded", () => {
  const newsListBox = document.getElementById("newsList");

  if (newsListBox) {
    newsListBox.addEventListener("click", handleNewsAction);
  }

  loadNewsHome();
});

async function loadNewsHome() {
  const newsListBox = document.getElementById("newsList");
  const messageBox = document.getElementById("newsMessage");

  if (!newsListBox || !messageBox) {
    return;
  }

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
      const detailUrl = `/news-detail.html?id=${news.id}`;
      const fullUrl = window.location.origin + detailUrl;
      const favoriteActive = isFavorite(news.id);
      const likedActive = isLiked(news.id);

      const imageHtml = news.image_url
        ? `
      <img
        class="compact-news-image"
        src="${escapeHtml(news.image_url)}"
        alt="${escapeHtml(news.title || "")}"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      >
      <div class="compact-news-placeholder" style="display:none;">DailyNews</div>
    `
        : `<div class="compact-news-placeholder">DailyNews</div>`;

      const card = document.createElement("article");
      card.className = "compact-news-card";

      card.innerHTML = `
    <a class="compact-news-thumb-link" href="${detailUrl}">
      ${imageHtml}
    </a>

    <div class="compact-news-body">
      <a class="compact-news-title" href="${detailUrl}">
        ${escapeHtml(limitText(news.title || "", 80))}
      </a>

      <div class="compact-news-source">
        来源：${escapeHtml(limitText(news.source || "DailyNews", 80))}
      </div>

      <p class="compact-news-summary">
        ${escapeHtml(limitText(news.summary || "暂无摘要", 140))}
      </p>

      <div class="compact-news-actions">
        <button
          type="button"
          class="news-action-btn"
          data-action="comment"
          data-id="${news.id}"
          data-url="${detailUrl}"
        >
          💬 留言
        </button>

        <button
          type="button"
          class="news-action-btn"
          data-action="forward"
          data-id="${news.id}"
          data-url="${detailUrl}"
          data-title="${escapeAttr(news.title || "")}"
        >
          🔁 转发
        </button>

        <button
          type="button"
          class="news-action-btn ${likedActive ? "news-action-active" : ""}"
          data-action="like"
          data-id="${news.id}"
        >
          ❤ ${likedActive ? "已点赞" : "点赞"}
        </button>

        <span class="news-action-view">
          👁 阅读 ${news.views || 0}
        </span>

        <button
          type="button"
          class="news-action-btn ${favoriteActive ? "news-action-active" : ""}"
          data-action="favorite"
          data-id="${news.id}"
          data-url="${detailUrl}"
          data-title="${escapeAttr(news.title || "")}"
        >
          ☆ ${favoriteActive ? "已收藏" : "收藏"}
        </button>

        <button
          type="button"
          class="news-action-btn"
          data-action="share"
          data-id="${news.id}"
          data-url="${detailUrl}"
          data-title="${escapeAttr(news.title || "")}"
        >
          📤 分享
        </button>
      </div>
    </div>
  `;

      newsListBox.appendChild(card);
    });

  } catch (error) {
    console.error("Load news home error:", error);
    messageBox.innerText = "无法连接后端，请确认 node server.js 正在运行。";
  }
}

function handleNewsAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const newsId = Number(button.dataset.id || 0);
  const title = button.dataset.title || "";
  const detailUrl = button.dataset.url || "";
  const fullUrl = window.location.origin + detailUrl;

  if (action === "comment") {
    window.location.href = fullUrl;
    return;
  }

  if (action === "forward") {
    copyText(title + " " + fullUrl);
    alert("新闻链接已复制，你现在可以转发给别人。");
    return;
  }

  if (action === "like") {
    const liked = toggleLike(newsId);
    button.classList.toggle("news-action-active", liked);
    button.innerHTML = liked ? "❤ 已点赞" : "❤ 点赞";
    return;
  }

  if (action === "favorite") {
    const favored = toggleFavorite(newsId, title, fullUrl);
    button.classList.toggle("news-action-active", favored);
    button.innerHTML = favored ? "☆ 已收藏" : "☆ 收藏";
    alert(favored ? "已加入收藏，下一步我可以帮你接入“我的收藏”页面。" : "已取消收藏。");
    return;
  }

  if (action === "share") {
    shareNews(title, fullUrl);
  }
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function isFavorite(newsId) {
  return getFavorites().some((item) => Number(item.id) === Number(newsId));
}

function toggleFavorite(newsId, title, url) {
  const favorites = getFavorites();
  const index = favorites.findIndex((item) => Number(item.id) === Number(newsId));

  if (index >= 0) {
    favorites.splice(index, 1);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return false;
  }

  favorites.unshift({
    id: newsId,
    title: title || "",
    url: url || "",
    saved_at: new Date().toISOString()
  });

  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  return true;
}

function getLikes() {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function isLiked(newsId) {
  return getLikes().includes(Number(newsId));
}

function toggleLike(newsId) {
  const likes = getLikes();
  const index = likes.indexOf(Number(newsId));

  if (index >= 0) {
    likes.splice(index, 1);
    localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
    return false;
  }

  likes.push(Number(newsId));
  localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
  return true;
}

async function shareNews(title, url) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: title || "Daily News",
        text: title || "Daily News",
        url: url
      });
      return;
    } catch (error) {
    }
  }

  copyText(url);
  alert("分享链接已复制。");
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """)
      .replaceAll("'", "'");
}

function escapeAttr(text) {
  return String(text)
    .replaceAll("&", "&")
    .replaceAll('"', """)
      .replaceAll("<", "<")
      .replaceAll(">", ">");
}

function limitText(text, maxLength) {
  const str = String(text || "");
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + "...";
}