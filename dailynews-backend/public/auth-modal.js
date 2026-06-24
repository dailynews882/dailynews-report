document.addEventListener("DOMContentLoaded", function () {
  console.log("auth-modal.js 已加载");

  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const authUserArea = document.getElementById("authUserArea");
  const authUserName = document.getElementById("authUserName");

  const loginModal = document.getElementById("loginModal");
  const registerModal = document.getElementById("registerModal");

  const closeLoginModal = document.getElementById("closeLoginModal");
  const closeRegisterModal = document.getElementById("closeRegisterModal");

  const switchToRegister = document.getElementById("switchToRegister");
  const switchToLogin = document.getElementById("switchToLogin");

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const sendRegisterCodeBtn = document.getElementById("sendRegisterCodeBtn");

  function openModal(modal) {
    if (!modal) return;

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    if (!document.querySelector(".auth-modal.show")) {
      document.body.style.overflow = "";
    }
  }

  function showMessage(elementId, message, success = false) {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#14833b" : "#d32f2f";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function saveLoginData(token, user) {
    localStorage.setItem("token", token);
    localStorage.setItem("dailynewsUser", JSON.stringify(user));
  }

  function clearLoginData() {
    localStorage.removeItem("token");
    localStorage.removeItem("dailynewsUser");
    localStorage.removeItem("user");
  }

  function getSavedUser() {
    const savedUser =
      localStorage.getItem("dailynewsUser") ||
      localStorage.getItem("user");

    if (!savedUser) {
      return null;
    }

    try {
      return JSON.parse(savedUser);
    } catch (error) {
      console.error("用户资料解析失败：", error);
      clearLoginData();
      return null;
    }
  }

  function getDisplayName(user) {
    if (!user) return "";

    return (
      user.username ||
      user.email ||
      user.account ||
      user.phone ||
      "用户"
    );
  }

  function showLoggedOutHeader() {
    if (loginBtn) loginBtn.style.display = "";
    if (registerBtn) registerBtn.style.display = "";
    if (authUserArea) authUserArea.style.display = "none";
    if (authUserName) authUserName.textContent = "";
  }

  function showLoggedInHeader(user) {
    const displayName = getDisplayName(user);

    if (!displayName) {
      showLoggedOutHeader();
      return;
    }

    if (loginBtn) loginBtn.style.display = "none";
    if (registerBtn) registerBtn.style.display = "none";

    if (authUserName) {
      authUserName.textContent = displayName;
      authUserName.title = displayName;
    }

    if (authUserArea) {
      authUserArea.style.display = "flex";
    }
  }

  async function refreshCurrentUser() {
    const token = localStorage.getItem("token");
    const savedUser = getSavedUser();

    if (!token) {
      showLoggedOutHeader();
      return;
    }

    if (savedUser) {
      showLoggedInHeader(savedUser);
    }

    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token
        }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "登录状态已经失效");
      }

      localStorage.setItem(
        "dailynewsUser",
        JSON.stringify(data.user)
      );

      showLoggedInHeader(data.user);
    } catch (error) {
      console.warn("恢复登录状态失败：", error.message);
      clearLoginData();
      showLoggedOutHeader();
    }
  }

  loginBtn?.addEventListener("click", function (event) {
    event.preventDefault();
    closeModal(registerModal);
    openModal(loginModal);
  });

  registerBtn?.addEventListener("click", function (event) {
    event.preventDefault();
    closeModal(loginModal);
    openModal(registerModal);
  });

  logoutBtn?.addEventListener("click", function () {
    clearLoginData();
    showLoggedOutHeader();
    window.location.reload();
  });

  closeLoginModal?.addEventListener("click", function () {
    closeModal(loginModal);
  });

  closeRegisterModal?.addEventListener("click", function () {
    closeModal(registerModal);
  });

  switchToRegister?.addEventListener("click", function () {
    closeModal(loginModal);
    openModal(registerModal);
  });

  switchToLogin?.addEventListener("click", function () {
    closeModal(registerModal);
    openModal(loginModal);
  });

  loginModal?.addEventListener("click", function (event) {
    if (event.target === loginModal) {
      closeModal(loginModal);
    }
  });

  registerModal?.addEventListener("click", function (event) {
    if (event.target === registerModal) {
      closeModal(registerModal);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeModal(loginModal);
      closeModal(registerModal);
    }
  });

  sendRegisterCodeBtn?.addEventListener("click", async function () {
    const email = String(
      document.getElementById("registerAccount")?.value || ""
    )
      .trim()
      .toLowerCase();

    if (!isValidEmail(email)) {
      showMessage(
        "registerMessage",
        "请先输入正确的邮箱地址。"
      );
      return;
    }

    sendRegisterCodeBtn.disabled = true;
    sendRegisterCodeBtn.textContent = "正在发送...";

    try {
      const response = await fetch(
        "/api/auth/email/send-code",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            account: email
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "验证码发送失败");
      }

      showMessage(
        "registerMessage",
        data.message || "邮箱验证码已发送。",
        true
      );

      let seconds = 60;
      sendRegisterCodeBtn.textContent = seconds + "秒后重发";

      const timer = window.setInterval(function () {
        seconds -= 1;

        if (seconds <= 0) {
          window.clearInterval(timer);
          sendRegisterCodeBtn.disabled = false;
          sendRegisterCodeBtn.textContent = "重新发送";
          return;
        }

        sendRegisterCodeBtn.textContent = seconds + "秒后重发";
      }, 1000);
    } catch (error) {
      showMessage(
        "registerMessage",
        error.message || "验证码发送失败"
      );

      sendRegisterCodeBtn.disabled = false;
      sendRegisterCodeBtn.textContent = "发送验证码";
    }
  });

  loginForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const account = String(
      document.getElementById("loginAccount")?.value || ""
    ).trim();

    const password = String(
      document.getElementById("loginPassword")?.value || ""
    );

    showMessage("loginMessage", "正在登录...", true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          account,
          password
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "登录失败");
      }

      saveLoginData(data.token, data.user);
      showLoggedInHeader(data.user);

      showMessage(
        "loginMessage",
        data.message || "登录成功",
        true
      );

      window.setTimeout(function () {
        closeModal(loginModal);
        window.location.reload();
      }, 600);
    } catch (error) {
      showMessage(
        "loginMessage",
        error.message || "登录失败"
      );
    }
  });

  registerForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const username = String(
      document.getElementById("registerUsername")?.value || ""
    ).trim();

    const email = String(
      document.getElementById("registerAccount")?.value || ""
    )
      .trim()
      .toLowerCase();

    const code = String(
      document.getElementById("registerOtpCode")?.value || ""
    ).trim();

    const password = String(
      document.getElementById("registerPassword")?.value || ""
    );

    const confirmPassword = String(
      document.getElementById("registerConfirmPassword")?.value || ""
    );

    if (!isValidEmail(email)) {
      showMessage(
        "registerMessage",
        "请输入正确的邮箱地址。"
      );
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      showMessage(
        "registerMessage",
        "请输入6位邮箱验证码。"
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        "registerMessage",
        "两次输入的密码不一致。"
      );
      return;
    }

    showMessage("registerMessage", "正在注册...", true);

    try {
      const response = await fetch(
        "/api/auth/email/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username,
            email,
            password,
            code
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "注册失败");
      }

      saveLoginData(data.token, data.user);
      showLoggedInHeader(data.user);

      showMessage(
        "registerMessage",
        data.message || "注册成功",
        true
      );

      window.setTimeout(function () {
        closeModal(registerModal);
        window.location.reload();
      }, 700);
    } catch (error) {
      showMessage(
        "registerMessage",
        error.message || "注册失败"
      );
    }
  });

  refreshCurrentUser();
});
