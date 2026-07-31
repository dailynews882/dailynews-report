const adminAdForm =
    document.getElementById("adminAdForm");

const adminAdImageInput =
    document.getElementById("adminAdImage");

const adminAdPreviewImage =
    document.getElementById("adminAdPreviewImage");

const adminAdPreviewEmpty =
    document.getElementById("adminAdPreviewEmpty");

const adminAdResetButton =
    document.getElementById("adminAdResetButton");

const adminAdSubmitButton =
    document.getElementById("adminAdSubmitButton");

const adminAdFormMessage =
    document.getElementById("adminAdFormMessage");

const refreshAdminAdsButton =
    document.getElementById("refreshAdminAdsButton");

const adminAdsListMessage =
    document.getElementById("adminAdsListMessage");

let currentPreviewUrl = "";
let adminAdsRecords = [];

document.addEventListener("DOMContentLoaded", function () {
    bindAdminAdsPageEvents();

    loadAdminAds();

    setAdminAdFormMessage(
        "广告管理表单已准备完成，下一步接入后台接口。",
        "normal"
    );
}
);

function bindAdminAdsPageEvents() {
    if (adminAdImageInput) {
        adminAdImageInput.addEventListener(
            "change",
            handleAdminAdImageChange
        );
    }

    if (adminAdResetButton) {
        adminAdResetButton.addEventListener(
            "click",
            resetAdminAdForm
        );
    }

    if (adminAdForm) {
        adminAdForm.addEventListener(
            "submit",
            handleAdminAdFormSubmit
        );
    }

    if (refreshAdminAdsButton) {
        refreshAdminAdsButton.addEventListener(
            "click",
            loadAdminAds
        );
    }

}
function handleAdminAdImageChange(event) {
    const input = event.target;
    const file =
        input.files && input.files[0]
            ? input.files[0]
            : null;

    clearAdminAdPreviewUrl();

    if (!file) {
        hideAdminAdPreview();
        return;
    }

    const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
        input.value = "";
        hideAdminAdPreview();

        setAdminAdFormMessage(
            "请选择PNG、JPG、JPEG或WebP格式的图片。",
            "error"
        );
        return;
    }

    const maximumFileSize =
        5 * 1024 * 1024;

    if (file.size > maximumFileSize) {
        input.value = "";
        hideAdminAdPreview();

        setAdminAdFormMessage(
            "广告图片不能超过5MB。",
            "error"
        );
        return;
    }

    currentPreviewUrl =
        URL.createObjectURL(file);

    if (adminAdPreviewImage) {
        adminAdPreviewImage.src =
            currentPreviewUrl;

        adminAdPreviewImage.hidden =
            false;
    }

    if (adminAdPreviewEmpty) {
        adminAdPreviewEmpty.hidden =
            true;
    }

    setAdminAdFormMessage(
        `已选择图片：${file.name}`,
        "success"
    );
}

function hideAdminAdPreview() {
    if (adminAdPreviewImage) {
        adminAdPreviewImage.removeAttribute(
            "src"
        );

        adminAdPreviewImage.hidden =
            true;
    }

    if (adminAdPreviewEmpty) {
        adminAdPreviewEmpty.hidden =
            false;
    }
}

function clearAdminAdPreviewUrl() {
    if (currentPreviewUrl) {
        URL.revokeObjectURL(
            currentPreviewUrl
        );

        currentPreviewUrl = "";
    }
}

function resetAdminAdForm() {
    if (adminAdForm) {
        adminAdForm.reset();
    }

    const activeCheckbox =
        document.getElementById(
            "adminAdActive"
        );

    if (activeCheckbox) {
        activeCheckbox.checked = true;
    }

    clearAdminAdPreviewUrl();
    hideAdminAdPreview();

    setAdminAdFormMessage(
        "广告表单已经清空。",
        "normal"
    );
}

