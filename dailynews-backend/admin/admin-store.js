const STORE_ADMIN_API = "/api/store/admin";

let storeProducts = [];
let editingStoreProduct = null;
let selectedCoverFiles = [];
let selectedDetailFiles = [];

document.addEventListener(
    "DOMContentLoaded",
    () => {
        bindStoreAdminEvents();
        loadStoreProducts();
    }
);

function getAdminToken() {
    return String(
        localStorage.getItem("adminToken") || ""
    ).trim();
}

function getAdminHeaders(includeJson = true) {
    const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${getAdminToken()}`
    };

    if (includeJson) {
        headers["Content-Type"] =
            "application/json";
    }

    return headers;
}

function bindStoreAdminEvents() {
    document
        .getElementById(
            "addStoreProductButton"
        )
        ?.addEventListener("click", () => {
            openStoreProductModal();
        });

    document
        .getElementById(
            "closeStoreProductModalButton"
        )
        ?.addEventListener(
            "click",
            closeStoreProductModal
        );

    document
        .getElementById(
            "saveStoreProductButton"
        )
        ?.addEventListener(
            "click",
            saveStoreProduct
        );

    document
        .getElementById(
            "storeProductModal"
        )
        ?.addEventListener(
            "click",
            (event) => {
                if (
                    event.target.id ===
                    "storeProductModal"
                ) {
                    closeStoreProductModal();
                }
            }
        );

    document
        .getElementById(
            "storeProductsTableBody"
        )
        ?.addEventListener(
            "click",
            (event) => {
                const editButton =
                    event.target.closest(
                        "[data-edit-store-product]"
                    );

                if (editButton) {
                    const id = Number(
                        editButton.dataset
                            .editStoreProduct
                    );

                    const product =
                        storeProducts.find(
                            (item) =>
                                Number(item.id) === id
                        );

                    if (product) {
                        openStoreProductModal(product);
                    }

                    return;
                }

                const deleteButton =
                    event.target.closest(
                        "[data-delete-store-product]"
                    );

                if (deleteButton) {
                    deleteStoreProduct(
                        Number(
                            deleteButton.dataset
                                .deleteStoreProduct
                        )
                    );
                }
            }
        );

    document
        .querySelectorAll(
            "[data-store-command]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    const command =
                        button.dataset.storeCommand;

                    const value =
                        button.dataset.storeValue ||
                        null;

                    formatStoreDescription(
                        command,
                        value
                    );
                }
            );
        });

    document
        .getElementById(
            "insertStoreDescriptionLinkButton"
        )
        ?.addEventListener(
            "click",
            insertStoreDescriptionLink
        );

    document
        .getElementById(
            "storeCoverImagesInput"
        )
        ?.addEventListener(
            "change",
            (event) => {
                appendSelectedStoreFiles(
                    "cover",
                    Array.from(
                        event.target.files || []
                    )
                );
            }
        );

    document
        .getElementById(
            "storeDetailImagesInput"
        )
        ?.addEventListener(
            "change",
            (event) => {
                appendSelectedStoreFiles(
                    "detail",
                    Array.from(
                        event.target.files || []
                    )
                );
            }
        );

    document
        .querySelector(
            ".store-image-management"
        )
        ?.addEventListener(
            "click",
            handleStoreImageAction
        );
}

async function loadStoreProducts() {
    const body = document.getElementById(
        "storeProductsTableBody"
    );

    try {
        const response = await fetch(
            `${STORE_ADMIN_API}/list`,
            {
                headers: getAdminHeaders(false),
                cache: "no-store"
            }
        );

        const result = await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "读取商品失败。"
            );
        }

        storeProducts =
            Array.isArray(result.products)
                ? result.products
                : [];

        renderStoreProducts();

        showStoreAdminMessage(
            `已读取 ${storeProducts.length} 个商品。`,
            "success"
        );
    } catch (error) {
        console.error(error);

        if (body) {
            body.innerHTML = `
        <tr>
          <td colspan="8">
            ${escapeStoreAdminHtml(
                error.message
            )}
          </td>
        </tr>
      `;
        }

        showStoreAdminMessage(
            error.message,
            "error"
        );
    }
}

function renderStoreProducts() {
    const body = document.getElementById(
        "storeProductsTableBody"
    );

    if (!body) {
        return;
    }

    if (!storeProducts.length) {
        body.innerHTML = `
      <tr>
        <td colspan="8">暂无商品。</td>
      </tr>
    `;

        return;
    }

    body.innerHTML = storeProducts
        .map((product) => {
            return `
        <tr>
          <td>
            ${Number(
                product.sort_order
            ) || 0}
          </td>

          <td>
            <code>
              ${escapeStoreAdminHtml(
                product.product_code
            )}
            </code>
          </td>

          <td>
            ${escapeStoreAdminHtml(
                product.product_name
            )}
          </td>

          <td>
            ${getStoreProductTypeLabel(
                product.product_type
            )}
          </td>

          <td>
            ${escapeStoreAdminHtml(
                product.currency
            )}
            ${Number(
                product.price
            ).toFixed(2)}
          </td>

          <td>
            <span class="status ${product.status ===
                    "published"
                    ? "vip"
                    : product.status ===
                        "draft"
                        ? "normal"
                        : "banned"
                }">
              ${getStoreProductStatusLabel(
                    product.status
                )}
            </span>
          </td>

          <td>
            ${Number(
                    product.is_featured
                )
                    ? "是"
                    : "否"
                }
          </td>

          <td>
            <div class="action-buttons">
              <button
                type="button"
                class="table-btn"
                data-edit-store-product="${product.id}"
              >
                编辑
              </button>

              <button
                type="button"
                class="table-btn danger"
                data-delete-store-product="${product.id}"
              >
                删除
              </button>
            </div>
          </td>
        </tr>
      `;
        })
        .join("");
}

function openStoreProductModal(
    product = null
) {
    const modal = document.getElementById(
        "storeProductModal"
    );

    if (!modal) {
        return;
    }

    editingStoreProduct = product;
    selectedCoverFiles = [];
    selectedDetailFiles = [];

    document.getElementById(
        "storeProductModalTitle"
    ).textContent = product
            ? "编辑商品"
            : "新增商品";

    setValue(
        "storeProductId",
        product?.id || ""
    );

    setValue(
        "storeProductCode",
        product?.product_code || ""
    );

    setValue(
        "storeProductName",
        product?.product_name || ""
    );

    setValue(
        "storeProductType",
        product?.product_type || "ebook"
    );

    setValue(
        "storeProductPrice",
        product?.price ?? 0
    );

    setValue(
        "storeProductCurrency",
        product?.currency || "SGD"
    );

    setValue(
        "storeProductStatus",
        product?.status || "draft"
    );

    setValue(
        "storeProductSortOrder",
        product?.sort_order ?? 0
    );

    setValue(
        "storeProductAccessUrl",
        product?.access_url || ""
    );

    const editor = document.getElementById(
        "storeProductDescription"
    );

    if (editor) {
        editor.innerHTML =
            product?.description || "";
    }

    const featured =
        document.getElementById(
            "storeProductFeatured"
        );

    if (featured) {
        featured.checked =
            Boolean(
                Number(
                    product?.is_featured
                )
            );
    }

    clearStoreFileInputs();
    renderExistingStoreImages();

    modal.hidden = false;
    modal.style.display = "flex";
    document.body.style.overflow =
        "hidden";
}

function closeStoreProductModal() {
    const modal = document.getElementById(
        "storeProductModal"
    );

    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.style.display = "none";
    document.body.style.overflow = "";
    editingStoreProduct = null;
    selectedCoverFiles = [];
    selectedDetailFiles = [];
    clearStoreFileInputs();
}

function formatStoreDescription(
    command,
    value = null
) {
    const editor = document.getElementById(
        "storeProductDescription"
    );

    if (!editor) {
        return;
    }

    editor.focus();
    document.execCommand(
        command,
        false,
        value
    );
}

function insertStoreDescriptionLink() {
    const url = window.prompt(
        "请输入完整链接地址：",
        "https://"
    );

    if (!url) {
        return;
    }

    formatStoreDescription(
        "createLink",
        url
    );
}

async function saveStoreProduct() {
    const id = Number(
        getValue("storeProductId")
    );

    const editor = document.getElementById(
        "storeProductDescription"
    );

    const payload = {
        product_code:
            getValue("storeProductCode"),
        product_name:
            getValue("storeProductName"),
        product_type:
            getValue("storeProductType"),
        price: Number(
            getValue("storeProductPrice")
        ),
        currency:
            getValue("storeProductCurrency"),
        status:
            getValue("storeProductStatus"),
        sort_order:
            Number(
                getValue(
                    "storeProductSortOrder"
                )
            ) || 0,
        cover_url: "",
        access_url:
            getValue("storeProductAccessUrl"),
        description:
            editor?.innerHTML.trim() || "",
        is_featured:
            document.getElementById(
                "storeProductFeatured"
            )?.checked
                ? 1
                : 0
    };

    const button = document.getElementById(
        "saveStoreProductButton"
    );

    const originalText =
        button?.textContent || "保存商品";

    if (button) {
        button.disabled = true;
        button.textContent =
            "正在保存...";
    }

    try {
        const response = await fetch(
            id
                ? `${STORE_ADMIN_API}/${id}`
                : STORE_ADMIN_API,
            {
                method: id
                    ? "PUT"
                    : "POST",
                headers: getAdminHeaders(),
                body: JSON.stringify(payload)
            }
        );

        const result = await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "保存商品失败。"
            );
        }

        const savedProductId =
            id || Number(result.id);

        if (selectedCoverFiles.length) {
            await uploadStoreImages(
                savedProductId,
                "cover",
                selectedCoverFiles
            );
        }

        if (selectedDetailFiles.length) {
            await uploadStoreImages(
                savedProductId,
                "detail",
                selectedDetailFiles
            );
        }

        closeStoreProductModal();

        showStoreAdminMessage(
            "商品及图片保存成功。",
            "success"
        );

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        await loadStoreProducts();
    } catch (error) {
        console.error(error);

        showStoreAdminMessage(
            error.message,
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                originalText;
        }
    }
}

async function uploadStoreImages(
    productId,
    imageType,
    files
) {
    for (
        let index = 0;
        index < files.length;
        index += 1
    ) {
        const file = files[index];
        const formData = new FormData();

        formData.append(
            "image_type",
            imageType
        );

        formData.append(
            "images",
            file
        );

        const controller =
            new AbortController();

        const timeoutId =
            window.setTimeout(
                () => controller.abort(),
                60000
            );

        try {
            const response = await fetch(
                `${STORE_ADMIN_API}/${productId}/images`,
                {
                    method: "POST",
                    headers:
                        getAdminHeaders(false),
                    body: formData,
                    signal: controller.signal
                }
            );

            const contentType =
                response.headers.get(
                    "content-type"
                ) || "";

            const result =
                contentType.includes(
                    "application/json"
                )
                    ? await response.json()
                    : {
                        success: false,
                        message:
                            await response.text()
                    };

            if (
                !response.ok ||
                !result.success
            ) {
                throw new Error(
                    result.message ||
                    `第 ${index + 1} 张图片上传失败。`
                );
            }
        } catch (error) {
            if (
                error.name ===
                "AbortError"
            ) {
                throw new Error(
                    `第 ${index + 1} 张图片上传超时，请重试。`
                );
            }

            throw error;
        } finally {
            window.clearTimeout(
                timeoutId
            );
        }
    }
}

function appendSelectedStoreFiles(
    imageType,
    newFiles
) {
    const currentFiles =
        imageType === "cover"
            ? selectedCoverFiles
            : selectedDetailFiles;

    const mergedFiles = [
        ...currentFiles
    ];

    newFiles.forEach((file) => {
        const alreadyExists =
            mergedFiles.some(
                (existingFile) =>
                    existingFile.name === file.name &&
                    existingFile.size === file.size &&
                    existingFile.lastModified ===
                    file.lastModified
            );

        if (!alreadyExists) {
            mergedFiles.push(file);
        }
    });

    const maximum =
        imageType === "cover"
            ? 4
            : 10;

    const existingCount =
        editingStoreProduct
            ? getExistingImages(
                imageType
            ).length
            : 0;

    if (
        existingCount +
        mergedFiles.length >
        maximum
    ) {
        window.alert(
            imageType === "cover"
                ? "商品封面图最多4张。"
                : "商品详情图最多10张。"
        );

        clearSingleStoreFileInput(
            imageType
        );

        return;
    }

    if (imageType === "cover") {
        selectedCoverFiles =
            mergedFiles;
    } else {
        selectedDetailFiles =
            mergedFiles;
    }

    clearSingleStoreFileInput(
        imageType
    );

    renderExistingStoreImages();
}

function clearSingleStoreFileInput(
    imageType
) {
    const input =
        document.getElementById(
            imageType === "cover"
                ? "storeCoverImagesInput"
                : "storeDetailImagesInput"
        );

    if (input) {
        input.value = "";
    }
}

function renderSelectedStoreFiles(
    imageType
) {
    renderExistingStoreImages();
}

function renderExistingStoreImages() {
    renderStoreImageGroup("cover");
    renderStoreImageGroup("detail");
}

function renderStoreImageGroup(
    imageType
) {
    const containerId =
        imageType === "cover"
            ? "storeCoverImagesPreview"
            : "storeDetailImagesPreview";

    const container =
        document.getElementById(
            containerId
        );

    if (!container) {
        return;
    }

    const existingImages =
        getExistingImages(imageType);

    const selectedFiles =
        imageType === "cover"
            ? selectedCoverFiles
            : selectedDetailFiles;

    const existingHtml =
        existingImages
            .map((image, index) => {
                return `
          <article class="store-image-preview-item">
            <img
              src="${escapeStoreAdminHtml(
                    image.image_url
                )}"
              alt="商品图片"
            />

            <div class="store-image-preview-actions">
              <button
                type="button"
                data-store-image-order="up"
                data-product-id="${editingStoreProduct?.id || ""}"
                data-image-id="${image.id}"
                ${index === 0 ? "disabled" : ""}
              >
                上移
              </button>

              <button
                type="button"
                data-store-image-order="down"
                data-product-id="${editingStoreProduct?.id || ""}"
                data-image-id="${image.id}"
                ${index ===
                        existingImages.length - 1
                        ? "disabled"
                        : ""
                    }
              >
                下移
              </button>

              <button
                type="button"
                class="danger"
                data-delete-store-image="${image.id}"
                data-product-id="${editingStoreProduct?.id || ""}"
              >
                删除
              </button>
            </div>
          </article>
        `;
            })
            .join("");

    const selectedHtml =
        selectedFiles
            .map((file, index) => {
                const previewUrl =
                    URL.createObjectURL(file);

                return `
          <article class="store-image-preview-item is-pending">
            <img
              src="${previewUrl}"
              alt="${escapeStoreAdminHtml(
                    file.name
                )}"
            />

            <span class="store-image-pending-label">
              待上传 ${index + 1}
            </span>
          </article>
        `;
            })
            .join("");

    container.innerHTML =
        existingHtml +
        selectedHtml ||
        `
      <div class="store-image-preview-empty">
        暂无图片
      </div>
    `;
}

function getExistingImages(
    imageType
) {
    if (!editingStoreProduct) {
        return [];
    }

    const key =
        imageType === "cover"
            ? "cover_images"
            : "detail_images";

    return Array.isArray(
        editingStoreProduct[key]
    )
        ? editingStoreProduct[key]
        : [];
}

async function handleStoreImageAction(
    event
) {
    const deleteButton =
        event.target.closest(
            "[data-delete-store-image]"
        );

    if (deleteButton) {
        const productId = Number(
            deleteButton.dataset.productId
        );

        const imageId = Number(
            deleteButton.dataset
                .deleteStoreImage
        );

        await deleteStoreImage(
            productId,
            imageId
        );

        return;
    }

    const orderButton =
        event.target.closest(
            "[data-store-image-order]"
        );

    if (orderButton) {
        const productId = Number(
            orderButton.dataset.productId
        );

        const imageId = Number(
            orderButton.dataset.imageId
        );

        await reorderStoreImage(
            productId,
            imageId,
            orderButton.dataset
                .storeImageOrder
        );
    }
}

async function deleteStoreImage(
    productId,
    imageId
) {
    if (
        !window.confirm(
            "确定删除这张商品图片吗？"
        )
    ) {
        return;
    }

    const response = await fetch(
        `${STORE_ADMIN_API}/${productId}/images/${imageId}`,
        {
            method: "DELETE",
            headers: getAdminHeaders(false)
        }
    );

    const result = await response.json();

    if (
        !response.ok ||
        !result.success
    ) {
        showStoreAdminMessage(
            result.message ||
            "删除图片失败。",
            "error"
        );

        return;
    }

    await refreshEditingProduct(
        productId
    );

    showStoreAdminMessage(
        result.message,
        "success"
    );
}

async function reorderStoreImage(
    productId,
    imageId,
    direction
) {
    const response = await fetch(
        `${STORE_ADMIN_API}/${productId}/images/${imageId}/order`,
        {
            method: "PUT",
            headers: getAdminHeaders(),
            body: JSON.stringify({
                direction
            })
        }
    );

    const result = await response.json();

    if (
        !response.ok ||
        !result.success
    ) {
        showStoreAdminMessage(
            result.message ||
            "调整图片顺序失败。",
            "error"
        );

        return;
    }

    await refreshEditingProduct(
        productId
    );
}

async function refreshEditingProduct(
    productId
) {
    await loadStoreProducts();

    editingStoreProduct =
        storeProducts.find(
            (product) =>
                Number(product.id) ===
                Number(productId)
        ) || null;

    renderExistingStoreImages();
}

async function deleteStoreProduct(id) {
    if (
        !window.confirm(
            "确定删除这个商品吗？"
        )
    ) {
        return;
    }

    try {
        const response = await fetch(
            `${STORE_ADMIN_API}/${id}`,
            {
                method: "DELETE",
                headers: getAdminHeaders(false)
            }
        );

        const result = await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "删除商品失败。"
            );
        }

        await loadStoreProducts();

        showStoreAdminMessage(
            result.message,
            "success"
        );
    } catch (error) {
        console.error(error);

        showStoreAdminMessage(
            error.message,
            "error"
        );
    }
}

function clearStoreFileInputs() {
    const coverInput =
        document.getElementById(
            "storeCoverImagesInput"
        );

    const detailInput =
        document.getElementById(
            "storeDetailImagesInput"
        );

    if (coverInput) {
        coverInput.value = "";
    }

    if (detailInput) {
        detailInput.value = "";
    }
}

function getStoreProductTypeLabel(type) {
    const labels = {
        ebook: "电子书",
        report: "研究报告",
        video: "视频内容",
        membership: "会员服务"
    };

    return labels[type] || type || "未知";
}

function getStoreProductStatusLabel(
    status
) {
    const labels = {
        draft: "草稿",
        published: "已上架",
        unpublished: "已下架"
    };

    return (
        labels[status] ||
        status ||
        "未知"
    );
}

function getValue(id) {
    return String(
        document.getElementById(id)
            ?.value || ""
    ).trim();
}

function setValue(id, value) {
    const element =
        document.getElementById(id);

    if (element) {
        element.value = value;
    }
}

function showStoreAdminMessage(
    message,
    type = "normal"
) {
    const element =
        document.getElementById(
            "storeAdminMessage"
        );

    if (!element) {
        return;
    }

    element.textContent =
        String(message || "");

    element.dataset.type = type;
}

function escapeStoreAdminHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}