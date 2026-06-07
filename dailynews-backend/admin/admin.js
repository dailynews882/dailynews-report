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
// ===============================
// 订阅管理：搜索和筛选
// ===============================
window.filterSubscriptionRecords = function () {
  const searchInput = document.getElementById("subscriptionSearchInput");
  const statusFilter = document.getElementById("subscriptionStatusFilter");
  const table = document.getElementById("subscriptionTable");

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
// 订阅管理：查看订阅详情
// ===============================
window.viewSubscriptionFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const subscriptionId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const planType = row.children[2].innerText;
  const amount = row.children[3].innerText;
  const startTime = row.children[4].innerText;
  const endTime = row.children[5].innerText;
  const status = row.children[6].innerText;

  const modal = document.getElementById("subscriptionModal");
  const content = document.getElementById("subscriptionModalContent");

  if (!modal || !content) {
    alert("订阅详情弹窗代码缺失，请检查 subscriptionModal 是否存在");
    return;
  }

  content.innerHTML = `
    <p><strong>订阅ID：</strong>${subscriptionId}</p>
    <p><strong>用户：</strong>${username}</p>
    <p><strong>套餐类型：</strong>${planType}</p>
    <p><strong>支付金额：</strong>${amount}</p>
    <p><strong>开始时间：</strong>${startTime}</p>
    <p><strong>到期时间：</strong>${endTime}</p>
    <p><strong>状态：</strong>${status}</p>
    <p><strong>说明：</strong>当前为前端演示数据，后期接入数据库和真实订阅订单。</p>
  `;

  modal.style.display = "flex";
};


// ===============================
// 订阅管理：关闭详情弹窗
// ===============================
window.closeSubscriptionModal = function () {
  const modal = document.getElementById("subscriptionModal");

  if (modal) {
    modal.style.display = "none";
  }
};


// ===============================
// 订阅管理：取消订阅
// ===============================
window.cancelSubscription = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const subscriptionId = row.children[0].innerText;
  const username = row.children[1].innerText;

  const confirmCancel = confirm(
    "确定要取消这条订阅吗？\n\n订阅ID：" +
      subscriptionId +
      "\n用户：" +
      username
  );

  if (!confirmCancel) {
    return;
  }

  row.setAttribute("data-status", "cancelled");

  row.children[6].innerHTML = '<span class="status banned">已取消</span>';

  row.children[7].innerHTML = `
    <button class="table-btn" onclick="viewSubscriptionFromRow(this)">查看</button>
    <button class="table-btn success" onclick="renewSubscription(this)">重新开通</button>
  `;

  alert("订阅已取消！");
};


// ===============================
// 订阅管理：续费订阅
// ===============================
window.renewSubscription = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const subscriptionId = row.children[0].innerText;
  const username = row.children[1].innerText;

  const confirmRenew = confirm(
    "确定要为该用户续费吗？\n\n订阅ID：" +
      subscriptionId +
      "\n用户：" +
      username
  );

  if (!confirmRenew) {
    return;
  }

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);

  const endDateObj = new Date(today);
  endDateObj.setMonth(endDateObj.getMonth() + 1);
  const endDate = endDateObj.toISOString().slice(0, 10);

  row.setAttribute("data-status", "active");

  row.children[4].innerText = startDate;
  row.children[5].innerText = endDate;
  row.children[6].innerHTML = '<span class="status vip">生效中</span>';

  row.children[7].innerHTML = `
    <button class="table-btn" onclick="viewSubscriptionFromRow(this)">查看</button>
    <button class="table-btn danger" onclick="cancelSubscription(this)">取消</button>
  `;

  alert("订阅已续费并恢复为生效中！");
};


// ===============================
// 订阅管理：试用转正式
// ===============================
window.convertSubscription = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const subscriptionId = row.children[0].innerText;
  const username = row.children[1].innerText;

  const confirmConvert = confirm(
    "确定要将该试用会员转为正式会员吗？\n\n订阅ID：" +
      subscriptionId +
      "\n用户：" +
      username
  );

  if (!confirmConvert) {
    return;
  }

  row.setAttribute("data-status", "active");

  row.children[2].innerText = "高级AI正式会员";
  row.children[6].innerHTML = '<span class="status vip">生效中</span>';

  row.children[7].innerHTML = `
    <button class="table-btn" onclick="viewSubscriptionFromRow(this)">查看</button>
    <button class="table-btn danger" onclick="cancelSubscription(this)">取消</button>
  `;

  alert("试用会员已转为正式会员！");
};