async function handleAdminAdFormSubmit(event) {
    event.preventDefault();

    const titleInput =
        document.getElementById(
            "adminAdTitle"
        );

    const targetUrlInput =
        document.getElementById(
            "adminAdTargetUrl"
        );

    const contentInput =
        document.getElementById(
            "adminAdContent"
        );

    const sortOrderInput =
        document.getElementById(
            "adminAdSortOrder"
        );

    const activeInput =
        document.getElementById(
            "adminAdActive"
        );

    const newTabInput =
        document.getElementById(
            "adminAdNewTab"
        );

    const title =
        titleInput
            ? titleInput.value.trim()
            : "";

    const targetUrl =
        targetUrlInput
            ? targetUrlInput.value.trim()
            : "";

    const content =
        contentInput
            ? contentInput.value.trim()
            : "";

    const imageFile =
        adminAdImageInput &&
            adminAdImageInput.files
            ? adminAdImageInput.files[0]
            : null;

    if (!title) {
        setAdminAdFormMessage(
            "请输入广告标题。",
            "error"
        );
        return;
    }

    if (!targetUrl) {
        setAdminAdFormMessage(
            "请输入广告跳转链接。",
            "error"
        );
        return;
    }

    if (!imageFile) {
        setAdminAdFormMessage(
            "请选择广告图片。",
            "error"
        );
        return;
    }

    const formData = new FormData();

    formData.append(
        "title",
        title
    );

    formData.append(
        "content",
        content
    );

    formData.append(
        "target_url",
        targetUrl
    );

    formData.append(
        "sort_order",
        sortOrderInput
            ? sortOrderInput.value
            : "1"
    );

    formData.append(
        "is_active",
        activeInput &&
            activeInput.checked
            ? "1"
            : "0"
    );

    formData.append(
        "open_new_tab",
        newTabInput &&
            newTabInput.checked
            ? "1"
            : "0"
    );

    formData.append(
        "image",
        imageFile
    );

    if (adminAdSubmitButton) {
        adminAdSubmitButton.disabled =
            true;

        adminAdSubmitButton.textContent =
            "正在上传...";
    }

    setAdminAdFormMessage(
        "正在上传并保存广告...",
        "normal"
    );

    try {
        const token =
            localStorage.getItem(
                "adminToken"
            );

        if (!token) {
            throw new Error(
                "管理员登录已失效，请重新登录"
            );
        }

        const response = await fetch(
            "/api/site-ads/admin",
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${token}`,
                },
                body: formData,
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
                "广告上传失败"
            );
        }

        setAdminAdFormMessage(
            "广告上传成功。",
            "success"
        );

        resetAdminAdForm();

        await loadAdminAds();
    } catch (error) {
        console.error(
            "Create advertisement error:",
            error
        );

        setAdminAdFormMessage(
            error.message ||
            "广告上传失败",
            "error"
        );
    } finally {
        if (adminAdSubmitButton) {
            adminAdSubmitButton.disabled =
                false;

            adminAdSubmitButton.textContent =
                "上传并新增广告";
        }
    }
}

function setAdminAdFormMessage(
    message,
    type = "normal"
) {
    if (!adminAdFormMessage) {
        return;
    }

    adminAdFormMessage.textContent =
        message || "";

    if (type === "normal") {
        delete adminAdFormMessage.dataset.type;
        return;
    }

    adminAdFormMessage.dataset.type =
        type;
}

function setAdminAdsListMessage(
    message,
    type = "normal"
) {
    if (!adminAdsListMessage) {
        return;
    }

    adminAdsListMessage.textContent =
        message || "";

    if (type === "normal") {
        delete adminAdsListMessage.dataset.type;
        return;
    }

    adminAdsListMessage.dataset.type =
        type;
}

async function loadAdminAds() {
    const tableBody =
        document.getElementById(
            "adminAdsTableBody"
        );

    if (!tableBody) {
        return;
    }

    setAdminAdsListMessage(
        "正在读取广告列表...",
        "normal"
    );

    try {
        const token =
            localStorage.getItem(
                "adminToken"
            );

        if (!token) {
            throw new Error(
                "管理员登录已失效，请重新登录"
            );
        }

        const response = await fetch(
            "/api/site-ads/admin",
            {
                method: "GET",
                headers: {
                    Accept:
                        "application/json",
                    Authorization:
                        `Bearer ${token}`,
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
                "读取广告列表失败"
            );
        }

        const ads =
            Array.isArray(result.data)
                ? result.data
                : [];

        adminAdsRecords = ads;

        renderAdminAdsTable(ads);

        setAdminAdsListMessage(
            ads.length
                ? `共读取到 ${ads.length} 条广告。`
                : "暂无广告数据。",
            ads.length
                ? "success"
                : "normal"
        );
    } catch (error) {
        console.error(
            "Load advertisements error:",
            error
        );

        tableBody.innerHTML = `
        <tr>
        <td>
        <div class="admin-ad-table-actions">
          <button
            type="button"
            class="table-btn"
            onclick="previewAdminAd(${Number(ad.id)})"
          >
            预览
          </button>
      
          <button
            type="button"
            class="table-btn"
            onclick="editAdminAd(${Number(ad.id)})"
          >
            编辑
          </button>
      
          <button
            type="button"
            class="table-btn ${active ? "warning" : "publish"
            }"
            onclick="toggleAdminAdStatus(
              ${Number(ad.id)},
              ${active ? 0 : 1}
            )"
          >
            ${active ? "停用" : "发布"}
          </button>
      
          <button
            type="button"
            class="table-btn danger"
            onclick="deleteAdminAd(${Number(ad.id)})"
          >
            删除
          </button>
        </div>
      </td>
        </tr>
      `;

        setAdminAdsListMessage(
            error.message ||
            "读取广告列表失败",
            "error"
        );
    }
}

function renderAdminAdsTable(ads) {
    const tableBody =
        document.getElementById(
            "adminAdsTableBody"
        );

    if (!tableBody) {
        return;
    }

    if (!ads.length) {
        tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            暂无广告数据
          </td>
        </tr>
      `;
        return;
    }

    tableBody.innerHTML =
        ads
            .map(function (ad) {
                const active =
                    Number(ad.is_active) === 1;

                const newTab =
                    Number(ad.open_new_tab) === 1;

                return `
            <tr>
              <td>${Number(ad.id)}</td>
  
              <td>
                <img
                  class="admin-ad-table-image"
                  src="${escapeAdminAdHtml(
                    ad.image_url
                )}"
                  alt="${escapeAdminAdHtml(
                    ad.title
                )}"
                />
              </td>
  
              <td>
                ${escapeAdminAdHtml(
                    ad.title
                )}
              </td>
  
              <td>
                <a
                  class="admin-ad-link"
                  href="${escapeAdminAdHtml(
                    ad.target_url
                )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${escapeAdminAdHtml(
                    ad.target_url
                )}
                </a>
              </td>
  
              <td>
                第${Number(
                    ad.sort_order
                )}张
              </td>
  
              <td>
                <span
                  class="admin-ad-status ${active
                        ? "is-active"
                        : "is-inactive"
                    }"
                >
                  ${active
                        ? "已发布"
                        : "已停用"
                    }
                </span>
              </td>
  
              <td>
                ${newTab
                        ? "新窗口"
                        : "当前窗口"
                    }
              </td>
  
              <td>
              <div class="admin-ad-table-actions">
                <button
                  type="button"
                  class="table-btn"
                  onclick="previewAdminAd(${Number(ad.id)})"
                >
                  预览
                </button>
            
                <button
                  type="button"
                  class="table-btn"
                  onclick="editAdminAd(${Number(ad.id)})"
                >
                  编辑
                </button>
            
                <button
                  type="button"
                  class="table-btn ${active ? "warning" : "publish"
                    }"
                  onclick="toggleAdminAdStatus(${Number(ad.id)}, ${active ? 0 : 1
                    })"
                >
                  ${active ? "停用" : "发布"}
                </button>
            
                <button
                  type="button"
                  class="table-btn danger"
                  onclick="deleteAdminAd(${Number(ad.id)})"
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

window.editAdminAd = function (adId) {
    const ad = adminAdsRecords.find(
        function (item) {
            return Number(item.id) === Number(adId);
        }
    );

    if (!ad) {
        alert("没有找到这条广告。");
        return;
    }

    let editModal =
        document.getElementById("adminAdEditModal");

    if (!editModal) {
        editModal = document.createElement("div");
        editModal.id = "adminAdEditModal";
        editModal.className = "admin-ad-modal";
        document.body.appendChild(editModal);
    }

    editModal.innerHTML = `
      <div class="admin-ad-modal-card">
        <div class="admin-ad-modal-header">
          <h2>编辑广告</h2>
  
          <button
            type="button"
            class="admin-ad-modal-close"
            onclick="closeAdminAdEditModal()"
            aria-label="关闭编辑广告"
          >
            ×
          </button>
        </div>
  
        <form
          id="adminAdEditForm"
          class="admin-ad-modal-body"
          enctype="multipart/form-data"
        >
          <input
            type="hidden"
            id="editAdminAdId"
            value="${Number(ad.id)}"
          />
  
          <div class="admin-ad-edit-grid">
            <div class="form-group">
              <label for="editAdminAdTitle">
                广告标题
              </label>
  
              <input
                type="text"
                id="editAdminAdTitle"
                maxlength="100"
                value="${escapeAdminAdHtml(ad.title)}"
                required
              />
            </div>
  
            <div class="form-group">
              <label for="editAdminAdTargetUrl">
                跳转链接
              </label>
  
              <input
                type="text"
                id="editAdminAdTargetUrl"
                maxlength="500"
                value="${escapeAdminAdHtml(ad.target_url)}"
                required
              />
            </div>
  
            <div class="form-group">
              <label for="editAdminAdSortOrder">
                显示顺序
              </label>
  
              <select id="editAdminAdSortOrder">
                ${[1, 2, 3, 4, 5]
            .map(function (position) {
                return `
                      <option
                        value="${position}"
                        ${Number(ad.sort_order) === position
                        ? "selected"
                        : ""
                    }
                      >
                        第${position}张
                      </option>
                    `;
            })
            .join("")}
              </select>
            </div>
  
            <div class="form-group">
              <label for="editAdminAdImage">
                替换广告图片
              </label>
  
              <input
                type="file"
                id="editAdminAdImage"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              />
  
              <small>
                不选择新图片时，将保留当前图片。
              </small>
            </div>
          </div>
  
          <div class="admin-ad-preview-panel">
            <span class="admin-ad-preview-label">
              当前广告图片
            </span>
  
            <div class="admin-ad-preview-stage">
              <img
                id="editAdminAdPreviewImage"
                class="admin-ad-preview-image"
                src="${escapeAdminAdHtml(ad.image_url)}"
                alt="${escapeAdminAdHtml(ad.title)}"
              />
            </div>
          </div>
  
          <div class="form-group admin-ad-content-group">
            <label for="editAdminAdContent">
              广告文字内容
            </label>
  
            <textarea
              id="editAdminAdContent"
              rows="6"
              maxlength="1000"
              placeholder="请输入广告宣传文字、说明内容或活动介绍"
            >${escapeAdminAdHtml(ad.content || "")}</textarea>
  
            <small>
              最多1000个字符。
            </small>
          </div>
  
          <div class="admin-ad-options">
            <label class="admin-ad-checkbox">
              <input
                type="checkbox"
                id="editAdminAdActive"
                ${Number(ad.is_active) === 1
            ? "checked"
            : ""
        }
              />
              <span>发布广告</span>
            </label>
  
            <label class="admin-ad-checkbox">
              <input
                type="checkbox"
                id="editAdminAdNewTab"
                ${Number(ad.open_new_tab) === 1
            ? "checked"
            : ""
        }
              />
              <span>在新窗口打开</span>
            </label>
          </div>
  
          <div class="admin-ad-action-row">
            <button
              type="submit"
              id="saveAdminAdEditButton"
              class="small-btn"
            >
              保存修改
            </button>
  
            <button
              type="button"
              class="small-btn ad-secondary-button"
              onclick="closeAdminAdEditModal()"
            >
              取消
            </button>
          </div>
  
          <div
            id="adminAdEditMessage"
            class="admin-ad-message"
            aria-live="polite"
          >
            编辑内容后点击“保存修改”。
          </div>
        </form>
      </div>
    `;

    editModal.style.display = "flex";

    const editImageInput =
        document.getElementById("editAdminAdImage");

    if (editImageInput) {
        editImageInput.addEventListener(
            "change",
            handleAdminAdEditImageChange
        );
    }

    const editForm =
        document.getElementById("adminAdEditForm");

    if (editForm) {
        editForm.addEventListener(
            "submit",
            handleAdminAdEditSubmit
        );
    }
};

window.closeAdminAdEditModal = function () {
    const editModal =
        document.getElementById("adminAdEditModal");

    if (editModal) {
        editModal.style.display = "none";
    }
};

window.previewAdminAd = function (adId) {
    const ad = adminAdsRecords.find(
        function (item) {
            return (
                Number(item.id) ===
                Number(adId)
            );
        }
    );

    if (!ad) {
        alert("没有找到这条广告。");
        return;
    }

    let previewModal =
        document.getElementById(
            "adminAdPreviewModal"
        );

    if (!previewModal) {
        previewModal =
            document.createElement("div");

        previewModal.id =
            "adminAdPreviewModal";

        previewModal.className =
            "admin-ad-modal";

        document.body.appendChild(
            previewModal
        );
    }

    previewModal.innerHTML = `
      <div class="admin-ad-modal-card">
        <div class="admin-ad-modal-header">
          <h2>广告预览</h2>
  
          <button
            type="button"
            class="admin-ad-modal-close"
            onclick="closeAdminAdPreview()"
            aria-label="关闭广告预览"
          >
            ×
          </button>
        </div>
  
        <div class="admin-ad-modal-body">
          <img
            class="admin-ad-modal-image"
            src="${escapeAdminAdHtml(
        ad.image_url
    )}"
            alt="${escapeAdminAdHtml(
        ad.title
    )}"
          />
  
          <p>
            <strong>广告标题：</strong>
            ${escapeAdminAdHtml(
        ad.title
    )}
          </p>

          <p>
          <strong>广告文字内容：</strong>
        </p>

        <div class="admin-ad-modal-content">
          ${escapeAdminAdHtml(
        ad.content || "暂无广告文字内容"
    )
        }
        </div>  
  
          <p>
            <strong>跳转链接：</strong>
            <a
              href="${escapeAdminAdHtml(
            ad.target_url
        )}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${escapeAdminAdHtml(
            ad.target_url
        )}
            </a>
          </p>
  
          <p>
            <strong>显示顺序：</strong>
            第${Number(
            ad.sort_order
        )}张
          </p>
  
          <p>
            <strong>当前状态：</strong>
            ${Number(ad.is_active) === 1
            ? "已发布"
            : "已停用"
        }
          </p>
        </div>
      </div>
    `;

    previewModal.style.display =
        "flex";
};

window.closeAdminAdPreview =
    function () {
        const previewModal =
            document.getElementById(
                "adminAdPreviewModal"
            );

        if (previewModal) {
            previewModal.style.display =
                "none";
        }
    };

function handleAdminAdEditImageChange(event) {
    const file =
        event.target.files &&
            event.target.files[0]
            ? event.target.files[0]
            : null;

    if (!file) {
        return;
    }

    const previewImage =
        document.getElementById(
            "editAdminAdPreviewImage"
        );

    if (!previewImage) {
        return;
    }

    previewImage.src =
        URL.createObjectURL(file);
}

async function handleAdminAdEditSubmit(event) {
    event.preventDefault();

    const adIdInput =
        document.getElementById(
            "editAdminAdId"
        );

    const titleInput =
        document.getElementById(
            "editAdminAdTitle"
        );

    const targetUrlInput =
        document.getElementById(
            "editAdminAdTargetUrl"
        );

    const sortOrderInput =
        document.getElementById(
            "editAdminAdSortOrder"
        );

    const imageInput =
        document.getElementById(
            "editAdminAdImage"
        );

    const contentInput =
        document.getElementById(
            "editAdminAdContent"
        );

    const activeInput =
        document.getElementById(
            "editAdminAdActive"
        );

    const newTabInput =
        document.getElementById(
            "editAdminAdNewTab"
        );

    const saveButton =
        document.getElementById(
            "saveAdminAdEditButton"
        );

    const messageBox =
        document.getElementById(
            "adminAdEditMessage"
        );

    const adId =
        adIdInput
            ? adIdInput.value
            : "";

    const title =
        titleInput
            ? titleInput.value.trim()
            : "";

    const targetUrl =
        targetUrlInput
            ? targetUrlInput.value.trim()
            : "";

    const content =
        contentInput
            ? contentInput.value.trim()
            : "";

    if (!adId) {
        setAdminAdEditMessage(
            messageBox,
            "无法读取当前广告ID。",
            "error"
        );
        return;
    }

    if (!title) {
        setAdminAdEditMessage(
            messageBox,
            "请输入广告标题。",
            "error"
        );
        return;
    }

    if (!targetUrl) {
        setAdminAdEditMessage(
            messageBox,
            "请输入广告跳转链接。",
            "error"
        );
        return;
    }

    const formData =
        new FormData();

    formData.append(
        "title",
        title
    );

    formData.append(
        "content",
        content
    );

    formData.append(
        "target_url",
        targetUrl
    );

    formData.append(
        "sort_order",
        sortOrderInput
            ? sortOrderInput.value
            : "1"
    );

    formData.append(
        "is_active",
        activeInput &&
            activeInput.checked
            ? "1"
            : "0"
    );

    formData.append(
        "open_new_tab",
        newTabInput &&
            newTabInput.checked
            ? "1"
            : "0"
    );

    const replacementImage =
        imageInput &&
            imageInput.files
            ? imageInput.files[0]
            : null;

    if (replacementImage) {
        formData.append(
            "image",
            replacementImage
        );
    }

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent =
            "正在保存...";
    }

    setAdminAdEditMessage(
        messageBox,
        "正在保存广告修改...",
        "normal"
    );

    try {
        const token =
            localStorage.getItem(
                "adminToken"
            );

        if (!token) {
            throw new Error(
                "管理员登录已失效，请重新登录"
            );
        }

        const response =
            await fetch(
                `/api/site-ads/admin/${encodeURIComponent(
                    adId
                )}`,
                {
                    method: "PUT",
                    headers: {
                        Accept:
                            "application/json",
                        Authorization:
                            `Bearer ${token}`,
                    },
                    body: formData,
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
                "保存广告修改失败"
            );
        }

        setAdminAdEditMessage(
            messageBox,
            "广告修改保存成功。",
            "success"
        );

        await loadAdminAds();

        setTimeout(function () {
            window.closeAdminAdEditModal();
        }, 800);
    } catch (error) {
        console.error(
            "Update advertisement error:",
            error
        );

        setAdminAdEditMessage(
            messageBox,
            error.message ||
            "保存广告修改失败",
            "error"
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent =
                "保存修改";
        }
    }
}

function setAdminAdEditMessage(
    messageBox,
    message,
    type = "normal"
) {
    if (!messageBox) {
        return;
    }

    messageBox.textContent =
        message || "";

    if (type === "normal") {
        delete messageBox.dataset.type;
        return;
    }

    messageBox.dataset.type =
        type;
}

window.toggleAdminAdStatus = async function (
    adId,
    nextStatus
) {
    const shouldEnable =
        Number(nextStatus) === 1;

    const confirmed = confirm(
        shouldEnable
            ? "确定要发布这条广告吗？"
            : "确定要停用这条广告吗？"
    );

    if (!confirmed) {
        return;
    }

    try {
        const token =
            localStorage.getItem(
                "adminToken"
            );

        if (!token) {
            throw new Error(
                "管理员登录已失效，请重新登录"
            );
        }

        const response = await fetch(
            `/api/site-ads/admin/${encodeURIComponent(
                adId
            )}/status`,
            {
                method: "PATCH",
                headers: {
                    Accept:
                        "application/json",
                    "Content-Type":
                        "application/json",
                    Authorization:
                        `Bearer ${token}`,
                },
                body: JSON.stringify({
                    is_active: shouldEnable
                        ? 1
                        : 0,
                }),
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
                "修改广告状态失败"
            );
        }

        setAdminAdsListMessage(
            shouldEnable
                ? "广告发布成功。"
                : "广告已经停用。",
            "success"
        );

        await loadAdminAds();
    } catch (error) {
        console.error(
            "Update advertisement status error:",
            error
        );

        setAdminAdsListMessage(
            error.message ||
            "修改广告状态失败",
            "error"
        );
    }
};

function escapeAdminAdHtml(value) {
    return String(
        value ?? ""
    )
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.addEventListener(
    "beforeunload",
    clearAdminAdPreviewUrl
);