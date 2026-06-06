// ===============================
// 后台登录保护
// ===============================
(function checkAdminAuth() {
  const isLoggedIn = localStorage.getItem("adminLoggedIn");
  const currentPage = window.location.pathname.split("/").pop();

  if (currentPage === "admin-login.html") {
    return;
  }

  if (isLoggedIn !== "true") {
    window.location.href = "./admin-login.html";
  }
})();


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
    { name: "操作日志", link: "admin-logs.html" },
    { name: "评论管理", link: "admin-comments.html" }
  ];

  let menuHtml = `
    <h2>Daily News</h2>
    <p>后台管理系统</p>
    <nav>
  `;

  menuItems.forEach(function(item) {
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
document.addEventListener("DOMContentLoaded", function() {
  renderAdminSidebar();
});


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


// ===============================
// 保存系统设置提示
// ===============================
function saveSettings() {
  alert("系统设置已保存！（当前为前端演示，后期接入数据库）");
}
// ===============================
// 用户管理：搜索和筛选
// ===============================
function filterUsers() {
  const searchInput = document.getElementById("userSearchInput");
  const statusFilter = document.getElementById("userStatusFilter");
  const table = document.getElementById("usersTable");

  if (!searchInput || !statusFilter || !table) {
    return;
  }

  const keyword = searchInput.value.toLowerCase().trim();
  const selectedStatus = statusFilter.value;
  const rows = table.querySelectorAll("tbody tr");

  rows.forEach(function(row) {
    const rowText = row.innerText.toLowerCase();
    const rowStatus = row.getAttribute("data-status");

    const matchKeyword = rowText.includes(keyword);
    const matchStatus = selectedStatus === "all" || rowStatus === selectedStatus;

    row.style.display = matchKeyword && matchStatus ? "" : "none";
  });
}


// ===============================
// 用户管理：查看用户详情
// ===============================
function viewUser(id, username, email, status, balance, registerTime) {
  const modal = document.getElementById("userModal");
  const content = document.getElementById("userModalContent");

  if (!modal || !content) {
    return;
  }

  content.innerHTML = `
    <p><strong>用户ID：</strong>${id}</p>
    <p><strong>用户名：</strong>${username}</p>
    <p><strong>邮箱：</strong>${email}</p>
    <p><strong>会员状态：</strong>${status}</p>
    <p><strong>钱包余额：</strong>${balance}</p>
    <p><strong>注册时间：</strong>${registerTime}</p>
  `;

  modal.style.display = "flex";
}

function closeUserModal() {
  const modal = document.getElementById("userModal");

  if (modal) {
    modal.style.display = "none";
  }
}


// ===============================
// 用户管理：封号 / 解封
// ===============================
function banUser(username) {
  const confirmBan = confirm("确定要封禁用户：" + username + " 吗？");

  if (confirmBan) {
    alert("用户 " + username + " 已封禁！（当前为前端演示）");
  }
}

function unbanUser(username) {
  const confirmUnban = confirm("确定要解封用户：" + username + " 吗？");

  if (confirmUnban) {
    alert("用户 " + username + " 已解封！（当前为前端演示）");
  }
}


// ===============================
// 用户管理：添加用户弹窗
// ===============================
function openAddUserModal() {
  const modal = document.getElementById("addUserModal");

  if (modal) {
    modal.style.display = "flex";
  }
}

function closeAddUserModal() {
  const modal = document.getElementById("addUserModal");

  if (modal) {
    modal.style.display = "none";
  }
}

function saveNewUser() {
  const username = document.getElementById("newUsername").value.trim();
  const email = document.getElementById("newUserEmail").value.trim();
  const status = document.getElementById("newUserStatus").value;

  if (!username || !email) {
    alert("请填写用户名和邮箱");
    return;
  }

  alert("新用户已保存！\n用户名：" + username + "\n邮箱：" + email + "\n状态：" + status + "\n\n当前为前端演示，后期接入数据库。");

  closeAddUserModal();
}