// ===============================
// 订阅管理：导出记录
// ===============================
window.exportSubscriptionRecords = function () {
  alert("订阅记录导出成功！（当前为前端演示，后期可导出 CSV / Excel）");
};
// ===============================
// 提现管理：搜索和筛选
// ===============================
window.filterWithdrawalRecords = function () {
  const searchInput = document.getElementById("withdrawalSearchInput");
  const statusFilter = document.getElementById("withdrawalStatusFilter");
  const table = document.getElementById("withdrawalTable");

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
// 提现管理：查看提现详情
// ===============================
window.viewWithdrawalFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const withdrawalId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const amount = row.children[2].innerText;
  const method = row.children[3].innerText;
  const account = row.children[4].innerText;
  const applyTime = row.children[5].innerText;
  const status = row.children[6].innerText;

  const modal = document.getElementById("withdrawalModal");
  const content = document.getElementById("withdrawalModalContent");

  if (!modal || !content) {
    alert("提现详情弹窗代码缺失，请检查 withdrawalModal 是否存在");
    return;
  }

  content.innerHTML = `
    <p><strong>提现ID：</strong>${withdrawalId}</p>
    <p><strong>用户：</strong>${username}</p>
    <p><strong>提现金额：</strong>${amount}</p>
    <p><strong>提现方式：</strong>${method}</p>
    <p><strong>账户信息：</strong>${account}</p>
    <p><strong>申请时间：</strong>${applyTime}</p>
    <p><strong>状态：</strong>${status}</p>
    <p><strong>说明：</strong>当前为前端演示数据，后期接入真实钱包余额、提现审核和付款流水。</p>
  `;

  modal.style.display = "flex";
};


// ===============================
// 提现管理：关闭详情弹窗
// ===============================
window.closeWithdrawalModal = function () {
  const modal = document.getElementById("withdrawalModal");

  if (modal) {
    modal.style.display = "none";
  }
};


// ===============================
// 提现管理：批准提现
// ===============================
window.approveWithdrawal = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const withdrawalId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const amount = row.children[2].innerText;

  const confirmApprove = confirm(
    "确定要批准这笔提现吗？\n\n提现ID：" +
      withdrawalId +
      "\n用户：" +
      username +
      "\n金额：" +
      amount
  );

  if (!confirmApprove) {
    return;
  }

  row.setAttribute("data-status", "approved");

  row.children[6].innerHTML = '<span class="status vip">已批准</span>';

  row.children[7].innerHTML = `
    <button class="table-btn" onclick="viewWithdrawalFromRow(this)">查看</button>
  `;

  alert("提现申请已批准！");
};


// ===============================
// 提现管理：拒绝提现
// ===============================
window.rejectWithdrawal = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const withdrawalId = row.children[0].innerText;
  const username = row.children[1].innerText;
  const amount = row.children[2].innerText;

  const confirmReject = confirm(
    "确定要拒绝这笔提现吗？\n\n提现ID：" +
      withdrawalId +
      "\n用户：" +
      username +
      "\n金额：" +
      amount
  );

  if (!confirmReject) {
    return;
  }

  row.setAttribute("data-status", "rejected");

  row.children[6].innerHTML = '<span class="status banned">已拒绝</span>';

  row.children[7].innerHTML = `
    <button class="table-btn" onclick="viewWithdrawalFromRow(this)">查看</button>
  `;

  alert("提现申请已拒绝！");
};


// ===============================
// 提现管理：导出记录
// ===============================
window.exportWithdrawalRecords = function () {
  alert("提现记录导出成功！（当前为前端演示，后期可导出 CSV / Excel）");
};
// ===============================
// API管理：搜索和筛选
// ===============================
window.filterApiRecords = function () {
  const searchInput = document.getElementById("apiSearchInput");
  const statusFilter = document.getElementById("apiStatusFilter");
  const table = document.getElementById("apiTable");

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
// API管理：查看详情
// ===============================
window.viewApiFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const apiName = row.children[0].innerText;
  const apiType = row.children[1].innerText;
  const apiUrl = row.children[2].innerText;
  const status = row.children[3].innerText;
  const todayCalls = row.children[4].innerText;
  const lastCheck = row.children[5].innerText;

  const modal = document.getElementById("apiModal");
  const content = document.getElementById("apiModalContent");

  if (!modal || !content) {
    alert("API详情弹窗代码缺失，请检查 apiModal 是否存在");
    return;
  }

  content.innerHTML = `
    <p><strong>API名称：</strong>${apiName}</p>
    <p><strong>接口类型：</strong>${apiType}</p>
    <p><strong>请求地址：</strong>${apiUrl}</p>
    <p><strong>当前状态：</strong>${status}</p>
    <p><strong>今日调用：</strong>${todayCalls}</p>
    <p><strong>最后检测：</strong>${lastCheck}</p>
    <p><strong>说明：</strong>当前为前端演示数据，后期可接入真实接口健康检测。</p>
  `;

  modal.style.display = "flex";
};


