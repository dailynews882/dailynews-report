const PUBLIC_SITE_LOGO_API = "/api/site-settings/logo";

function showDefaultSiteLogo() {
    const imageLogo = document.getElementById("siteHeaderLogo");
    const defaultLogo = document.getElementById(
        "siteHeaderDefaultLogo"
    );

    if (!imageLogo || !defaultLogo) {
        return;
    }

    imageLogo.removeAttribute("src");
    imageLogo.hidden = true;
    defaultLogo.hidden = false;
}

function showUploadedSiteLogo(logoUrl) {
    const imageLogo = document.getElementById("siteHeaderLogo");
    const defaultLogo = document.getElementById(
        "siteHeaderDefaultLogo"
    );

    if (!imageLogo || !defaultLogo || !logoUrl) {
        showDefaultSiteLogo();
        return;
    }

    imageLogo.onload = () => {
        imageLogo.hidden = false;
        defaultLogo.hidden = true;
    };

    imageLogo.onerror = () => {
        console.error("Site LOGO image failed to load:", logoUrl);
        showDefaultSiteLogo();
    };

    imageLogo.src = `${logoUrl}?v=${Date.now()}`;
}

async function loadSiteLogo() {
    try {
        const response = await fetch(PUBLIC_SITE_LOGO_API, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "读取网站 LOGO 失败。"
            );
        }

        if (result.logoUrl) {
            showUploadedSiteLogo(result.logoUrl);
            return;
        }

        showDefaultSiteLogo();
    } catch (error) {
        console.error("Load site LOGO error:", error);
        showDefaultSiteLogo();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadSiteLogo();
});