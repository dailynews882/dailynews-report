const messageBox = document.getElementById("messageBox");
const articleBox = document.getElementById("articleBox");

document.addEventListener("DOMContentLoaded", () => {
    loadNewsDetail();
});

async function loadNewsDetail() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
        showMessage("新闻ID不存在，无法加载新闻详情。");
        return;
    }

    const token = localStorage.getItem("token") || "";

    try {
        const response = await fetch(`/api/news/public/${encodeURIComponent(id)}`, {
            method: "GET",
            headers: token
                ? {
                    Authorization: `Bearer ${token}`
                }
                : {}
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showArticle(result.data);
            return;
        }

        if (result.code === "LOGIN_REQUIRED") {
            showLockedArticle(result.data, "请先登录", result.message, "login");
            return;
        }

        if (result.code === "VIP_REQUIRED") {
            showLockedArticle(result.data, "VIP专享内容", result.message, "vip");
            return;
        }

        showMessage(result.message || "新闻详情加载失败。");
    } catch (error) {
        console.error("Load news detail error:", error);
        showMessage("新闻详情加载失败，请检查服务器是否正常运行。");
    }
}

function showArticle(news) {
    if (!news) {
        showMessage("新闻内容不存在。");
        return;
    }

    messageBox.style.display = "none";

    const vipTag = Number(news.is_vip) === 1
        ? '<span class="vip-tag">VIP专享</span>'
        : "";

    const imageHtml = news.image_url
        ? `<img class="cover" src="${escapeHtml(news.image_url)}" alt="${escapeHtml(news.title || "新闻图片")}" onerror="this.style.display='none';" />`
        : "";

    articleBox.innerHTML = `
    <article class="article">
      <div class="tag-row">
        <span class="category">${escapeHtml(news.category || "general")}</span>
        ${vipTag}
      </div>

      <h1>${escapeHtml(news.title || "未命名新闻")}</h1>

      <div class="meta">
        来源：${escapeHtml(news.source || "DailyNews")}<br>
        作者：${escapeHtml(news.author || "DailyNews Admin")}<br>
        发布时间：${escapeHtml(formatDate(news.created_at))}<br>
        阅读量：${escapeHtml(news.views || 0)}
      </div>

      ${imageHtml}

      ${news.summary
            ? `<div class="summary">${escapeHtml(news.summary)}</div>`
            : ""
        }

        <div class="content">${sanitizeNewsContent(news.content || "")}</div>
    </article>
  `;
}

function showLockedArticle(news, title, text, type) {
    messageBox.style.display = "none";

    const preview = news
        ? `
      <article class="article" style="margin-bottom: 22px;">
        <div class="tag-row">
          <span class="category">${escapeHtml(news.category || "general")}</span>
          <span class="vip-tag">VIP专享</span>
        </div>
        <h1>${escapeHtml(news.title || "VIP新闻")}</h1>
        ${news.summary
            ? `<div class="summary">${escapeHtml(news.summary)}</div>`
            : ""
        }
      </article>
    `
        : "";

    const actionHtml = type === "login"
        ? `
      <div class="action-row">
        <a class="primary-btn" href="/index.html">返回首页登录</a>
        <a class="secondary-btn" href="/subscribe.html">查看VIP订阅</a>
      </div>
    `
        : `
      <div class="action-row">
        <a class="secondary-btn" href="/subscribe.html">升级VIP会员</a>
        <a class="primary-btn" href="/index.html">返回首页</a>
      </div>
    `;

    articleBox.innerHTML = `
    ${preview}
    <section class="lock-box">
      <div class="lock-title">${escapeHtml(title)}</div>
      <div class="lock-text">${escapeHtml(text || "该内容需要VIP会员权限。")}</div>
      ${actionHtml}
    </section>
  `;
}

function showMessage(text) {
    messageBox.style.display = "block";
    messageBox.innerText = text;
    articleBox.innerHTML = "";
}

function sanitizeNewsContent(html) {
    const template =
        document.createElement("template");

    template.innerHTML =
        String(html || "");

    const allowedTags =
        new Set([
            "P",
            "BR",
            "DIV",
            "SPAN",
            "STRONG",
            "B",
            "EM",
            "I",
            "U",
            "H2",
            "H3",
            "H4",
            "UL",
            "OL",
            "LI",
            "BLOCKQUOTE",
            "A",
            "IMG",
            "VIDEO",
            "SOURCE",
        ]);

    const allowedAttributes = {
        A: new Set([
            "href",
            "target",
            "rel",
        ]),

        IMG: new Set([
            "src",
            "alt",
            "title",
            "width",
            "height",
            "loading",
        ]),

        VIDEO: new Set([
            "src",
            "controls",
            "poster",
            "preload",
        ]),

        SOURCE: new Set([
            "src",
            "type",
        ]),

        SPAN: new Set([]),
        DIV: new Set([]),
        P: new Set([]),
    };

    const elements =
        Array.from(
            template.content.querySelectorAll(
                "*"
            )
        );

    elements.forEach(
        function (element) {
            if (
                !allowedTags.has(
                    element.tagName
                )
            ) {
                element.replaceWith(
                    document.createTextNode(
                        element.textContent || ""
                    )
                );

                return;
            }

            const tagAttributes =
                allowedAttributes[
                element.tagName
                ] || new Set();

            Array.from(
                element.attributes
            ).forEach(
                function (attribute) {
                    const attributeName =
                        attribute.name
                            .toLowerCase();

                    if (
                        attributeName.startsWith(
                            "on"
                        ) ||
                        attributeName ===
                        "style" ||
                        !tagAttributes.has(
                            attributeName
                        )
                    ) {
                        element.removeAttribute(
                            attribute.name
                        );
                    }
                }
            );

            if (
                element.tagName === "A"
            ) {
                const href =
                    element.getAttribute(
                        "href"
                    ) || "";

                if (
                    !isSafeNewsUrl(href)
                ) {
                    element.removeAttribute(
                        "href"
                    );
                } else {
                    element.setAttribute(
                        "target",
                        "_blank"
                    );

                    element.setAttribute(
                        "rel",
                        "noopener noreferrer"
                    );
                }
            }

            if (
                element.tagName === "IMG"
            ) {
                const src =
                    element.getAttribute(
                        "src"
                    ) || "";

                if (
                    !isSafeNewsUrl(src)
                ) {
                    element.remove();
                    return;
                }

                element.setAttribute(
                    "loading",
                    "lazy"
                );
            }

            if (
                element.tagName ===
                "VIDEO" ||
                element.tagName ===
                "SOURCE"
            ) {
                const src =
                    element.getAttribute(
                        "src"
                    ) || "";

                if (
                    src &&
                    !isSafeNewsUrl(src)
                ) {
                    element.removeAttribute(
                        "src"
                    );
                }
            }
        }
    );

    return template.innerHTML;
}

function isSafeNewsUrl(url) {
    const value =
        String(url || "")
            .trim()
            .toLowerCase();

    return (
        value.startsWith("/") ||
        value.startsWith(
            "https://"
        ) ||
        value.startsWith(
            "http://"
        )
    );
}

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    if (!value) {
        return "";
    }

    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (error) {
        return value;
    }
}