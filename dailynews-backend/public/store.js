const STORE_API = "/api/store";

let activeStoreType = "all";

document.addEventListener(
    "DOMContentLoaded",
    () => {
        bindStoreCategoryButtons();
        loadStoreProducts();
    }
);

function bindStoreCategoryButtons() {
    document
        .querySelectorAll(
            "[data-store-type]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    activeStoreType =
                        button.dataset.storeType ||
                        "all";

                    document
                        .querySelectorAll(
                            "[data-store-type]"
                        )
                        .forEach((item) => {
                            item.classList.toggle(
                                "active",
                                item === button
                            );
                        });

                    loadStoreProducts();
                }
            );
        });
}

async function loadStoreProducts() {
    const grid =
        document.getElementById(
            "storeGrid"
        );

    const status =
        document.getElementById(
            "storeStatus"
        );

    if (!grid || !status) {
        return;
    }

    status.textContent =
        "正在读取商品...";

    try {
        const query =
            activeStoreType === "all"
                ? ""
                : `?type=${encodeURIComponent(
                    activeStoreType
                )}`;

        const response = await fetch(
            `${STORE_API}${query}`,
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
                "读取商品失败。"
            );
        }

        const products =
            Array.isArray(result.products)
                ? result.products
                : [];

        status.textContent =
            `共 ${products.length} 个商品`;

        renderStoreProducts(products);
    } catch (error) {
        console.error(error);

        status.textContent =
            error.message;

        grid.innerHTML = `
      <div class="store-empty">
        ${escapeStoreHtml(
            error.message
        )}
      </div>
    `;
    }
}

function renderStoreProducts(products) {
    const grid =
        document.getElementById(
            "storeGrid"
        );

    if (!grid) {
        return;
    }

    if (!products.length) {
        grid.innerHTML = `
      <div class="store-empty">
        当前分类暂无已上架商品。
      </div>
    `;

        return;
    }

    grid.innerHTML = products
        .map((product) => {
            const coverUrl =
                product.primary_cover_url ||
                product.cover_url ||
                "";

            const cover = coverUrl
                ? `
          <img
            src="${escapeStoreHtml(
                    coverUrl
                )}"
            alt="${escapeStoreHtml(
                    product.product_name
                )}"
          />
        `
                : getStoreTypeLabel(
                    product.product_type
                ).toUpperCase();

            const plainDescription =
                stripStoreHtml(
                    product.description
                );

            return `
        <article class="store-card">
          <a
            class="store-card-detail-link"
            href="/product-detail.html?id=${product.id}"
          >
            <div class="store-card-cover">
              ${cover}
            </div>
          </a>

          <div class="store-card-body">
            <h3>
              <a
                class="store-product-title-link"
                href="/product-detail.html?id=${product.id}"
              >
                ${escapeStoreHtml(
                product.product_name
            )}
              </a>
            </h3>

            <p>
              ${escapeStoreHtml(
                plainDescription
            )}
            </p>

            <div class="store-price-row">
              <span class="store-price">
                ${escapeStoreHtml(
                product.currency
            )}
                ${Number(
                product.price
            ).toFixed(2)}
              </span>

              <a
                class="store-buy-button"
                href="/product-detail.html?id=${product.id}"
              >
                查看详情
              </a>
            </div>
          </div>
        </article>
      `;
        })
        .join("");
}

function getStoreTypeLabel(type) {
    const labels = {
        ebook: "E-BOOK",
        report: "REPORT",
        video: "VIDEO",
        membership: "VIP"
    };

    return labels[type] || "PRODUCT";
}

function stripStoreHtml(value) {
    const container =
        document.createElement("div");

    container.innerHTML =
        String(value || "");

    return (
        container.textContent ||
        container.innerText ||
        ""
    )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 110);
}

function escapeStoreHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}