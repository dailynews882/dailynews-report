(function () {
  "use strict";
  // Use persistent storage for every login entry; older pages used different keys.
  const keys = ["token", "dailynewsUser", "user", "dailynews_token", "dailynews_user"];
  function token() {
    const value = localStorage.getItem("token") || localStorage.getItem("dailynews_token");
    if (value) localStorage.setItem("token", value);
    return value;
  }
  function user() {
    for (const key of ["dailynewsUser", "dailynews_user", "user"]) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
      } catch (_) { localStorage.removeItem(key); }
    }
    return null;
  }
  function save(value, profile) {
    if (!value || !profile) throw new Error("服务器未返回完整登录信息，请重新登录。");
    localStorage.setItem("token", value);
    localStorage.setItem("dailynews_token", value);
    localStorage.setItem("dailynewsUser", JSON.stringify(profile));
    localStorage.setItem("dailynews_user", JSON.stringify(profile));
  }
  function clear() { for (const key of keys) localStorage.removeItem(key); }
  window.dailynewsSession = { token, user, save, clear };
  token();
})();
