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
window.insertSelectedNewsImage = function (event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("请选择图片文件");
    return;
  }

  const editor = document.getElementById("newNewsContent");

  if (!editor) {
    alert("找不到新闻正文编辑器 newNewsContent");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    editor.focus();

    const imageHtml = `
      <p>
        <img src="${e.target.result}" alt="新闻图片" />
      </p>
    `;

    document.execCommand("insertHTML", false, imageHtml);
  };

  reader.readAsDataURL(file);

  event.target.value = "";
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

  reader.readAsDataURL(file);

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