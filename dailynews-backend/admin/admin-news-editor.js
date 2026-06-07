// ===============================
// 新闻富文本编辑器独立功能
// 不影响 admin.js 主功能
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

window.insertNewsImage = function () {
  const imageUrl = prompt("请输入图片地址 URL：\n例如：https://example.com/news-image.jpg");

  if (!imageUrl) {
    return;
  }

  const editor = document.getElementById("newNewsContent");

  if (!editor) {
    alert("找不到新闻正文编辑器 newNewsContent");
    return;
  }

  editor.focus();

  const imageHtml = `
    <p>
      <img src="${imageUrl}" alt="新闻图片" />
    </p>
  `;

  document.execCommand("insertHTML", false, imageHtml);
};

window.insertNewsVideo = function () {
  const videoUrl = prompt(
    "请输入视频嵌入地址：\n例如：https://www.youtube.com/embed/xxxx\n注意：普通 YouTube 分享链接需要改成 embed 格式。"
  );

  if (!videoUrl) {
    return;
  }

  const editor = document.getElementById("newNewsContent");

  if (!editor) {
    alert("找不到新闻正文编辑器 newNewsContent");
    return;
  }

  editor.focus();

  const videoHtml = `
    <p>
      <iframe src="${videoUrl}" allowfullscreen></iframe>
    </p>
  `;

  document.execCommand("insertHTML", false, videoHtml);
};

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