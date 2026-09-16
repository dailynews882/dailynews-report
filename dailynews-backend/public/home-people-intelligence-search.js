document.addEventListener(
    "DOMContentLoaded",
    function () {
        initializePeopleIntelligenceSearch();
    }
);

function initializePeopleIntelligenceSearch() {
    const form =
        document.getElementById(
            "peopleIntelligenceSearchForm"
        );

    const input =
        document.getElementById(
            "peopleIntelligenceSearchInput"
        );

    const hotButtons =
        document.querySelectorAll(
            "[data-people-query]"
        );

    if (!form || !input) {
        return;
    }

    form.addEventListener(
        "submit",
        function (event) {
            event.preventDefault();

            submitPeopleIntelligenceSearch(
                input.value
            );
        }
    );

    hotButtons.forEach(function (button) {
        button.addEventListener(
            "click",
            function () {
                const query =
                    button.dataset.peopleQuery || "";

                input.value = query;

                submitPeopleIntelligenceSearch(
                    query
                );
            }
        );
    });
}

function submitPeopleIntelligenceSearch(
    rawQuery
) {
    const query =
        String(rawQuery || "").trim();

    if (!query) {
        const input =
            document.getElementById(
                "peopleIntelligenceSearchInput"
            );

        if (input) {
            input.focus();
        }

        return;
    }

    const targetUrl =
        new URL(
            "/people-intelligence.html",
            window.location.origin
        );

    targetUrl.searchParams.set(
        "q",
        query
    );

    window.open(
        targetUrl.pathname +
        targetUrl.search,
        "_blank",
        "noopener,noreferrer"
    );
}