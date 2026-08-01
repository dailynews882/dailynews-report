const express =
    require("express");

const Holidays =
    require("date-holidays");

const router =
    express.Router();

const supportedCountries = {
    SG: {
        name: "新加坡",
        language: "zh",
    },
    CN: {
        name: "中国",
        language: "zh",
    },
    US: {
        name: "美国",
        language: "en",
    },
    GB: {
        name: "英国",
        language: "en",
    },
    MY: {
        name: "马来西亚",
        language: "en",
    },
    JP: {
        name: "日本",
        language: "en",
    },
    AU: {
        name: "澳大利亚",
        language: "en",
    },
    CA: {
        name: "加拿大",
        language: "en",
    },
};

function normalizeCountryCode(
    value
) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

function normalizeYear(value) {
    const year =
        Number.parseInt(
            String(value || ""),
            10
        );

    const currentYear =
        new Date().getFullYear();

    if (
        !Number.isInteger(year) ||
        year < currentYear - 5 ||
        year > currentYear + 10
    ) {
        return null;
    }

    return year;
}

function normalizeHolidayDate(
    value
) {
    if (!value) {
        return "";
    }

    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

router.get("/", function (
    req,
    res
) {
    try {
        const countryCode =
            normalizeCountryCode(
                req.query.country
            );

        const year =
            normalizeYear(
                req.query.year
            );

        if (
            !supportedCountries[
            countryCode
            ]
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "暂不支持该国家或地区",
                supportedCountries:
                    Object.keys(
                        supportedCountries
                    ),
            });
        }

        if (!year) {
            return res.status(400).json({
                success: false,
                message:
                    "年份参数无效",
            });
        }

        const countryConfig =
            supportedCountries[
            countryCode
            ];

        const holidays =
            new Holidays(
                countryCode
            );

        holidays.setLanguages([
            countryConfig.language,
            "en",
        ]);

        const holidayList =
            holidays
                .getHolidays(year)
                .filter(function (
                    holiday
                ) {
                    return (
                        holiday.type ===
                        "public"
                    );
                })
                .map(function (
                    holiday
                ) {
                    return {
                        date:
                            normalizeHolidayDate(
                                holiday.start ||
                                holiday.date
                            ),
                        name:
                            String(
                                holiday.name ||
                                ""
                            ).trim(),
                        type:
                            holiday.type,
                        substitute:
                            Boolean(
                                holiday.substitute
                            ),
                    };
                })
                .filter(function (
                    holiday
                ) {
                    return (
                        holiday.date &&
                        holiday.name
                    );
                })
                .sort(function (
                    firstHoliday,
                    secondHoliday
                ) {
                    return firstHoliday.date.localeCompare(
                        secondHoliday.date
                    );
                });

        return res.json({
            success: true,
            country: {
                code:
                    countryCode,
                name:
                    countryConfig.name,
            },
            year,
            data:
                holidayList,
        });
    } catch (error) {
        console.error(
            "Load holidays error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "读取节假日数据失败",
        });
    }
});

router.get(
    "/countries",
    function (req, res) {
        const countries =
            Object.entries(
                supportedCountries
            ).map(function (
                entry
            ) {
                return {
                    code:
                        entry[0],
                    name:
                        entry[1].name,
                };
            });

        return res.json({
            success: true,
            data:
                countries,
        });
    }
);

module.exports =
    router;