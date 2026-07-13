const COMMENTS_KEY_PREFIX = "dailynewsComments_";

document.addEventListener("DOMContentLoaded", () => {
    initNewsComments();
});

function initNewsComments() {
    const newsId = getNewsIdFromUrl();
    const form = document.getElementById("commentForm");
    const input = document.getElementById("commentInput");
    const list = document.getElementById("commentList");
    const message = document.getElementById("commentMessage");
    const count = document.getElementById("commentCount");

    if (!newsId || !form || !input || !list || !message || !count) {
        return;
    }

    renderComments(newsId);

    form.addEventListener("submit", function (event) {
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

        const comments = getComments(newsId);

        comments.unshift({
            id: Date.now(),
            content: content,
            author: getCurrentUserName(),
            created_at: new Date().toISOString()
        });

        localStorage.setItem(getCommentsKey(newsId), JSON.stringify(comments));

        input.value = "";
        message.innerText = "评论已发布。";

        renderComments(newsId);

    });
}

function renderComments(newsId) {
    const list = document.getElementById("commentList");
    const message = document.getElementById("commentMessage");
    const count = document.getElementById("commentCount");

    if (!list || !message || !count) {
        return;
    }

    const comments = getComments(newsId);

    list.innerHTML = "";
    count.innerText = comments.length;

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
        author.textContent = comment.author || "Daily News 用户";

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
}

function getComments(newsId) {
    try {
        return JSON.parse(localStorage.getItem(getCommentsKey(newsId)) || "[]");
    } catch (error) {
        return [];
    }
}

function getCommentsKey(newsId) {
    return COMMENTS_KEY_PREFIX + String(newsId);
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

    return "Daily News 用户";
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