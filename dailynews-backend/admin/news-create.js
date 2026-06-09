const API_NEWS = "http://localhost:5000/api/news";

document.addEventListener("DOMContentLoaded", () => {
  const newsForm = document.getElementById("newsForm");
  const messageBox = document.getElementById("newsMessage");

  if (!newsForm) {
    console.warn("newsForm not found");
    return;
  }

  newsForm.addEventListener("submit", async (event) => {
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
      messageBox.innerText = "请填写新闻标题";
      return;
    }

    if (!content) {
      messageBox.innerText = "请填写新闻正文";
      return;
    }

    const newsData = {
      title: title,
      category: category,
      summary: summary,
      content: content,
      image_url: image_url,
      video_url: video_url,
      source: source,
      author: author || "DailyNews Admin",
      status: status,
      is_vip: is_vip
    };

    messageBox.innerText = "正在发布新闻，请稍候...";

    try {
      const response = await fetch(API_NEWS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newsData)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        messageBox.innerText = result.message || "新闻发布失败";
        return;
      }

      messageBox.innerText = "新闻发布成功！新闻 ID：" + result.data.id;

      newsForm.reset();
      document.getElementById("newsAuthor").value = "DailyNews Admin";
    } catch (error) {
      console.error("Create news error:", error);
      messageBox.innerText = "无法连接后端。请确认 node server.js 正在运行。";
    }
  });
});