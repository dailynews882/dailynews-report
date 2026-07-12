const FAVORITES_KEY = "dailynewsFavorites";

document.addEventListener("DOMContentLoaded", () => {
    renderMyFavorites();
});

function renderMyFavorites() {
    const favoritesBox = document.getElementById("myFavoritesList");
    const favoritesMessage = document.getElementById("myFavoritesMessage");

    if (!favoritesBox || !favoritesMessage) {
        return;
    }

    const favorites = getFavorites();

    favoritesBox.innerHTML = "";

    if (favorites.length === 0) {
        favoritesMessage.innerText = "你还没有收藏新闻。可以先回到首页，点击新闻下面的“收藏”。";
        return;
    }

    favoritesMessage.innerText = "共收藏 " + favorites.length + " 条新闻";

    favorites.forEach((item) => {
        const card = document.createElement("div");
        card.className = "my-favorite-card";

        card.innerHTML = `
          <div class="my-favorite-info">
            <a class="my-favorite-title" href="${escapeAttr(item.url || "#")}">
              ${escapeHtml(item.title || "未命名新闻")}
            </a>
            <div class="my-favorite-time">
              收藏时间：${formatDate(item.saved_at)}
            </div>
          </div>

          <button 
            type="button" 
            class="my-favorite-remove"
            data-id="${escapeAttr(item.id)}"
          >
            取消收藏
          </button>
        `;

        favoritesBox.appendChild(card);

    });

    favoritesBox.addEventListener("click", handleFavoriteRemove);
}

function handleFavoriteRemove(event) {
    const button = event.target.closest(".my-favorite-remove");

    if (!button) {
        return;
    }

    const newsId = Number(button.dataset.id || 0);
    const favorites = getFavorites().filter((item) => Number(item.id) !== newsId);

    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    renderMyFavorites();
}

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    } catch (error) {
        return [];
    }
}

function formatDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function escapeHtml(text) {
    const amp = String.fromCharCode(38);
    const htmlAmp = String.fromCharCode(38, 97, 109, 112, 59);
    const htmlLt = String.fromCharCode(38, 108, 116, 59);
    const htmlGt = String.fromCharCode(38, 103, 116, 59);
    const htmlQuot = String.fromCharCode(38, 113, 117, 111, 116, 59);
    const htmlApos = String.fromCharCode(38, 35, 48, 51, 57, 59);

    return String(text)
        .replaceAll(amp, htmlAmp)
        .replaceAll("<", htmlLt)
        .replaceAll(">", htmlGt)
        .replaceAll(String.fromCharCode(34), htmlQuot)
        .replaceAll(String.fromCharCode(39), htmlApos);
}

function escapeAttr(text) {
    const amp = String.fromCharCode(38);
    const htmlAmp = String.fromCharCode(38, 97, 109, 112, 59);
    const htmlLt = String.fromCharCode(38, 108, 116, 59);
    const htmlGt = String.fromCharCode(38, 103, 116, 59);
    const htmlQuot = String.fromCharCode(38, 113, 117, 111, 116, 59);

    return String(text)
        .replaceAll(amp, htmlAmp)
        .replaceAll(String.fromCharCode(34), htmlQuot)
        .replaceAll("<", htmlLt)
        .replaceAll(">", htmlGt);
}