// ===============================
// API管理：关闭详情弹窗
// ===============================
window.closeApiModal = function () {
  const modal = document.getElementById("apiModal");

  if (modal) {
    modal.style.display = "none";
  }
};


// ===============================
// API管理：测试接口
// ===============================
window.testApiFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const apiName = row.children[0].innerText;
  const apiUrl = row.children[2].innerText;

  alert(
    "正在测试接口：\n\nAPI名称：" +
      apiName +
      "\n请求地址：" +
      apiUrl +
      "\n\n测试结果：连接正常！（当前为前端演示）"
  );

  row.setAttribute("data-status", "normal");
  row.children[3].innerHTML = '<span class="status vip">正常</span>';

  const now = new Date();
  const timeText =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0") +
    " " +
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");

  row.children[5].innerText = timeText;
};


// ===============================
// API管理：修复异常接口
// ===============================
window.fixApiFromRow = function (buttonElement) {
  const row = buttonElement.closest("tr");

  if (!row) {
    return;
  }

  const apiName = row.children[0].innerText;
  const apiUrl = row.children[2].innerText;

  const confirmFix = confirm(
    "确定要修复该异常接口吗？\n\nAPI名称：" +
      apiName +
      "\n请求地址：" +
      apiUrl
  );

  if (!confirmFix) {
    return;
  }

  row.setAttribute("data-status", "normal");

  row.children[3].innerHTML = '<span class="status vip">正常</span>';

  const now = new Date();
  const timeText =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0") +
    " " +
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");

  row.children[5].innerText = timeText;

  row.children[6].innerHTML = `
    <button class="table-btn" onclick="viewApiFromRow(this)">查看</button>
    <button class="table-btn success" onclick="testApiFromRow(this)">测试</button>
  `;

  alert("接口已修复，状态已恢复正常！");
};


// ===============================
// API管理：导出记录
// ===============================
window.exportApiRecords = function () {
  alert("API记录导出成功！（当前为前端演示，后期可导出 CSV / Excel）");
};
// ===============================
// API管理：新增API弹窗
// ===============================
window.openAddApiModal = function () {
  const modal = document.getElementById("addApiModal");

  if (modal) {
    modal.style.display = "flex";
  }
};


window.closeAddApiModal = function () {
  const modal = document.getElementById("addApiModal");

  if (modal) {
    modal.style.display = "none";
  }
};


// ===============================
// API管理：保存新增API
// ===============================
window.saveNewApi = function () {
  const nameInput = document.getElementById("newApiName");
  const typeInput = document.getElementById("newApiType");
  const urlInput = document.getElementById("newApiUrl");
  const statusInput = document.getElementById("newApiStatus");
  const table = document.getElementById("apiTable");

  if (!nameInput || !typeInput || !urlInput || !statusInput || !table) {
    alert("新增API表单或API表格不存在，请检查页面代码。");
    return;
  }

  const apiName = nameInput.value.trim();
  const apiType = typeInput.value.trim();
  const apiUrl = urlInput.value.trim();
  const apiStatus = statusInput.value;

  if (!apiName || !apiType || !apiUrl) {
    alert("请填写 API名称、接口类型和请求地址");
    return;
  }

  const tbody = table.querySelector("tbody");

  let statusText = "正常";
  let statusClass = "vip";
  let actionButtons = `
    <button class="table-btn" onclick="viewApiFromRow(this)">查看</button>
    <button class="table-btn success" onclick="testApiFromRow(this)">测试</button>
  `;

  if (apiStatus === "testing") {
    statusText = "测试中";
    statusClass = "normal";
  }

  if (apiStatus === "error") {
    statusText = "异常";
    statusClass = "banned";
    actionButtons = `
      <button class="table-btn" onclick="viewApiFromRow(this)">查看</button>
      <button class="table-btn danger" onclick="fixApiFromRow(this)">修复</button>
    `;
  }

  const now = new Date();
  const timeText =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0") +
    " " +
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");

  const newRow = document.createElement("tr");
  newRow.setAttribute("data-status", apiStatus);

  newRow.innerHTML = `
    <td>${apiName}</td>
    <td>${apiType}</td>
    <td>${apiUrl}</td>
    <td><span class="status ${statusClass}">${statusText}</span></td>
    <td>0</td>
    <td>${timeText}</td>
    <td>${actionButtons}</td>
  `;

  tbody.appendChild(newRow);

  nameInput.value = "";
  typeInput.value = "";
  urlInput.value = "";
  statusInput.value = "normal";

  closeAddApiModal();

  alert("新增API已添加到接口列表！（当前为前端演示，刷新页面后不会永久保存）");
};