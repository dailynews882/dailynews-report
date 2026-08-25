// ===============================
// 后台公共菜单 + 登录保护
// ===============================

function renderAdminSidebar() {
  const sidebar = document.getElementById("adminSidebar");

  if (!sidebar) {
    return;
  }

  const currentPage =
    window.location.pathname.split("/").pop();

  const menuItems = [
    { name: "后台首页", link: "admin.html" },
    { name: "用户管理", link: "admin-users.html" },
    { name: "钱包管理", link: "admin-wallet.html" },
    { name: "订阅管理", link: "admin-subscriptions.html" },
    { name: "提现管理", link: "admin-withdrawals.html" },
    { name: "API管理", link: "admin-api.html" },
    { name: "新闻管理", link: "admin-news.html" },
    { name: "商城管理", link: "admin-store.html" },
    { name: "广告管理", link: "admin-ads.html" },
    { name: "彩票管理", link: "admin-lottery.html" },
    { name: "系统设置", link: "admin-settings.html" },
    { name: "操作日志", link: "admin-logs.html" },
    { name: "评论管理", link: "admin-comments.html" }
  ];

  let menuHtml = `
    <h2>Daily News</h2>
    <p>后台管理系统</p>
    <nav>
  `;

  menuItems.forEach(function (item) {
    const activeClass =
      currentPage === item.link
        ? "active"
        : "";

    menuHtml += `
      <a
        href="${item.link}"
        class="${activeClass}"
      >
        ${item.name}
      </a>
    `;
  });

  menuHtml += `
    </nav>
    <button
      class="logout-btn"
      onclick="adminLogout()"
    >
      退出登录
    </button>
  `;

  sidebar.innerHTML = menuHtml;
}

window.adminLogout = function () {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  localStorage.removeItem("adminLoggedIn");

  window.location.href =
    "./admin-login.html";
};

document.addEventListener(
  "DOMContentLoaded",
  function () {
    renderAdminSidebar();
  }
);