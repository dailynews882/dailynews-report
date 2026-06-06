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