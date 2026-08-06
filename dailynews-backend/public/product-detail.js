const PRODUCT_DETAIL_API =
    "/api/store";

let currentProduct = null;

document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadProductDetail();
    }
);

async function loadProductDetail() {
    const container =
        document.getElementById(
            "productDetailMain"
        );

    const productId =
        new URLSearchParams(
            window.location.search
        ).get("id");

    if (!productId) {
        renderProductError(
            "缺少商品ID。"
        );

        return;
    }

    try {
        const response = await fetch(
            `${PRODUCT_DETAIL_API}/${encodeURIComponent(
                productId
            )}`,
            {
                headers: {
                    Accept:
                        "application/json"
                },
                cache: "no-store"
            }
        );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "读取商品详情失败。"
            );
        }

        currentProduct =
            result.product;

        renderProductDetail();
    } catch (error) {
        console.error(error);

        renderProductError(
            error.message
        );
    }
}

function renderProductDetail() {
    const container =
        document.getElementById(
            "productDetailMain"
        );

    if (!container || !currentProduct) {
        return;
    }

    const coverImages =
        Array.isArray(
            currentProduct.cover_images
        )
            ? currentProduct.cover_images
            : [];

    const detailImages =
        Array.isArray(
            currentProduct.detail_images
        )
            ? currentProduct.detail_images
            : [];

    const firstCover =
        coverImages[0]?.image_url ||
        currentProduct.cover_url ||
        "";

    const mainImageHtml =
        firstCover
            ? `
        <img
          id="productMainImageElement"
          src="${escapeProductHtml(
                firstCover
            )}"
          alt="${escapeProductHtml(
                currentProduct.product_name
            )}"
        />
      `
            : escapeProductHtml(
                getProductTypeLabel(
                    currentProduct.product_type
                )
            );

    const thumbnailHtml =
        coverImages.length > 1
            ? `
        <div class="product-thumbnails">
          ${coverImages
                .map(
                    (image, index) => `
                <button
                  type="button"
                  class="product-thumbnail ${index === 0
                            ? "is-active"
                            : ""
                        }"
                  data-product-cover="${escapeProductHtml(
                            image.image_url
                        )}"
                >
                  <img
                    src="${escapeProductHtml(
                            image.image_url
                        )}"
                    alt="商品封面 ${index + 1}"
                  />
                </button>
              `
                )
                .join("")}
        </div>
      `
            : "";

    const buyUrl =
        currentProduct.access_url ||
        (
            currentProduct.product_type ===
                "membership"
                ? "/subscribe.html"
                : "#"
        );

    container.innerHTML = `
    <section class="product-detail-top">
      <div class="product-gallery">
        <div class="product-main-image">
          ${mainImageHtml}
        </div>

        ${thumbnailHtml}
      </div>

      <div class="product-summary">
        <span class="product-type-label">
          ${escapeProductHtml(
        getProductTypeLabel(
            currentProduct.product_type
        )
    )}
        </span>

        <h2>
          ${escapeProductHtml(
        currentProduct.product_name
    )}
        </h2>

        <div class="product-detail-price">
          ${escapeProductHtml(
        currentProduct.currency
    )}
          ${Number(
        currentProduct.price
    ).toFixed(2)}
        </div>

        <a
          class="product-buy-button"
          href="${escapeProductHtml(
        buyUrl
    )}"
        >
          ${currentProduct.product_type ===
            "membership"
            ? "开通会员"
            : "立即购买"
        }
        </a>
      </div>
    </section>

    <section class="product-description-card">
      <h2>商品介绍</h2>

      <div class="product-description-content">
        ${currentProduct.description ||
        "<p>暂无商品介绍。</p>"
        }
      </div>
    </section>

    ${detailImages.length
            ? `
          <section class="product-detail-images-card">
            <h2>商品详情图片</h2>

            <div class="product-detail-images">
              ${detailImages
                .map(
                    (image, index) => `
                    <img
                      src="${escapeProductHtml(
                        image.image_url
                    )}"
                      alt="商品详情图 ${index + 1}"
                    />
                  `
                )
                .join("")}
            </div>
          </section>
        `
            : ""
        }
  `;

    bindProductGallery();
}

function bindProductGallery() {
    document
        .querySelectorAll(
            "[data-product-cover]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    const mainImage =
                        document.getElementById(
                            "productMainImageElement"
                        );

                    if (!mainImage) {
                        return;
                    }

                    mainImage.src =
                        button.dataset.productCover;

                    document
                        .querySelectorAll(
                            "[data-product-cover]"
                        )
                        .forEach((item) => {
                            item.classList.toggle(
                                "is-active",
                                item === button
                            );
                        });
                }
            );
        });
}

function renderProductError(message) {
    const container =
        document.getElementById(
            "productDetailMain"
        );

    if (!container) {
        return;
    }

    container.innerHTML = `
    <div class="product-detail-loading">
      ${escapeProductHtml(message)}
    </div>
  `;
}

function getProductTypeLabel(type) {
    const labels = {
        ebook: "电子书",
        report: "研究报告",
        video: "视频内容",
        membership: "会员服务"
    };

    return labels[type] || "商品";
}

function escapeProductHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}