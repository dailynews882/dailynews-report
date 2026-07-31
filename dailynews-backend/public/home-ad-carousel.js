document.addEventListener(
    "DOMContentLoaded",
    function () {
        initializeHomeAdCarousel();
    }
);

async function initializeHomeAdCarousel() {
    const carousel =
        document.getElementById(
            "homeAdCarousel"
        );

    const track =
        document.getElementById(
            "homeAdTrack"
        );

    const previousButton =
        document.getElementById(
            "homeAdPrevious"
        );

    const nextButton =
        document.getElementById(
            "homeAdNext"
        );

    const dotsContainer =
        document.getElementById(
            "homeAdDots"
        );

    if (
        !carousel ||
        !track ||
        !previousButton ||
        !nextButton ||
        !dotsContainer
    ) {
        return;
    }

    await loadDynamicHomeAds(track);

    const slides = Array.from(
        track.querySelectorAll(
            ".home-ad-slide"
        )
    );

    if (!slides.length) {
        carousel.style.display = "none";
        return;
    }

    let currentIndex = 0;
    let autoTimer = null;
    let touchStartX = 0;
    let touchEndX = 0;

    const AUTO_INTERVAL = 5000;

    function createDots() {
        dotsContainer.innerHTML = "";

        slides.forEach(function (
            slide,
            index
        ) {
            const dot =
                document.createElement(
                    "button"
                );

            dot.type = "button";
            dot.className =
                "home-ad-dot";

            dot.setAttribute(
                "aria-label",
                `切换到第${index + 1}张广告`
            );

            dot.addEventListener(
                "click",
                function () {
                    goToSlide(index);
                    restartAutoPlay();
                }
            );

            dotsContainer.appendChild(dot);
        });
    }

    function updateCarousel() {
        track.style.transform =
            `translateX(-${currentIndex * 100}%)`;

        slides.forEach(function (
            slide,
            index
        ) {
            slide.classList.toggle(
                "is-active",
                index === currentIndex
            );

            slide.setAttribute(
                "aria-hidden",
                index === currentIndex
                    ? "false"
                    : "true"
            );
        });

        const dots =
            dotsContainer.querySelectorAll(
                ".home-ad-dot"
            );

        dots.forEach(function (
            dot,
            index
        ) {
            dot.classList.toggle(
                "is-active",
                index === currentIndex
            );

            dot.setAttribute(
                "aria-current",
                index === currentIndex
                    ? "true"
                    : "false"
            );
        });
    }

    function goToSlide(index) {
        if (index < 0) {
            currentIndex =
                slides.length - 1;
        } else if (
            index >= slides.length
        ) {
            currentIndex = 0;
        } else {
            currentIndex = index;
        }

        updateCarousel();
    }

    function showPreviousSlide() {
        goToSlide(currentIndex - 1);
    }

    function showNextSlide() {
        goToSlide(currentIndex + 1);
    }

    function stopAutoPlay() {
        if (autoTimer) {
            window.clearInterval(
                autoTimer
            );

            autoTimer = null;
        }
    }

    function startAutoPlay() {
        stopAutoPlay();

        if (slides.length <= 1) {
            return;
        }

        autoTimer =
            window.setInterval(
                showNextSlide,
                AUTO_INTERVAL
            );
    }

    function restartAutoPlay() {
        stopAutoPlay();
        startAutoPlay();
    }

    previousButton.addEventListener(
        "click",
        function () {
            showPreviousSlide();
            restartAutoPlay();
        }
    );

    nextButton.addEventListener(
        "click",
        function () {
            showNextSlide();
            restartAutoPlay();
        }
    );

    carousel.addEventListener(
        "mouseenter",
        stopAutoPlay
    );

    carousel.addEventListener(
        "mouseleave",
        startAutoPlay
    );

    carousel.addEventListener(
        "focusin",
        stopAutoPlay
    );

    carousel.addEventListener(
        "focusout",
        startAutoPlay
    );

    carousel.addEventListener(
        "touchstart",
        function (event) {
            touchStartX =
                event.changedTouches[0]
                    .screenX;
        },
        {
            passive: true,
        }
    );

    carousel.addEventListener(
        "touchend",
        function (event) {
            touchEndX =
                event.changedTouches[0]
                    .screenX;

            const distance =
                touchEndX - touchStartX;

            if (
                Math.abs(distance) < 40
            ) {
                return;
            }

            if (distance > 0) {
                showPreviousSlide();
            } else {
                showNextSlide();
            }

            restartAutoPlay();
        },
        {
            passive: true,
        }
    );

    if (slides.length <= 1) {
        previousButton.hidden = true;
        nextButton.hidden = true;
        dotsContainer.hidden = true;
    } else {
        previousButton.hidden = false;
        nextButton.hidden = false;
        dotsContainer.hidden = false;
    }

    createDots();
    updateCarousel();
    startAutoPlay();
}

async function loadDynamicHomeAds(
    track
) {
    try {
        const response = await fetch(
            "/api/site-ads",
            {
                method: "GET",
                headers: {
                    Accept:
                        "application/json",
                },
                cache: "no-store",
            }
        );

        const result =
            await response
                .json()
                .catch(function () {
                    return {};
                });

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "读取首页广告失败"
            );
        }

        const ads =
            Array.isArray(result.data)
                ? result.data.slice(0, 5)
                : [];

        if (!ads.length) {
            console.warn(
                "后台暂无已发布广告，继续显示静态占位广告。"
            );
            return;
        }

        track.innerHTML = "";

        ads.forEach(function (
            ad,
            index
        ) {
            const slide =
                document.createElement("a");

            slide.className =
                "home-ad-slide has-image";

            if (index === 0) {
                slide.classList.add(
                    "is-active"
                );
            }

            slide.href =
                normalizeHomeAdTargetUrl(
                    ad.target_url
                );

            slide.setAttribute(
                "aria-label",
                String(
                    ad.title ||
                    `广告${index + 1}`
                )
            );

            slide.setAttribute(
                "aria-hidden",
                index === 0
                    ? "false"
                    : "true"
            );

            if (
                Number(ad.open_new_tab) === 1
            ) {
                slide.target = "_blank";
                slide.rel =
                    "noopener noreferrer";
            }

            const image =
                document.createElement("img");

            image.className =
                "home-ad-image";

            image.src =
                String(ad.image_url || "");

            image.alt =
                String(
                    ad.title ||
                    `首页广告${index + 1}`
                );

            image.loading =
                index === 0
                    ? "eager"
                    : "lazy";

            image.decoding = "async";

            slide.appendChild(image);
            track.appendChild(slide);
        });
    } catch (error) {
        console.error(
            "Load dynamic home advertisements error:",
            error
        );

        console.warn(
            "动态广告读取失败，继续显示静态占位广告。"
        );
    }
}

function normalizeHomeAdTargetUrl(
    value
) {
    const targetUrl =
        String(value || "").trim();

    if (!targetUrl) {
        return "#";
    }

    if (targetUrl.startsWith("/")) {
        return targetUrl;
    }

    try {
        const parsedUrl =
            new URL(targetUrl);

        if (
            parsedUrl.protocol ===
            "http:" ||
            parsedUrl.protocol ===
            "https:"
        ) {
            return parsedUrl.href;
        }
    } catch (error) {
        console.warn(
            "Invalid advertisement target URL:",
            targetUrl
        );
    }

    return "#";
}