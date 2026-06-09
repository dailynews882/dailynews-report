const API_NEWS = "http://localhost:5000/api/news";

console.log("news-list.js 已经加载");

document.addEventListener("DOMContentLoaded", function () {
  console.log("页面 DOM 已经加载完成");
  loadNewsList();
});

async function loadNewsList() {
  console.log("开始请求新闻列表:", API_NEWS);

  const tableBody = document.getElementById("newsTableBody");
  const messageBox = document.getElementById("newsMessage");

  if (!tableBody) {
    console.error("找不到 newsTableBody");
    return;
  }

  if (!messageBox) {
    console.error("找不到 newsMessage");
    return;
  }

  tableBody.innerHTML = "";
  messageBox.innerText = "正在请求新闻数据...";

  try {
    const response = await fetch(API_NEWS);
    console.log("接口响应状态:", response.status);

    const result = await response.json();
    console.log("接口返回数据:", result);

    if (!response.ok) {
      messageBox.innerText = "接口请求失败，状态码：" + response.status;
      return;
    }

    if (!result.success) {
      messageBox.innerText = result.message || "接口返回 success 为 false";
      return;
    }

    const newsList = result.data || [];

    if (newsList.length === 0) {
      messageBox.innerText = "目前数据库里没有新闻。";
      return;
    }

    messageBox.innerText = "共找到 " + newsList.length + " 条新闻";

    newsList.forEach(function (news) {
      const tr = document.createElement("tr");

      const statusText = news.status === "published" ? "已发布" : "草稿";
      const vipText = Number(news.is_vip) === 1 ? "VIP" : "普通";

      tr.innerHTML = `
        <td>${news.id}</td>
        <td>${escapeHtml(news.title || "")}</td>
        <td>${escapeHtml(news.category || "")}</td>
        <td>${escapeHtml(news.summary || "")}</td>
        <td>${statusText}</td>
        <td>${vipText}</td>
        <td>${news.views || 0}</td>
        <td>${news.created_at || ""}</td>
        <td>
          <a class="btn btn-edit" href="./news-edit.html?id=${news.id}">编辑</a>
          <button class="btn btn-delete" onclick="deleteNews(${news.id})">删除</button>
        </td>
      `;

      tableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("加载新闻列表出错:", error);
    messageBox.innerText = "加载失败，请打开 F12 Console 查看错误。";
  }
}

async function deleteNews(id) {
  const confirmDelete = confirm("确定要删除这条新闻吗？");

  if (!confirmDelete) {
    return;
  }

  try {
    const response = await fetch(API_NEWS + "/" + id, {
      method: "DELETE"
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || "删除失败");
      return;
    }

    alert("删除成功");
    loadNewsList();
  } catch (error) {
    console.error("删除新闻出错:", error);
    alert("删除失败，请确认后端正在运行。");
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