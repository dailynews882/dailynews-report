document.addEventListener("DOMContentLoaded", async () => {
    const mapElement = document.getElementById("worldMap");

    if (!mapElement || typeof L === "undefined") {
        return;
    }

    mapElement.innerHTML = "";

    const map = L.map("worldMap", {
        center: [45, 8],
        zoom: 1.55,
        minZoom: 1,
        maxZoom: 6,
        zoomSnap: 0.25,
        zoomDelta: 0.25,
        zoomControl: true,
        attributionControl: false,
        worldCopyJump: true
    });

    map.setMaxBounds([
        [-85, -180],
        [85, 180]
    ]);

    const defaultStyle = {
        color: "#4da7d8",
        weight: 1,
        fillColor: "#184b6b",
        fillOpacity: 0.72
    };

    const hoverStyle = {
        color: "#f2c94c",
        weight: 2,
        fillColor: "#1f87bd",
        fillOpacity: 0.9
    };

    let geoJsonLayer;
    let selectedCountryLayer = null;

    function getCountryName(feature) {
        const properties = feature?.properties || {};

        return (
            properties.NAME_ZH ||
            properties.NAME_EN ||
            properties.ADMIN ||
            properties.NAME ||
            "未知地区"
        );
    }

    function highlightCountry(event) {
        const layer = event.target;
        layer.setStyle(hoverStyle);
        layer.bringToFront();
    }

    function resetCountry(event) {
        if (!geoJsonLayer) {
            return;
        }

        if (event.target === selectedCountryLayer) {
            event.target.setStyle(hoverStyle);
            return;
        }

        geoJsonLayer.resetStyle(event.target);
    }

    function selectCountry(feature, layer) {
        const countryName = getCountryName(feature);

        layer.bindTooltip(countryName, {
            sticky: true,
            direction: "top",
            className: "country-map-tooltip"
        });

        layer.on({
            mouseover: highlightCountry,
            mouseout: resetCountry,
            click: () => {
                const input = document.getElementById("countrySearchInput");

                if (input) {
                    input.value = countryName;
                }

                if (selectedCountryLayer && geoJsonLayer) {
                    geoJsonLayer.resetStyle(selectedCountryLayer);
                }

                selectedCountryLayer = layer;
                selectedCountryLayer.setStyle(hoverStyle);
                selectedCountryLayer.bringToFront();
                selectedCountryLayer.openTooltip();

                map.fitBounds(layer.getBounds(), {
                    padding: [20, 20],
                    maxZoom: 4
                });
            }
        });
    }

    try {
        const response = await fetch("/countries.geojson");

        if (!response.ok) {
            throw new Error(`地图数据加载失败：${response.status}`);
        }

        const geoData = await response.json();

        geoJsonLayer = L.geoJSON(geoData, {
            filter: (feature) => {
                const properties = feature?.properties || {};

                const countryName = String(
                    properties.NAME_EN ||
                    properties.ADMIN ||
                    properties.NAME ||
                    ""
                )
                    .trim()
                    .toLowerCase();

                return countryName !== "antarctica";
            },
            style: defaultStyle,
            onEachFeature: selectCountry
        }).addTo(map);

        map.setView([45, 8], 1.55);

    } catch (error) {
        console.error(error);

        mapElement.innerHTML =
            '<div class="world-map-load-error">世界地图加载失败，请稍后重试。</div>';

        return;
    }

    const searchInput = document.getElementById("countrySearchInput");
    const searchButton = document.getElementById("countrySearchButton");
    const countryButtons = document.querySelectorAll("[data-country]");

    function normalizeText(value) {
        return String(value || "")
            .trim()
            .toLowerCase();
    }

    function findCountry(searchValue) {
        const keyword = normalizeText(searchValue);

        if (!keyword || !geoJsonLayer) {
            return false;
        }

        let matchedLayer = null;
        let partialMatchedLayer = null;

        geoJsonLayer.eachLayer((layer) => {
            const properties = layer.feature?.properties || {};

            const names = [
                properties.NAME_ZH,
                properties.NAME_EN,
                properties.ADMIN,
                properties.NAME,
                properties.SOVEREIGNT,
                properties.FORMAL_EN,
                properties.ISO_A2,
                properties.ISO_A3
            ]
                .filter(Boolean)
                .map(normalizeText);

            if (!matchedLayer && names.some((name) => name === keyword)) {
                matchedLayer = layer;
                return;
            }

            if (
                !partialMatchedLayer &&
                names.some((name) => name.startsWith(keyword))
            ) {
                partialMatchedLayer = layer;
            }
        });

        const targetLayer = matchedLayer || partialMatchedLayer;

        if (!targetLayer) {
            return false;
        }

        map.fitBounds(targetLayer.getBounds(), {
            padding: [20, 20],
            maxZoom: 4
        });

        if (selectedCountryLayer && geoJsonLayer) {
            geoJsonLayer.resetStyle(selectedCountryLayer);
        }

        selectedCountryLayer = targetLayer;
        selectedCountryLayer.setStyle(hoverStyle);
        selectedCountryLayer.bringToFront();
        selectedCountryLayer.openTooltip();

        return true;
    }

    function runSearch() {
        if (!searchInput) {
            return;
        }

        const found = findCountry(searchInput.value);

        if (!found) {
            searchInput.setCustomValidity("没有找到该国家或地区");
            searchInput.reportValidity();
            return;
        }

        searchInput.setCustomValidity("");
    }

    if (searchButton) {
        searchButton.addEventListener("click", runSearch);
    }

    if (searchInput) {
        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                runSearch();
            }
        });

        searchInput.addEventListener("input", () => {
            searchInput.setCustomValidity("");
        });
    }

    countryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const country = button.dataset.country || "";

            if (searchInput) {
                searchInput.value = button.textContent.trim();
            }

            findCountry(country);
        });
    });

    window.setTimeout(() => {
        map.invalidateSize();
    }, 200);
});