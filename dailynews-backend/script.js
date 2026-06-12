console.log("每日新闻 Daily News 网站已启动");

// 简单模拟搜索功能
const searchInput = document.querySelector(".search-box input");
const searchButton = document.querySelector(".search-box button");

searchButton.addEventListener("click", function () {
    const keyword = searchInput.value.trim();

    if (!keyword) {
        alert("请输入搜索关键词");
        return;
    }

    alert("你搜索的是：" + keyword);
});