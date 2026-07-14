const COMMENTS_API = "/api/comments";

document.addEventListener("DOMContentLoaded", () => {
    initNewsComments();
});

function initNewsComments() {
    const newsId = getNewsIdFromUrl();
    const form = document.getElementById("commentForm");
    const input = document.getElementById("commentInput");
    const message = document.getElementById("commentMessage");

    if (!newsId || !form || !input || !message) {
        return;
    }

    loadComments(newsId);

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const content = input.value.trim();

        if (!content) {
            message.innerText = "请输入评论内容。";
            return;
        }

        if (content.length > 300) {
            message.innerText = "评论内容不能超过 300 个字。";
            return;
        }

        message.innerText = "正在发布评论...";

        try {
            const response = await fetch(COMMENTS_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    news_id: newsId,
                    author: getCurrentUserName(),
                    content: content
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                message.innerText = result.message || "评论发布失败。";
                return;
            }

            input.value = "";
            message.innerText = "评论已发布。";

            loadComments(newsId);
        } catch (error) {
            console.error("Create comment error:", error);
            message.innerText = "无法连接评论服务，请稍后再试。";
        }
    });
}

async function loadComments(newsId) {
    const list = document.getElementById("commentList");
    const message = document.getElementById("commentMessage");
    const count = document.getElementById("commentCount");

    if (!list || !message || !count) {
        return;
    }

    list.innerHTML = "";
    count.innerText = "0";
    message.innerText = "正在加载评论...";

    try {
        const response = await fetch(COMMENTS_API + "/" + encodeURIComponent(newsId));
        const result = await response.json();

        if (!response.ok || !result.success) {
            message.innerText = result.message || "评论加载失败。";
            return;
        }

        const comments = result.data || [];

        count.innerText = comments.length;
        list.innerHTML = "";

        if (comments.length === 0) {
            message.innerText = "目前还没有评论，欢迎发表第一条评论。";
            return;
        }

        message.innerText = "";

        comments.forEach((comment) => {
            const item = document.createElement("div");
            item.className = "comment-item";

            const header = document.createElement("div");
            header.className = "comment-header";

            const author = document.createElement("span");
            author.className = "comment-author";
            author.textContent = comment.author || "Daily News User";

            const time = document.createElement("span");
            time.className = "comment-time";
            time.textContent = formatDate(comment.created_at);

            header.appendChild(author);
            header.appendChild(time);

            const content = document.createElement("p");
            content.className = "comment-content";
            content.textContent = comment.content || "";

            item.appendChild(header);
            item.appendChild(content);

            list.appendChild(item);
        });
    } catch (error) {
        console.error("Load comments error:", error);
        message.innerText = "无法连接评论服务，请稍后再试。";
    }
}

function getNewsIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

function getCurrentUserName() {
    try {
        const user = JSON.parse(localStorage.getItem("dailynewsUser") || "{}");

        if (user.name) {
            return user.name;
        }

        if (user.email) {
            return user.email;
        }

        if (user.phone) {
            return user.phone;
        }
    } catch (error) {
    }

    return "Daily News User";
}

function formatDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}