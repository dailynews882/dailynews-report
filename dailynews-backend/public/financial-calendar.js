const ECONOMIC_CALENDAR_API =
    "/api/economic-calendar";

const calendarState = {
    selectedDate: new Date(),
    country: "all",
    type: "all",
    importance: "all",
    status: "all"
};

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        setToday();
        bindCalendarControls();
        await loadEconomicCalendar();
    }
);

function bindCalendarControls() {
    document
        .querySelectorAll(
            "[data-date-action]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                async () => {
                    const action =
                        button.dataset.dateAction;

                    if (action === "today") {
                        setToday();
                    } else {
                        changeSelectedDate(
                            action === "previous"
                                ? -1
                                : 1
                        );
                    }

                    await loadEconomicCalendar();
                }
            );
        });

    document
        .getElementById(
            "calendarDateInput"
        )
        ?.addEventListener(
            "change",
            async (event) => {
                const selected =
                    parseInputDate(
                        event.target.value
                    );

                if (selected) {
                    calendarState.selectedDate =
                        selected;

                    updateDateControls();
                    await loadEconomicCalendar();
                }
            }
        );

    bindSelect(
        "calendarCountryFilter",
        "country"
    );

    bindSelect(
        "calendarTypeFilter",
        "type"
    );

    bindSelect(
        "calendarImportanceFilter",
        "importance"
    );

    bindSelect(
        "calendarStatusFilter",
        "status"
    );

    document
        .getElementById(
            "calendarEventsBody"
        )
        ?.addEventListener(
            "click",
            (event) => {
                const button =
                    event.target.closest(
                        "[data-remind-event]"
                    );

                if (!button) {
                    return;
                }

                button.classList.toggle(
                    "is-active"
                );

                button.textContent =
                    button.classList.contains(
                        "is-active"
                    )
                        ? "已提醒"
                        : "提醒我";
            }
        );
}

function bindSelect(
    elementId,
    stateKey
) {
    document
        .getElementById(elementId)
        ?.addEventListener(
            "change",
            async (event) => {
                calendarState[stateKey] =
                    event.target.value;

                await loadEconomicCalendar();
            }
        );
}

function setToday() {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    calendarState.selectedDate =
        today;

    updateDateControls();
}

function changeSelectedDate(days) {
    const next =
        new Date(
            calendarState.selectedDate
        );

    next.setDate(
        next.getDate() + days
    );

    calendarState.selectedDate =
        next;

    updateDateControls();
}

function updateDateControls() {
    const input =
        document.getElementById(
            "calendarDateInput"
        );

    if (input) {
        input.value =
            formatInputDate(
                calendarState.selectedDate
            );
    }

    const isToday =
        isSameDate(
            calendarState.selectedDate,
            new Date()
        );

    document
        .querySelector(
            '[data-date-action="today"]'
        )
        ?.classList.toggle(
            "is-active",
            isToday
        );
}

