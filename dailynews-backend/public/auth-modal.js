javascript
document.addEventListener("DOMContentLoaded", function () {
  console.log("auth-modal.js 已加载");

  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");

  const loginModal = document.getElementById("loginModal");
  const registerModal = document.getElementById("registerModal");

  const closeLoginModal = document.getElementById(
    "closeLoginModal"
  );
  
  const closeRegisterModal = document.getElementById(
    "closeRegisterModal"
  );

  const switchToRegister = document.getElementById(
    "switchToRegister"
  );

  const switchToLogin = document.getElementById(
    "switchToLogin"
  );

  function openModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    const openModalElement =
      document.querySelector(".auth-modal.show");

    if (!openModalElement) {
      document.body.style.overflow = "";
    }
  }

  if (!loginBtn) {
    console.error("找不到登录按钮 #loginBtn");
  }

  if (!registerBtn) {
    console.error("找不到注册按钮 #registerBtn");
  }

  if (!loginModal) {
    console.error("找不到登录弹窗 #loginModal");
  }

  if (!registerModal) {
    console.error("找不到注册弹窗 #registerModal");
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

  const loginForm = document.getElementById("loginForm");

  loginForm?.addEventListener("submit", function (event) {
    event.preventDefault();

    const loginMessage =
      document.getElementById("loginMessage");

    if (loginMessage) {
      loginMessage.textContent =
        "登录弹窗运行正常。";
    }
  });

  const registerForm =
    document.getElementById("registerForm");

  registerForm?.addEventListener("submit", function (event) {
    event.preventDefault();

    const password =
      document.getElementById("registerPassword")?.value;

    const confirmPassword =
      document.getElementById(
        "registerConfirmPassword"
      )?.value;

    const registerMessage =
      document.getElementById("registerMessage");

    if (password !== confirmPassword) {
      if (registerMessage) {
        registerMessage.textContent =
          "两次输入的密码不一致。";
      }

      return;
    }

    if (registerMessage) {
      registerMessage.textContent =
        "注册弹窗运行正常。";
    }
  });
});
