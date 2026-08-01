// ===============================
// 新闻富文本编辑器独立功能
// 本地图片 / 视频文件选择版
// ===============================

window.formatNewsContent = function (command, value = null) {
  const editor = document.getElementById("newNewsContent");

  if (!editor) {
    alert("找不到新闻正文编辑器 newNewsContent");
    return;
  }

  editor.focus();
  document.execCommand(command, false, value);
};


// ===============================
// 选择本地图片
// ===============================
window.selectNewsImageFile = function () {
  const fileInput = document.getElementById("newsImageFileInput");

  if (!fileInput) {
    alert("找不到图片文件选择框 newsImageFileInput");
    return;
  }

  fileInput.click();
};


// ===============================
// 插入本地图片到编辑器
// ===============================
window.insertSelectedNewsImage =
  async function (event) {
    const file =
      event.target.files[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      alert(
        "请选择图片文件。"
      );

      event.target.value = "";

      return;
    }

    const maximumFileSize =
      5 * 1024 * 1024;

    if (
      file.size >
      maximumFileSize
    ) {
      alert(
        "新闻图片不能超过5MB。"
      );

      event.target.value = "";

      return;
    }

    const editor =
      document.getElementById(
        "newNewsContent"
      );

    if (!editor) {
      alert(
        "找不到新闻正文编辑器 newNewsContent。"
      );

      event.target.value = "";

      return;
    }

    const adminToken =
      localStorage.getItem(
        "adminToken"
      );

    if (!adminToken) {
      alert(
        "管理员登录已失效，请重新登录。"
      );

      window.location.href =
        "/admin/admin.html";

      return;
    }

    const formData =
      new FormData();

    formData.append(
      "image",
      file
    );

    const originalCursor =
      document.body.style.cursor;

    document.body.style.cursor =
      "wait";

    try {
      const response =
        await fetch(
          "/api/admin/news-upload/image",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${adminToken}`,
            },

            body:
              formData,
          }
        );

      let result = null;

      try {
        result =
          await response.json();
      } catch (parseError) {
        result = null;
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        localStorage.removeItem(
          "adminToken"
        );

        alert(
          result?.message ||
          "管理员登录已过期，请重新登录。"
        );

        window.location.href =
          "/admin/admin.html";

        return;
      }

      if (!response.ok) {
        throw new Error(
          result?.message ||
          `图片上传失败，状态码：${response.status}`
        );
      }

      const imageUrl =
        result?.data?.imageUrl;

      if (!imageUrl) {
        throw new Error(
          "服务器没有返回图片地址。"
        );
      }

      editor.focus();

      const imageHtml = `
        <p>
          <img
            src="${imageUrl}"
            alt="新闻图片"
            style="max-width:100%;height:auto;border-radius:10px;"
          />
        </p>
      `;

      document.execCommand(
        "insertHTML",
        false,
        imageHtml
      );

      alert(
        "新闻图片上传并插入成功。"
      );
    } catch (error) {
      console.error(
        "Upload news image error:",
        error
      );

      alert(
        error.message ||
        "新闻图片上传失败，请稍后重试。"
      );
    } finally {
      document.body.style.cursor =
        originalCursor;

      event.target.value = "";
    }
  };

// ===============================
// 选择本地视频
// ===============================
window.selectNewsVideoFile = function () {
  const fileInput = document.getElementById("newsVideoFileInput");

  if (!fileInput) {
    alert("找不到视频文件选择框 newsVideoFileInput");
    return;
  }

  fileInput.click();
};


// ===============================
// 插入本地视频到编辑器
// ===============================
window.insertSelectedNewsVideo = function (event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("video/")) {
    alert("请选择视频文件");
    return;
  }

  const editor = document.getElementById("newNewsContent");

  if (!editor) {
    alert("找不到新闻正文编辑器 newNewsContent");
    return;
  }

  // 前端演示建议限制视频大小，避免浏览器卡死
  const maxSizeMB = 50;
  const fileSizeMB = file.size / 1024 / 1024;

  if (fileSizeMB > maxSizeMB) {
    alert("视频文件太大，当前前端演示版建议小于 50MB。正式上线后应上传到服务器或云存储。");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    editor.focus();

    const videoHtml = `
      <p>
        <video controls style="width:100%; max-height:420px; border-radius:10px; margin:12px 0;">
          <source src="${e.target.result}" type="${file.type}">
          当前浏览器不支持视频播放。
        </video>
      </p>
    `;

    document.execCommand("insertHTML", false, videoHtml);
  };

  event.target.value = "";
};


// ===============================
// 插入链接
// ===============================
window.insertNewsLink = function () {
  const linkUrl = prompt("请输入链接地址：\n例如：https://example.com");

  if (!linkUrl) {
    return;
  }

  const linkText = prompt("请输入链接文字：") || linkUrl;

  const editor = document.getElementById("newNewsContent");

  if (!editor) {
    alert("找不到新闻正文编辑器 newNewsContent");
    return;
  }

  editor.focus();

  const linkHtml = `<a href="${linkUrl}" target="_blank">${linkText}</a>`;

  document.execCommand("insertHTML", false, linkHtml);
};