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
// ===============================
// 用户管理：封号 / 解封，直接修改表格显示
// ===============================
function banUser(username, buttonElement) {
  const confirmBan = confirm("确定要封禁用户：" + username + " 吗？");

  if (!confirmBan) {
    return;
  }

  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  // 修改行状态
  row.setAttribute("data-status", "banned");

  // 修改会员状态这一列
  const statusCell = row.children[3];
  statusCell.innerHTML = '<span class="status banned">已封禁</span>';

  // 修改操作按钮
  const actionCell = row.children[6];
  actionCell.innerHTML = `
    <button class="table-btn" onclick="viewUserFromRow(this)">查看</button>
    <button class="table-btn success" onclick="unbanUser('${username}', this)">解封</button>
  `;

  alert("用户 " + username + " 已封禁！");
}


function unbanUser(username, buttonElement) {
  const confirmUnban = confirm("确定要解封用户：" + username + " 吗？");

  if (!confirmUnban) {
    return;
  }

  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  // 修改行状态
  row.setAttribute("data-status", "normal");

  // 修改会员状态这一列
  const statusCell = row.children[3];
  statusCell.innerHTML = '<span class="status normal">普通用户</span>';

  // 修改操作按钮
  const actionCell = row.children[6];
  actionCell.innerHTML = `
    <button class="table-btn" onclick="viewUserFromRow(this)">查看</button>
    <button class="table-btn danger" onclick="banUser('${username}', this)">封号</button>
  `;

  alert("用户 " + username + " 已解封！");
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
  const usernameInput = document.getElementById("newUsername");
  const emailInput = document.getElementById("newUserEmail");
  const statusInput = document.getElementById("newUserStatus");
  const table = document.getElementById("usersTable");

  if (!usernameInput || !emailInput || !statusInput || !table) {
    return;
  }

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const status = statusInput.value;

  if (!username || !email) {
    alert("请填写用户名和邮箱");
    return;
  }

  const tbody = table.querySelector("tbody");

  const userId = "10" + (tbody.rows.length + 1).toString().padStart(2, "0");
  const today = new Date().toISOString().slice(0, 10);

  let statusClass = "normal";
  let dataStatus = "normal";
  let actionButton = "";

  if (status === "VIP") {
    statusClass = "vip";
    dataStatus = "vip";
    actionButton = `<button class="table-btn danger" onclick="banUser('${username}', this)">封号</button>`;
  } else {
    statusClass = "normal";
    dataStatus = "normal";
    actionButton = `<button class="table-btn danger" onclick="banUser('${username}', this)">封号</button>`;
  }

  const newRow = document.createElement("tr");
  newRow.setAttribute("data-status", dataStatus);

  newRow.innerHTML = `
    <td>${userId}</td>
    <td>${username}</td>
    <td>${email}</td>
    <td><span class="status ${statusClass}">${status}</span></td>
    <td>$0.00</td>
    <td>${today}</td>
    <td>
      <button class="table-btn" onclick="viewUser('${userId}', '${username}', '${email}', '${status}', '$0.00', '${today}')">查看</button>
      ${actionButton}
    </td>
  `;

  tbody.appendChild(newRow);

  usernameInput.value = "";
  emailInput.value = "";
  statusInput.value = "普通用户";

  closeAddUserModal();

  alert("新用户已添加到用户列表！（当前为前端演示，刷新页面后不会永久保存）");
}
// ===============================
// 用户管理：从当前表格行查看用户详情
// ===============================
function viewUserFromRow(buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const id = row.children[0].innerText;
  const username = row.children[1].innerText;
  const email = row.children[2].innerText;
  const status = row.children[3].innerText;
  const balance = row.children[4].innerText;
  const registerTime = row.children[5].innerText;

  viewUser(id, username, email, status, balance, registerTime);
}
// ===============================
// 评论管理：搜索和筛选
// ===============================
window.filterComments = function () {
  const searchInput = document.getElementById("commentSearchInput");
  const statusFilter = document.getElementById("commentStatusFilter");
  const table = document.getElementById("commentsTable");

  if (!searchInput || !statusFilter || !table) {
    return;
  }

  const keyword = searchInput.value.toLowerCase().trim();
  const selectedStatus = statusFilter.value;
  const rows = table.querySelectorAll("tbody tr");

  rows.forEach(function (row) {
    const rowText = row.innerText.toLowerCase();
    const rowStatus = row.getAttribute("data-status");

    const matchKeyword = rowText.includes(keyword);
    const matchStatus = selectedStatus === "all" || rowStatus === selectedStatus;

    row.style.display = matchKeyword && matchStatus ? "" : "none";
  });
};


