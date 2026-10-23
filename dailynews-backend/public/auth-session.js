(function () {
  "use strict";
  // Session-only login must never be promoted to persistent storage on navigation.
  const keys = ["token", "dailynewsUser", "user", "dailynews_token", "dailynews_user"];
  const temporary = typeof sessionStorage === "undefined" ? null : sessionStorage;
  const readToken = storage => storage && (storage.getItem("token") || storage.getItem("dailynews_token"));
  const activeStorage = () => readToken(temporary) ? temporary : localStorage;
  function token() {
    const storage = activeStorage();
    const value = readToken(storage);
    if (value) storage.setItem("token", value);
    return value;
  }
  function user() {
    if (!token()) return null;
    const storage = activeStorage();
    for (const key of ["dailynewsUser", "dailynews_user", "user"]) {
      try {
        const value = JSON.parse(storage.getItem(key));
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
      } catch (_) { storage.removeItem(key); }
    }
    return null;
  }
  function save(value, profile, remember = true) {
    if (!value || !profile) throw new Error("服务器未返回完整登录信息，请重新登录。");
    const storage = remember ? localStorage : temporary;
    if (!storage) throw new Error("浏览器不支持临时登录会话。");
    clear();
    storage.setItem("token", value);
    storage.setItem("dailynews_token", value);
    storage.setItem("dailynewsUser", JSON.stringify(profile));
    storage.setItem("dailynews_user", JSON.stringify(profile));
  }
  function updateUser(profile, expectedToken) {
    if (!profile || !expectedToken || token() !== expectedToken) return;
    const storage = activeStorage();
    storage.setItem("dailynewsUser", JSON.stringify(profile));
    storage.setItem("dailynews_user", JSON.stringify(profile));
  }
  function clear() {
    for (const storage of [localStorage, temporary]) {
      if (storage) for (const key of keys) storage.removeItem(key);
    }
  }
  window.dailynewsSession = { token, user, save, updateUser, clear };
  token();
})();
