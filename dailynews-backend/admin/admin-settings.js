const SITE_LOGO_API = "/api/site-settings/logo";

function getAdminToken() {
    return localStorage.getItem("adminToken") || "";
}

function getAdminHeaders() {
    const token = getAdminToken();

    return {
        Authorization: `Bearer ${token}`
    };
}

function showLogoMessage(message, type = "") {
    const messageBox = document.getElementById("siteLogoMessage");

    if (!messageBox) {
        return;
    }

    messageBox.textContent = message;
    messageBox.className = "logo-management-message";

    if (type) {
        messageBox.classList.add(`logo-message-${type}`);
    }
}

function updateLogoPreview(logoUrl) {
    const imagePreview = document.getElementById("siteLogoPreview");
    const defaultPreview = document.getElementById(
        "siteLogoDefaultPreview"
    );

    if (!imagePreview || !defaultPreview) {
        return;
    }

    if (logoUrl) {
        const previewSource = logoUrl.startsWith("blob:")
            ? logoUrl
            : `${logoUrl}?v=${Date.now()}`;

        imagePreview.src = previewSource;
        imagePreview.hidden = false;
        defaultPreview.hidden = true;
        return;
    }

    imagePreview.removeAttribute("src");
    imagePreview.hidden = true;
    defaultPreview.hidden = false;
}

async function loadCurrentLogo() {
    try {
        const response = await fetch(SITE_LOGO_API, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "读取当前 LOGO 失败。"
            );
        }

        updateLogoPreview(result.logoUrl || null);
    } catch (error) {
        console.error("Load current logo error:", error);
        showLogoMessage(
            error.message || "读取当前 LOGO 失败。",
            "error"
        );
    }
}

async function uploadSiteLogo() {
    const fileInput = document.getElementById("siteLogoInput");
    const uploadButton = document.getElementById(
        "uploadSiteLogoBtn"
    );

    if (!fileInput || !uploadButton) {
        return;
    }

    const file = fileInput.files?.[0];

    if (!file) {
        showLogoMessage("请先选择 LOGO 图片。", "error");
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showLogoMessage("LOGO 图片不能超过 2MB。", "error");
        return;
    }

    const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        showLogoMessage(
            "只允许上传 PNG、JPG、JPEG 或 WebP 图片。",
            "error"
        );
        return;
    }

    const token = getAdminToken();

    if (!token) {
        showLogoMessage(
            "管理员登录已失效，请重新登录。",
            "error"
        );
        return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    uploadButton.disabled = true;
    uploadButton.textContent = "正在上传…";
    showLogoMessage("正在上传 LOGO…");

    try {
        const response = await fetch(SITE_LOGO_API, {
            method: "POST",
            headers: getAdminHeaders(),
            body: formData
        });

        const result = await response.json();

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            localStorage.removeItem("adminToken");
            localStorage.removeItem("adminUser");
            localStorage.removeItem("adminLoggedIn");

            throw new Error(
                result.message || "管理员登录已失效，请重新登录。"
            );
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "上传 LOGO 失败。"
            );
        }

        updateLogoPreview(result.logoUrl);
        fileInput.value = "";

        const fileNameBox = document.getElementById(
            "siteLogoFileName"
        );

        if (fileNameBox) {
            fileNameBox.textContent = "尚未选择图片";
        }

        showLogoMessage(
            result.message || "网站 LOGO 上传成功。",
            "success"
        );
    } catch (error) {
        console.error("Upload site logo error:", error);

        showLogoMessage(
            error.message || "上传 LOGO 失败。",
            "error"
        );
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = "上传并应用";
    }
}

async function resetSiteLogo() {
    const resetButton = document.getElementById(
        "resetSiteLogoBtn"
    );

    if (!resetButton) {
        return;
    }

    const token = getAdminToken();

    if (!token) {
        showLogoMessage(
            "管理员登录已失效，请重新登录。",
            "error"
        );
        return;
    }

    const confirmed = window.confirm(
        "确定恢复默认 LOGO 吗？当前上传的 LOGO 文件将被删除。"
    );

    if (!confirmed) {
        return;
    }

    resetButton.disabled = true;
    resetButton.textContent = "正在恢复…";
    showLogoMessage("正在恢复默认 LOGO…");

    try {
        const response = await fetch(SITE_LOGO_API, {
            method: "DELETE",
            headers: {
                ...getAdminHeaders(),
                Accept: "application/json"
            }
        });

        const result = await response.json();

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            localStorage.removeItem("adminToken");
            localStorage.removeItem("adminUser");
            localStorage.removeItem("adminLoggedIn");

            throw new Error(
                result.message || "管理员登录已失效，请重新登录。"
            );
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "恢复默认 LOGO 失败。"
            );
        }

        updateLogoPreview(null);

        showLogoMessage(
            result.message || "已经恢复默认 LOGO。",
            "success"
        );
    } catch (error) {
        console.error("Reset site logo error:", error);

        showLogoMessage(
            error.message || "恢复默认 LOGO 失败。",
            "error"
        );
    } finally {
        resetButton.disabled = false;
        resetButton.textContent = "恢复默认 LOGO";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("siteLogoInput");
    const uploadButton = document.getElementById(
        "uploadSiteLogoBtn"
    );
    const resetButton = document.getElementById(
        "resetSiteLogoBtn"
    );
    const fileNameBox = document.getElementById(
        "siteLogoFileName"
    );

    if (fileInput && fileNameBox) {
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];

            fileNameBox.textContent = file
                ? file.name
                : "尚未选择图片";

            if (file) {
                const previewUrl = URL.createObjectURL(file);
                updateLogoPreview(previewUrl);
            }
        });
    }

    if (uploadButton) {
        uploadButton.addEventListener(
            "click",
            uploadSiteLogo
        );
    }

    if (resetButton) {
        resetButton.addEventListener(
            "click",
            resetSiteLogo
        );
    }

    loadCurrentLogo();
});