const API_NEWS = "/api/news";

let currentNewsId = null;

document.addEventListener("DOMContentLoaded", () => {
  currentNewsId = getNewsIdFromUrl();

  if (!currentNewsId) {
    showMessage("没有找到新闻 ID，请从新闻列表点击编辑进入。");
    return;
  }

  loadNewsDetail(currentNewsId);

  const form = document.getElementById("newsEditForm");
  form.addEventListener("submit", updateNews);
});

const publishButton =
  document.getElementById(
    "publishNewsButton"
  );

if (publishButton) {
  publishButton.addEventListener(
    "click",
    publishCurrentNews
  );
}

function getNewsIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function loadNewsDetail(id) {
  showMessage("正在读取新闻内容...");

  try {
    const response = await fetch(`${API_NEWS}/${id}`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      showMessage(result.message || "读取新闻失败");
      return;
    }

    const news = result.data;

    document.getElementById("newsTitle").value = news.title || "";
    document.getElementById("newsCategory").value = news.category || "general";
    document.getElementById("newsSummary").value = news.summary || "";
    document.getElementById("newsContent").value = news.content || "";
    document.getElementById("newsImageUrl").value = news.image_url || "";
    document.getElementById("newsVideoUrl").value = news.video_url || "";
    document.getElementById("newsSource").value = news.source || "";
    document.getElementById("newsAuthor").value = news.author || "DailyNews Admin";
    document.getElementById("newsStatus").value = news.status || "published";
    updatePublishButtonState(
      news.status
    );
    document.getElementById("newsIsVip").checked = Number(news.is_vip) === 1;

    showMessage("新闻内容读取成功，可以开始修改。");
  } catch (error) {
    console.error("Load news detail error:", error);
    showMessage("无法连接后端，请确认 node server.js 正在运行。");
  }
}

function updatePublishButtonState(status) {
  const publishButton =
    document.getElementById(
      "publishNewsButton"
    );

  if (!publishButton) {
    return;
  }

  const isPublished =
    String(status || "")
      .trim()
      .toLowerCase() ===
    "published";

  publishButton.disabled =
    isPublished;

  publishButton.textContent =
    isPublished
      ? "新闻已发布"
      : "发布新闻";
}

async function updateNews(event) {
  event.preventDefault();

  const title = document.getElementById("newsTitle").value.trim();
  const category = document.getElementById("newsCategory").value;
  const summary = document.getElementById("newsSummary").value.trim();
  const content = document.getElementById("newsContent").value.trim();
  const image_url = document.getElementById("newsImageUrl").value.trim();
  const video_url = document.getElementById("newsVideoUrl").value.trim();
  const source = document.getElementById("newsSource").value.trim();
  const author = document.getElementById("newsAuthor").value.trim();
  const status = document.getElementById("newsStatus").value;
  const is_vip = document.getElementById("newsIsVip").checked ? 1 : 0;

  if (!title) {
    showMessage("新闻标题不能为空");
    return;
  }

  if (!content) {
    showMessage("新闻正文不能为空");
    return;
  }

  const newsData = {
    title,
    category,
    summary,
    content,
    image_url,
    video_url,
    source,
    author: author || "DailyNews Admin",
    status,
    is_vip
  };

  showMessage("正在保存修改...");

  try {
    const response = await fetch(`${API_NEWS}/${currentNewsId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(newsData)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      showMessage(result.message || "保存修改失败");
      return;
    }

    showMessage(
      "新闻修改成功！2 秒后返回后台新闻管理。"
    );

    setTimeout(() => {
      window.location.href = "./admin-news.html";
    }, 2000);
  } catch (error) {
    console.error("Update news error:", error);
    showMessage("无法连接后端，请确认 node server.js 正在运行。");
  }
}

async function publishCurrentNews() {
  if (!currentNewsId) {
    showMessage(
      "无法确认当前新闻ID"
    );
    return;
  }

  const confirmed = confirm(
    "确定发布这条新闻吗？\n\n" +
    "发布后，这条新闻将可以在网站前端显示。"
  );

  if (!confirmed) {
    return;
  }

  const publishButton =
    document.getElementById(
      "publishNewsButton"
    );

  if (publishButton) {
    publishButton.disabled = true;
    publishButton.textContent =
      "正在发布……";
  }

  try {
    const adminToken =
      localStorage.getItem(
        "adminToken"
      );

    if (!adminToken) {
      throw new Error(
        "管理员登录已过期，请重新登录"
      );
    }

    const response = await fetch(
      `${API_NEWS}/${currentNewsId}/publish`,
      {
        method: "PATCH",
        headers: {
          Accept:
            "application/json",
          Authorization:
            `Bearer ${adminToken}`,
        },
      }
    );

    const result =
      await response
        .json()
        .catch(function () {
          return {};
        });

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
        "发布新闻失败"
      );
    }

    const statusSelect =
      document.getElementById(
        "newsStatus"
      );

    if (statusSelect) {
      statusSelect.value =
        "published";
    }

    updatePublishButtonState(
      "published"
    );

    showMessage(
      "新闻发布成功！2秒后返回后台新闻管理。"
    );

    setTimeout(function () {
      window.location.href =
        "./admin-news.html";
    }, 2000);
  } catch (error) {
    console.error(
      "Publish news error:",
      error
    );

    showMessage(
      `发布失败：${error.message}`
    );

    if (publishButton) {
      publishButton.disabled =
        false;
      publishButton.textContent =
        "发布新闻";
    }
  }
}

function showMessage(text) {
  const messageBox = document.getElementById("newsMessage");
  if (messageBox) {
    messageBox.innerText = text;
  }
}