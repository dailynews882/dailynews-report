document.addEventListener(
    "DOMContentLoaded",
    function () {
        initializeHomeCalendar();
    }
);

async function initializeHomeCalendar() {
    const currentDateElement =
        document.getElementById(
            "calendarCurrentDate"
        );

    const currentWeekdayElement =
        document.getElementById(
            "calendarCurrentWeekday"
        );

    const monthTitleElement =
        document.getElementById(
            "calendarMonthTitle"
        );

    const calendarDaysElement =
        document.getElementById(
            "calendarDays"
        );

    const previousMonthButton =
        document.getElementById(
            "calendarPreviousMonth"
        );

    const nextMonthButton =
        document.getElementById(
            "calendarNextMonth"
        );

    const todayButton =
        document.getElementById(
            "calendarTodayButton"
        );

    const countrySelect =
        document.getElementById(
            "calendarCountrySelect"
        );

    const holidayStatusElement =
        document.getElementById(
            "calendarHolidayStatus"
        );

    if (
        !currentDateElement ||
        !currentWeekdayElement ||
        !monthTitleElement ||
        !calendarDaysElement ||
        !previousMonthButton ||
        !nextMonthButton ||
        !todayButton ||
        !countrySelect ||
        !holidayStatusElement
    ) {
        return;
    }

    const today = new Date();

    let displayedYear =
        today.getFullYear();

    let displayedMonth =
        today.getMonth();

    let selectedCountry =
        String(
            countrySelect.value || "SG"
        ).toUpperCase();

    let holidayMap =
        new Map();

    let latestRequestNumber = 0;

    const holidayCache =
        new Map();

    const weekdayNames = [
        "星期日",
        "星期一",
        "星期二",
        "星期三",
        "星期四",
        "星期五",
        "星期六",
    ];

    const lunarFormatter =
        new Intl.DateTimeFormat(
            "zh-CN-u-ca-chinese",
            {
                month: "long",
                day: "numeric",
            }
        );

    function formatNumber(value) {
        return String(value).padStart(
            2,
            "0"
        );
    }

    function formatDateKey(date) {
        return (
            `${date.getFullYear()}-` +
            `${formatNumber(
                date.getMonth() + 1
            )}-` +
            `${formatNumber(
                date.getDate()
            )}`
        );
    }

    function updateTodaySummary() {
        currentDateElement.textContent =
            `${today.getFullYear()}年` +
            `${formatNumber(
                today.getMonth() + 1
            )}月` +
            `${formatNumber(
                today.getDate()
            )}日`;

        currentWeekdayElement.textContent =
            weekdayNames[
            today.getDay()
            ];
    }

    function setHolidayStatus(
        message,
        type = "normal"
    ) {
        holidayStatusElement.textContent =
            String(message || "");

        holidayStatusElement.classList.toggle(
            "is-error",
            type === "error"
        );
    }

    function normalizeLunarDayText(
        value
    ) {
        const text =
            String(value || "").trim();

        const lunarDayMap = {
            "1": "初一",
            "2": "初二",
            "3": "初三",
            "4": "初四",
            "5": "初五",
            "6": "初六",
            "7": "初七",
            "8": "初八",
            "9": "初九",
            "10": "初十",
            "11": "十一",
            "12": "十二",
            "13": "十三",
            "14": "十四",
            "15": "十五",
            "16": "十六",
            "17": "十七",
            "18": "十八",
            "19": "十九",
            "20": "二十",
            "21": "廿一",
            "22": "廿二",
            "23": "廿三",
            "24": "廿四",
            "25": "廿五",
            "26": "廿六",
            "27": "廿七",
            "28": "廿八",
            "29": "廿九",
            "30": "三十",
        };

        if (lunarDayMap[text]) {
            return lunarDayMap[text];
        }

        const normalizedTextMap = {
            "一": "初一",
            "二": "初二",
            "三": "初三",
            "四": "初四",
            "五": "初五",
            "六": "初六",
            "七": "初七",
            "八": "初八",
            "九": "初九",
            "十": "初十",
            "二十一": "廿一",
            "二十二": "廿二",
            "二十三": "廿三",
            "二十四": "廿四",
            "二十五": "廿五",
            "二十六": "廿六",
            "二十七": "廿七",
            "二十八": "廿八",
            "二十九": "廿九",
            "三十": "三十",
        };

        return (
            normalizedTextMap[text] ||
            text ||
            "--"
        );
    }

    function getLunarDateInfo(date) {
        try {
            const parts =
                lunarFormatter.formatToParts(
                    date
                );

            const monthPart =
                parts.find(function (part) {
                    return (
                        part.type === "month"
                    );
                });

            const dayPart =
                parts.find(function (part) {
                    return (
                        part.type === "day"
                    );
                });

            const lunarMonth =
                monthPart
                    ? String(
                        monthPart.value
                    ).trim()
                    : "";

            const lunarDay =
                normalizeLunarDayText(
                    dayPart
                        ? dayPart.value
                        : ""
                );

            return {
                month: lunarMonth,
                day: lunarDay,
                displayText:
                    lunarDay === "初一" &&
                        lunarMonth
                        ? lunarMonth
                        : lunarDay,
            };
        } catch (error) {
            console.error(
                "Convert lunar date error:",
                error
            );

            return {
                month: "",
                day: "",
                displayText: "--",
            };
        }
    }

    function shortenHolidayName(name) {
        const text =
            String(name || "").trim();

        if (text.length <= 8) {
            return text;
        }

        return (
            text.slice(0, 7) + "…"
        );
    }

    function createHolidayMap(
        holidayList
    ) {
        const result =
            new Map();

        holidayList.forEach(function (
            holiday
        ) {
            const dateKey =
                String(
                    holiday.date || ""
                ).trim();

            if (!dateKey) {
                return;
            }

            if (!result.has(dateKey)) {
                result.set(
                    dateKey,
                    []
                );
            }

            result
                .get(dateKey)
                .push(holiday);
        });

        return result;
    }

    async function loadHolidayList(
        countryCode,
        year
    ) {
        const cacheKey =
            `${countryCode}-${year}`;

        if (
            holidayCache.has(cacheKey)
        ) {
            return holidayCache.get(
                cacheKey
            );
        }

        const response =
            await fetch(
                `/api/holidays?country=` +
                `${encodeURIComponent(
                    countryCode
                )}&year=` +
                `${encodeURIComponent(
                    year
                )}`,
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
                "读取节假日失败"
            );
        }

        const holidayList =
            Array.isArray(result.data)
                ? result.data
                : [];

        holidayCache.set(
            cacheKey,
            holidayList
        );

        return holidayList;
    }

    function createCalendarDay(
        date,
        options = {}
    ) {
        const dayElement =
            document.createElement("div");

        dayElement.className =
            "calendar-day";

        const solarDayElement =
            document.createElement(
                "strong"
            );

        solarDayElement.className =
            "calendar-solar-day";

        solarDayElement.textContent =
            String(date.getDate());

        const lunarInfo =
            getLunarDateInfo(date);

        const dateKey =
            formatDateKey(date);

        const holidays =
            holidayMap.get(dateKey) ||
            [];

        const lunarDayElement =
            document.createElement("span");

        lunarDayElement.className =
            "calendar-lunar-day";

        if (holidays.length > 0) {
            lunarDayElement.textContent =
                shortenHolidayName(
                    holidays[0].name
                );

            dayElement.classList.add(
                "is-holiday"
            );

            const hasSubstitute =
                holidays.some(function (
                    holiday
                ) {
                    return Boolean(
                        holiday.substitute
                    );
                });

            if (hasSubstitute) {
                dayElement.classList.add(
                    "is-substitute-holiday"
                );
            }
        } else {
            lunarDayElement.textContent =
                lunarInfo.displayText;
        }

        dayElement.appendChild(
            solarDayElement
        );

        dayElement.appendChild(
            lunarDayElement
        );

        const holidayNames =
            holidays
                .map(function (holiday) {
                    return holiday.name;
                })
                .join("、");

        let ariaLabel =
            `${date.getFullYear()}年` +
            `${date.getMonth() + 1}月` +
            `${date.getDate()}日，农历` +
            `${lunarInfo.month}` +
            `${lunarInfo.day}`;

        if (holidayNames) {
            ariaLabel +=
                `，${holidayNames}`;
        }

        dayElement.setAttribute(
            "aria-label",
            ariaLabel
        );

        dayElement.title =
            holidayNames
                ? holidayNames
                : `农历${lunarInfo.month}${lunarInfo.day}`;

        if (options.isOutside) {
            dayElement.classList.add(
                "is-outside"
            );
        }

        const isToday =
            date.getFullYear() ===
            today.getFullYear() &&
            date.getMonth() ===
            today.getMonth() &&
            date.getDate() ===
            today.getDate();

        if (isToday) {
            dayElement.classList.add(
                "is-today"
            );

            dayElement.setAttribute(
                "aria-current",
                "date"
            );
        }

        return dayElement;
    }

    function renderCalendar() {
        monthTitleElement.textContent =
            `${displayedYear}年` +
            `${displayedMonth + 1}月`;

        calendarDaysElement.innerHTML =
            "";

        const firstDayOfMonth =
            new Date(
                displayedYear,
                displayedMonth,
                1
            );

        const lastDayOfMonth =
            new Date(
                displayedYear,
                displayedMonth + 1,
                0
            );

        const previousMonthLastDay =
            new Date(
                displayedYear,
                displayedMonth,
                0
            );

        const leadingDays =
            firstDayOfMonth.getDay();

        const daysInMonth =
            lastDayOfMonth.getDate();

        for (
            let index =
                leadingDays - 1;
            index >= 0;
            index -= 1
        ) {
            const date =
                new Date(
                    displayedYear,
                    displayedMonth - 1,
                    previousMonthLastDay.getDate() -
                    index
                );

            calendarDaysElement.appendChild(
                createCalendarDay(
                    date,
                    {
                        isOutside: true,
                    }
                )
            );
        }

        for (
            let day = 1;
            day <= daysInMonth;
            day += 1
        ) {
            const date =
                new Date(
                    displayedYear,
                    displayedMonth,
                    day
                );

            calendarDaysElement.appendChild(
                createCalendarDay(date)
            );
        }

        const renderedDayCount =
            leadingDays + daysInMonth;

        const trailingDays =
            renderedDayCount <= 35
                ? 35 - renderedDayCount
                : 42 - renderedDayCount;

        for (
            let day = 1;
            day <= trailingDays;
            day += 1
        ) {
            const date =
                new Date(
                    displayedYear,
                    displayedMonth + 1,
                    day
                );

            calendarDaysElement.appendChild(
                createCalendarDay(
                    date,
                    {
                        isOutside: true,
                    }
                )
            );
        }
    }

    function getSelectedCountryName() {
        const selectedOption =
            countrySelect.options[
            countrySelect.selectedIndex
            ];

        return selectedOption
            ? selectedOption.textContent
            : selectedCountry;
    }

    function countDisplayedMonthHolidays(
        holidayList
    ) {
        const monthPrefix =
            `${displayedYear}-` +
            `${formatNumber(
                displayedMonth + 1
            )}-`;

        return holidayList.filter(
            function (holiday) {
                return String(
                    holiday.date || ""
                ).startsWith(
                    monthPrefix
                );
            }
        ).length;
    }

    async function refreshCalendar() {
        const requestNumber =
            latestRequestNumber + 1;

        latestRequestNumber =
            requestNumber;

        setHolidayStatus(
            "正在读取节假日..."
        );

        try {
            const holidayList =
                await loadHolidayList(
                    selectedCountry,
                    displayedYear
                );

            if (
                requestNumber !==
                latestRequestNumber
            ) {
                return;
            }

            holidayMap =
                createHolidayMap(
                    holidayList
                );

            renderCalendar();

            const holidayCount =
                countDisplayedMonthHolidays(
                    holidayList
                );

            const countryName =
                getSelectedCountryName();

            if (holidayCount > 0) {
                setHolidayStatus(
                    `${countryName}：本月` +
                    `${holidayCount}个法定节假日`
                );
            } else {
                setHolidayStatus(
                    `${countryName}：本月无全国法定节假日`
                );
            }
        } catch (error) {
            console.error(
                "Load calendar holidays error:",
                error
            );

            if (
                requestNumber !==
                latestRequestNumber
            ) {
                return;
            }

            holidayMap =
                new Map();

            renderCalendar();

            setHolidayStatus(
                error.message ||
                "节假日读取失败",
                "error"
            );
        }
    }

    previousMonthButton.addEventListener(
        "click",
        async function () {
            displayedMonth -= 1;

            if (displayedMonth < 0) {
                displayedMonth = 11;
                displayedYear -= 1;
            }

            await refreshCalendar();
        }
    );

    nextMonthButton.addEventListener(
        "click",
        async function () {
            displayedMonth += 1;

            if (displayedMonth > 11) {
                displayedMonth = 0;
                displayedYear += 1;
            }

            await refreshCalendar();
        }
    );

    todayButton.addEventListener(
        "click",
        async function () {
            displayedYear =
                today.getFullYear();

            displayedMonth =
                today.getMonth();

            await refreshCalendar();
        }
    );

    countrySelect.addEventListener(
        "change",
        async function () {
            selectedCountry =
                String(
                    countrySelect.value ||
                    "SG"
                ).toUpperCase();

            await refreshCalendar();
        }
    );

    updateTodaySummary();
    await refreshCalendar();
}