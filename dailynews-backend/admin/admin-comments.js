const ADMIN_COMMENTS_API = "/api/admin/comments";
function getAdminAuthHeaders(includeJson = false) {
    const adminToken = localStorage.getItem("adminToken");

    const headers = {
        Accept: "application/json"
    };

    if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`;
    }

    if (includeJson) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

function handleAdminUnauthorized(response, result) {
    if (response.status !== 401 && response.status !== 403) {
        return false;
    }

    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("adminLoggedIn");

    alert(
        result?.message ||
        "管理员登录已失效，请重新登录。"
    );

    window.location.href = "./admin-login.html";
    return true;
}

let allAdminComments = [];

document.addEventListener("DOMContentLoaded", function () {
    const commentsTableBody = document.getElementById("commentsTableBody");

    if (!commentsTableBody) {
        return;
    }

    loadAdminComments();
});

async function loadAdminComments() {
    const commentsTableBody = document.getElementById("commentsTableBody");

    if (!commentsTableBody) {
        return;
    }

    commentsTableBody.innerHTML = `
    <tr>
      <td colspan="7">正在加载评论...</td>
    </tr>
  `;

    try {
        const response = await fetch(ADMIN_COMMENTS_API, {
            method: "GET",
            headers: getAdminAuthHeaders()
        });

        const result = await response.json();

        if (handleAdminUnauthorized(response, result)) {
            return;
        }

        if (!response.ok || !result.success) {
            throw new Error(result.message || "评论加载失败");
        }

        allAdminComments = Array.isArray(result.data) ? result.data : [];

        updateCommentStatistics(allAdminComments);
        renderAdminComments();
    } catch (error) {
        console.error("Load admin comments error:", error);

        commentsTableBody.innerHTML = `
      <tr>
        <td colspan="7">评论加载失败，请稍后重试。</td>
      </tr>
    `;
    }
}

function renderAdminComments() {
    const commentsTableBody = document.getElementById("commentsTableBody");
    const searchInput = document.getElementById("commentSearchInput");
    const statusFilter = document.getElementById("commentStatusFilter");

    if (!commentsTableBody) {
        return;
    }

    const keyword = String(searchInput?.value || "")
        .trim()
        .toLowerCase();

    const selectedStatus = String(statusFilter?.value || "all");

    const filteredComments = allAdminComments.filter((comment) => {
        const searchableText = [
            comment.id,
            comment.news_id,
            comment.author,
            comment.content,
            comment.status,
            comment.moderation_reason
        ]
            .join(" ")
            .toLowerCase();

        const matchesKeyword =
            !keyword || searchableText.includes(keyword);

        const matchesStatus =
            selectedStatus === "all" ||
            comment.status === selectedStatus;

        return matchesKeyword && matchesStatus;
    });

    if (filteredComments.length === 0) {
        commentsTableBody.innerHTML = `
      <tr>
        <td colspan="7">没有符合条件的评论。</td>
      </tr>
    `;
        return;
    }

    commentsTableBody.innerHTML = filteredComments
        .map((comment) => createCommentRow(comment))
        .join("");
}

function createCommentRow(comment) {
    const statusInfo = getCommentStatusInfo(comment.status);
    const safeAuthor = escapeHtml(comment.author || "Daily News User");
    const safeContent = escapeHtml(comment.content || "");
    const safeCreatedAt = escapeHtml(comment.created_at || "");

    return `
    <tr data-comment-id="${comment.id}" data-status="${comment.status}">
      <td>${comment.id}</td>
      <td>${safeAuthor}</td>
      <td>新闻 ID：${comment.news_id}</td>
      <td>${safeContent}</td>
      <td>
        <span class="status ${statusInfo.className}">
          ${statusInfo.label}
        </span>
      </td>
      <td>${safeCreatedAt}</td>
      <td>${createCommentActionButtons(comment)}</td>
    </tr>
  `;
}

function createCommentActionButtons(comment) {
    const buttons = [
        `<button class="table-btn" onclick="viewAdminComment(${comment.id})">查看</button>`
    ];

    if (comment.status === "pending") {
        buttons.push(
            `<button class="table-btn success" onclick="updateAdminCommentStatus(${comment.id}, 'published')">通过</button>`
        );
    }

    if (comment.status !== "hidden") {
        buttons.push(
            `<button class="table-btn" onclick="updateAdminCommentStatus(${comment.id}, 'hidden')">隐藏</button>`
        );
    }

    if (comment.status !== "deleted") {
        buttons.push(
            `<button class="table-btn danger" onclick="deleteAdminComment(${comment.id})">删除</button>`
        );
    }

    if (
        comment.status === "hidden" ||
        comment.status === "deleted"
    ) {
        buttons.push(
            `<button class="table-btn success" onclick="updateAdminCommentStatus(${comment.id}, 'published')">恢复</button>`
        );
    }

    return `<div class="action-buttons">${buttons.join("")}</div>`;
}

function getCommentStatusInfo(status) {
    const statusMap = {
        published: {
            label: "已发布",
            className: "vip"
        },
        pending: {
            label: "待审核",
            className: "normal"
        },
        rejected: {
            label: "已拒绝",
            className: "banned"
        },
        hidden: {
            label: "已隐藏",
            className: "normal"
        },
        deleted: {
            label: "已删除",
            className: "banned"
        }
    };

    return (
        statusMap[status] || {
            label: status || "未知",
            className: "normal"
        }
    );
}

function updateCommentStatistics(comments) {
    const cards = document.querySelectorAll(
        ".dashboard-card p"
    );

    if (cards.length < 4) {
        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const totalCount = comments.length;
    const todayCount = comments.filter((comment) =>
        String(comment.created_at || "").startsWith(today)
    ).length;
    const pendingCount = comments.filter(
        (comment) => comment.status === "pending"
    ).length;
    const violationCount = comments.filter((comment) =>
        ["rejected", "hidden", "deleted"].includes(comment.status)
    ).length;

    cards[0].textContent = totalCount;
    cards[1].textContent = todayCount;
    cards[2].textContent = pendingCount;
    cards[3].textContent = violationCount;
}

window.filterComments = function () {
    renderAdminComments();
};

window.viewAdminComment = function (commentId) {
    const comment = allAdminComments.find(
        (item) => Number(item.id) === Number(commentId)
    );

    if (!comment) {
        alert("没有找到这条评论。");
        return;
    }

    const modal = document.getElementById("commentModal");
    const content = document.getElementById(
        "commentModalContent"
    );

    if (!modal || !content) {
        alert("评论详情窗口加载失败。");
        return;
    }

    const flags = Array.isArray(comment.moderation_flags)
        ? comment.moderation_flags.join(", ")
        : "";

    content.innerHTML = `
    <p><strong>评论 ID：</strong>${comment.id}</p>
    <p><strong>新闻 ID：</strong>${comment.news_id}</p>
    <p><strong>用户：</strong>${escapeHtml(comment.author || "")}</p>
    <p><strong>评论内容：</strong>${escapeHtml(comment.content || "")}</p>
    <p><strong>状态：</strong>${escapeHtml(comment.status || "")}</p>
    <p><strong>审核原因：</strong>${escapeHtml(comment.moderation_reason || "无")}</p>
    <p><strong>审核标记：</strong>${escapeHtml(flags || "无")}</p>
    <p><strong>评论时间：</strong>${escapeHtml(comment.created_at || "")}</p>
  `;

    modal.style.display = "flex";
};

window.closeCommentModal = function () {
    const modal = document.getElementById("commentModal");

    if (modal) {
        modal.style.display = "none";
    }
};

window.updateAdminCommentStatus = async function (
    commentId,
    status
) {
    const statusLabels = {
        published: "通过或恢复",
        hidden: "隐藏",
        deleted: "删除"
    };

    const actionLabel = statusLabels[status] || "更新";

    const confirmed = confirm(
        `确定要${actionLabel}评论 ID ${commentId} 吗？`
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `${ADMIN_COMMENTS_API}/${commentId}/status`,
            {
                method: "PATCH",
                headers: getAdminAuthHeaders(true),
                body: JSON.stringify({ status })
            }
        );

        const result = await response.json();
        if (handleAdminUnauthorized(response, result)) {
            return;
        }

        if (!response.ok || !result.success) {
            throw new Error(result.message || "评论状态更新失败");
        }

        await loadAdminComments();
        alert(result.message || "评论状态更新成功。");
    } catch (error) {
        console.error("Update comment status error:", error);
        alert(error.message || "评论状态更新失败。");
    }
};

window.deleteAdminComment = async function (commentId) {
    const confirmed = confirm(
        `确定要删除评论 ID ${commentId} 吗？`
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `${ADMIN_COMMENTS_API}/${commentId}`,
            {
                method: "DELETE",
                headers: getAdminAuthHeaders()
            }
        );

        const result = await response.json();

        if (handleAdminUnauthorized(response, result)) {
            return;
        }

        if (!response.ok || !result.success) {
            throw new Error(result.message || "评论删除失败");
        }

        await loadAdminComments();
        alert(result.message || "评论已删除。");
    } catch (error) {
        console.error("Delete comment error:", error);
        alert(error.message || "评论删除失败。");
    }
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}