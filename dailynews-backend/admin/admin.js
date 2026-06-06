// ===============================
// 后台登录保护
// ===============================
(function checkAdminAuth() {
  const isLoggedIn = localStorage.getItem("adminLoggedIn");
  const currentPage = window.location.pathname.split("/").pop();

  // 登录页不需要检查
  if (currentPage === "admin-login.html") {
    return;
  }

  // 其他后台页面，如果没有登录，跳回登录页
  if (isLoggedIn !== "true") {
    window.location.href = "./admin-login.html";
  }
})();


// ===============================
// 管理员登录
// ===============================
function adminLogin() {
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const loginMsg = document.getElementById("loginMsg");

  if (!usernameInput || !passwordInput || !loginMsg) {
    return;
  }

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  const adminUser = "admin";
  const adminPass = "123456";

  if (username === adminUser && password === adminPass) {
    localStorage.setItem("adminLoggedIn", "true");
    window.location.href = "./admin.html";
  } else {
    loginMsg.innerText = "账号或密码错误，请重新输入";
  }
}


// ===============================
// 管理员退出登录
// ===============================
function adminLogout() {
  localStorage.removeItem("adminLoggedIn");
  window.location.href = "./admin-login.html";
}
function saveSettings() {
  alert("系统设置已保存！（当前为前端演示，后期接入数据库）");
}
// ===============================
// 渲染后台公共左侧菜单
// ===============================
function renderAdminSidebar() {
  const sidebar = document.getElementById("adminSidebar");

  if (!sidebar) {
    return;
  }

  const currentPage = window.location.pathname.split("/").pop();

  const menuItems = [
    { name: "后台首页", link: "admin.html" },
    { name: "用户管理", link: "admin-users.html" },
    { name: "钱包管理", link: "admin-wallet.html" },
    { name: "订阅管理", link: "admin-subscriptions.html" },
    { name: "提现管理", link: "admin-withdrawals.html" },
    { name: "API管理", link: "admin-api.html" },
    { name: "新闻管理", link: "admin-news.html" },
    { name: "系统设置", link: "admin-settings.html" },
    { name: "操作日志", link: "admin-logs.html" }
    { name: "评论管理", link: "admin-comments.html" }
  ];

  let menuHtml = `
    <h2>Daily News</h2>
    <p>后台管理系统</p>
    <nav>
  `;

  menuItems.forEach(item => {
    const activeClass = currentPage === item.link ? "active" : "";
    menuHtml += `<a href="${item.link}" class="${activeClass}">${item.name}</a>`;
  });

  menuHtml += `
    </nav>
    <button class="logout-btn" onclick="adminLogout()">退出登录</button>
  `;

  sidebar.innerHTML = menuHtml;
}

// 页面加载后自动生成左侧菜单
document.addEventListener("DOMContentLoaded", renderAdminSidebar);