// ===============================
// 评论管理：查看评论详情
// ===============================
window.viewCommentFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const commentId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const newsTitle = row.children[2].innerText;
  const commentContent = row.children[3].innerText;
  const status = row.children[4].innerText;
  const commentTime = row.children[5].innerText;

  const modal = document.getElementById("commentModal");
  const content = document.getElementById("commentModalContent");

  if (!modal || !content) {
    alert("评论详情弹窗代码缺失，请检查 commentModal 是否存在");
    return;
  }

  content.innerHTML = `
    <p><strong>评论ID：</strong>${commentId}</p>
    <p><strong>用户：</strong>${username}</p>
    <p><strong>新闻标题：</strong>${newsTitle}</p>
    <p><strong>评论内容：</strong>${commentContent}</p>
    <p><strong>状态：</strong>${status}</p>
    <p><strong>评论时间：</strong>${commentTime}</p>
  `;

  modal.style.display = "flex";
};


window.closeCommentModal = function () {
  const modal = document.getElementById("commentModal");

  if (modal) {
    modal.style.display = "none";
  }
};


// ===============================
// 评论管理：通过评论
// ===============================
window.approveComment = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const confirmApprove = confirm("确定要通过这条评论吗？");

  if (!confirmApprove) {
    return;
  }

  row.setAttribute("data-status", "approved");

  row.children[4].innerHTML = '<span class="status vip">已通过</span>';

  row.children[6].innerHTML = `
    <button class="table-btn" onclick="viewCommentFromRow(this)">查看</button>
    <button class="table-btn danger" onclick="deleteComment(this)">删除</button>
  `;

  alert("评论已通过！");
};


// ===============================
// 评论管理：拒绝评论
// ===============================
window.rejectComment = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const confirmReject = confirm("确定要拒绝这条评论吗？");

  if (!confirmReject) {
    return;
  }

  row.setAttribute("data-status", "violation");

  row.children[4].innerHTML = '<span class="status banned">已拒绝</span>';

  row.children[6].innerHTML = `
    <button class="table-btn" onclick="viewCommentFromRow(this)">查看</button>
    <button class="table-btn danger" onclick="deleteComment(this)">删除</button>
  `;

  alert("评论已拒绝！");
};


// ===============================
// 评论管理：删除评论
// ===============================
window.deleteComment = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const confirmDelete = confirm("确定要删除这条评论吗？");

  if (!confirmDelete) {
    return;
  }

  row.remove();

  alert("评论已删除！");
};
// ===============================
// 钱包管理：搜索和筛选
// ===============================
window.filterWalletRecords = function () {
  const searchInput = document.getElementById("walletSearchInput");
  const statusFilter = document.getElementById("walletStatusFilter");
  const table = document.getElementById("walletTable");

  if (!searchInput || !statusFilter || !table) {
    return;
  }

  const keyword = searchInput.value.toLowerCase().trim();
  const selectedStatus = statusFilter.value;
  const rows = table.querySelectorAll("tbody tr");

  rows.forEach(function (row) {
    const rowText = row.innerText.toLowerCase();
    const rowStatus = row.getAttribute("data-status");

    const matchKeyword = rowText.includes(keyword);
    const matchStatus = selectedStatus === "all" || rowStatus === selectedStatus;

    row.style.display = matchKeyword && matchStatus ? "" : "none";
  });
};


// ===============================
// 钱包管理：查看充值订单详情
// ===============================
window.viewWalletRecordFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const orderId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const amount = row.children[2].innerText;
  const paymentMethod = row.children[3].innerText;
  const status = row.children[4].innerText;
  const rechargeTime = row.children[5].innerText;

  const modal = document.getElementById("walletModal");
  const content = document.getElementById("walletModalContent");

  if (!modal || !content) {
    alert("充值订单详情弹窗代码缺失，请检查 walletModal 是否存在");
    return;
  }

  content.innerHTML = `
    <p><strong>订单号：</strong>${orderId}</p>
    <p><strong>用户：</strong>${username}</p>
    <p><strong>充值金额：</strong>${amount}</p>
    <p><strong>支付方式：</strong>${paymentMethod}</p>
    <p><strong>状态：</strong>${status}</p>
    <p><strong>充值时间：</strong>${rechargeTime}</p>
    <p><strong>说明：</strong>当前为前端演示数据，后期接入数据库和真实支付订单。</p>
  `;

  modal.style.display = "flex";
};


// ===============================
// 钱包管理：关闭详情弹窗
// ===============================
window.closeWalletModal = function () {
  const modal = document.getElementById("walletModal");

  if (modal) {
    modal.style.display = "none";
  }
};


// ===============================
// 钱包管理：确认充值
// ===============================
window.confirmWalletRecord = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const orderId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const amount = row.children[2].innerText;

  const confirmPay = confirm(
    "确定要确认这笔充值吗？\n\n订单号：" +
      orderId +
      "\n用户：" +
      username +
      "\n金额：" +
      amount
  );

  if (!confirmPay) {
    return;
  }

  row.setAttribute("data-status", "success");

  const statusCell = row.children[4];
  statusCell.innerHTML = '<span class="status vip">成功</span>';

  const actionCell = row.children[6];
  actionCell.innerHTML = `
    <button class="table-btn" onclick="viewWalletRecordFromRow(this)">查看</button>
  `;

  alert("充值订单已确认成功！");
};


// ===============================
// 钱包管理：导出记录
// ===============================
window.exportWalletRecords = function () {
  alert("充值记录导出成功！（当前为前端演示，后期可导出 CSV / Excel）");
};