async function loadEconomicCalendar() {
    const body =
        document.getElementById(
            "calendarEventsBody"
        );

    const statusMessage =
        document.getElementById(
            "calendarStatusMessage"
        );

    const listTitle =
        document.getElementById(
            "calendarListTitle"
        );

    if (!body) {
        return;
    }

    if (listTitle) {
        listTitle.textContent =
            `${formatDisplayDate(
                calendarState.selectedDate
            )} 财经事件`;
    }

    body.innerHTML = `
    <tr class="empty-row">
      <td colspan="9">
        正在读取财经事件...
      </td>
    </tr>
  `;

    if (statusMessage) {
        statusMessage.textContent =
            "正在连接财经日历接口...";
    }

    try {
        const requestUrl =
            buildEconomicCalendarUrl();

        const response =
            await fetch(
                requestUrl,
                {
                    headers: {
                        Accept:
                            "application/json"
                    },
                    cache: "no-store"
                }
            );

        const result =
            await response
                .json()
                .catch(() => ({}));

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "财经日历读取失败"
            );
        }

        const events =
            Array.isArray(result.events)
                ? result.events
                : [];

        renderEconomicCalendar(
            events
        );

        if (statusMessage) {
            statusMessage.textContent =
                `共 ${events.length} 条符合条件的事件`;
        }
    } catch (error) {
        console.error(
            "Load economic calendar error:",
            error
        );

        updateSummary([]);

        body.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">
          ${escapeHtml(
            error.message ||
            "财经日历读取失败"
        )}
        </td>
      </tr>
    `;

        if (statusMessage) {
            statusMessage.textContent =
                "财经日历接口连接失败";
        }
    }
}

function buildEconomicCalendarUrl() {
    const params =
        new URLSearchParams();

    params.set(
        "date",
        formatInputDate(
            calendarState.selectedDate
        )
    );

    if (
        calendarState.country !== "all"
    ) {
        params.set(
            "country",
            calendarState.country
        );
    }

    if (
        calendarState.type !== "all"
    ) {
        params.set(
            "type",
            calendarState.type
        );
    }

    if (
        calendarState.importance !==
        "all"
    ) {
        params.set(
            "importance",
            calendarState.importance
        );
    }

    if (
        calendarState.status !== "all"
    ) {
        params.set(
            "status",
            calendarState.status
        );
    }

    return (
        `${ECONOMIC_CALENDAR_API}?` +
        params.toString()
    );
}

function renderEconomicCalendar(
    events
) {
    const body =
        document.getElementById(
            "calendarEventsBody"
        );

    if (!body) {
        return;
    }

    updateSummary(events);

    if (events.length === 0) {
        body.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">
          当前日期和筛选条件下暂无财经事件。
        </td>
      </tr>
    `;

        return;
    }

    body.innerHTML =
        events
            .map((event) => {
                const importance =
                    Number(
                        event.importance
                    ) || 1;

                const stars =
                    "★".repeat(importance) +
                    "☆".repeat(
                        Math.max(
                            0,
                            3 - importance
                        )
                    );

                return `
          <tr>
            <td>
              ${escapeHtml(
                    event.time
                )}
            </td>

            <td>
              <span class="event-country">
                <span class="country-code">
                  ${escapeHtml(
                    event.countryCode
                )}
                </span>

                ${escapeHtml(
                    event.countryName
                )}
              </span>
            </td>

            <td>
              <div class="event-title">
                ${escapeHtml(
                    event.title
                )}
              </div>

              <div class="event-type">
                ${escapeHtml(
                    event.typeName
                )}
              </div>
            </td>

            <td>
              <span
                class="importance"
                data-level="${importance}"
              >
                ${stars}
              </span>
            </td>

            <td>
              ${escapeHtml(
                    event.previous
                )}
            </td>

            <td>
              ${escapeHtml(
                    event.forecast
                )}
            </td>

            <td class="actual-value">
              ${escapeHtml(
                    event.actual
                )}
            </td>

            <td>
              <span
                class="event-status"
                data-status="${escapeHtml(
                    event.status
                )}"
              >
                ${event.status ===
                        "published"
                        ? "已公布"
                        : "待公布"
                    }
              </span>
            </td>

            <td>
              <button
                type="button"
                class="remind-btn"
                data-remind-event="${escapeHtml(
                        event.id
                    )}"
              >
                提醒我
              </button>
            </td>
          </tr>
        `;
            })
            .join("");
}

function updateSummary(events) {
    setText(
        "calendarTotalCount",
        events.length
    );

    setText(
        "calendarImportantCount",
        events.filter(
            (event) =>
                Number(
                    event.importance
                ) >= 3
        ).length
    );

    setText(
        "calendarPendingCount",
        events.filter(
            (event) =>
                event.status ===
                "pending"
        ).length
    );

    setText(
        "calendarPublishedCount",
        events.filter(
            (event) =>
                event.status ===
                "published"
        ).length
    );
}

function setText(elementId, value) {
    const element =
        document.getElementById(
            elementId
        );

    if (element) {
        element.textContent =
            String(value);
    }
}

function formatInputDate(date) {
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

    return (
        `${year}-${month}-${day}`
    );
}

function parseInputDate(value) {
    const parts =
        String(value || "")
            .split("-")
            .map(Number);

    if (
        parts.length !== 3 ||
        parts.some(
            (item) =>
                !Number.isFinite(item)
        )
    ) {
        return null;
    }

    return new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
    );
}

function formatDisplayDate(date) {
    return new Intl.DateTimeFormat(
        "zh-CN",
        {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short"
        }
    ).format(date);
}

function isSameDate(left, right) {
    return (
        left.getFullYear() ===
        right.getFullYear() &&
        left.getMonth() ===
        right.getMonth() &&
        left.getDate() ===
        right.getDate()
    );
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}