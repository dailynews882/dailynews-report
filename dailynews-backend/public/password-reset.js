"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const modal = byId("passwordResetModal");
  const login = byId("loginModal");
  const form = byId("passwordResetForm");
  if (!modal || !form) return;
  const send = byId("sendResetCode");
  const confirm = byId("confirmPasswordReset");
  const emailInput = byId("resetEmail");
  let nextSendAt = 0;
  let timer;
  const toggle = (element, open) => {
    element?.classList.toggle("show", open);
    element?.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = document.querySelector(".auth-modal.show") ? "hidden" : "";
  };
  const message = (text, success = false) => {
    byId("passwordResetMessage").textContent = text;
    byId("passwordResetMessage").style.color = success ? "#14833b" : "#d32f2f";
  };
  const close = () => { toggle(modal, false); form.reset(); byId("forgotPasswordBtn")?.focus(); };
  byId("forgotPasswordBtn")?.addEventListener("click", () => {
    toggle(login, false);
    toggle(modal, true);
    message("");
    const account = byId("loginAccount")?.value.trim() || "";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) emailInput.value = account;
    emailInput.focus();
  });
  byId("closePasswordReset")?.addEventListener("click", close);
  byId("resetBackToLogin")?.addEventListener("click", () => { close(); toggle(login, true); byId("loginAccount")?.focus(); });
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.classList.contains("show")) close(); });
  const post = async (path, body) => {
    const response = await fetch("/api/auth/password-reset/" + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "暂时无法完成操作，请稍后重试。");
    return data;
  };
  const email = () => emailInput.value.trim().toLowerCase();
  const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const countdown = () => {
    const seconds = Math.max(0, Math.ceil((nextSendAt - Date.now()) / 1000));
    send.disabled = seconds > 0;
    send.textContent = seconds > 0 ? `${seconds}秒后重发` : "发送验证码";
    if (!seconds && timer) { window.clearInterval(timer); timer = null; }
  };
  send.addEventListener("click", async () => {
    if (send.disabled || Date.now() < nextSendAt) return;
    if (!validEmail(email())) { message("请输入正确的邮箱地址。"); return; }
    send.disabled = true;
    send.textContent = "正在申请...";
    try {
      const data = await post("request", { email: email() });
      message(data.message, true);
      nextSendAt = Date.now() + 60000;
      countdown();
      timer = window.setInterval(countdown, 1000);
    } catch (error) { message(error.message); send.disabled = false; send.textContent = "发送验证码"; }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (confirm.disabled) return;
    const code = byId("resetCode").value.trim();
    const newPassword = byId("resetPassword").value;
    if (!validEmail(email()) || !/^\d{6}$/.test(code)) { message("请检查邮箱和六位验证码。"); return; }
    if (newPassword !== byId("resetConfirmPassword").value) { message("两次输入的密码不一致。"); return; }
    confirm.disabled = true;
    try {
      const data = await post("confirm", { email: email(), code, newPassword });
      message(data.message, true);
      for (const storage of [localStorage, typeof sessionStorage === "undefined" ? null : sessionStorage]) {
        if (storage) for (const key of ["token", "dailynewsUser", "user", "dailynews_token", "dailynews_user"]) storage.removeItem(key);
      }
      form.reset();
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (error) { message(error.message); confirm.disabled = false; }
  });
});
