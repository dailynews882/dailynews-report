(function () {
    function getPatternLibrary() {
        return Array.isArray(
            window.LOTTERY_PATTERN_LIBRARY
        )
            ? window.LOTTERY_PATTERN_LIBRARY
            : [];
    }

    function normalizeDrawNumbers(
        numbers
    ) {
        if (
            !Array.isArray(numbers)
        ) {
            return [];
        }

        return numbers
            .map(Number)
            .filter(
                number =>
                    Number.isInteger(number) &&
                    number >= 1 &&
                    number <= 49
            )
            .sort(
                (a, b) => a - b
            );
    }

    function createDrawNodes(
        draws
    ) {
        if (
            !Array.isArray(draws)
        ) {
            return [];
        }

        const chronologicalDraws =
            [...draws].reverse();

        return chronologicalDraws.map(
            (draw, drawIndex) => {
                const mainNumbers =
                    normalizeDrawNumbers(
                        draw.main_numbers
                    );

                return {
                    drawIndex,
                    drawDate:
                        draw.draw_date || "",
                    numbers:
                        mainNumbers.map(
                            number => ({
                                drawIndex,
                                number
                            })
                        )
                };
            }
        );
    }

    function getRelativeOffset(
        baseNode,
        targetNode
    ) {
        return {
            drawOffset:
                targetNode.drawIndex -
                baseNode.drawIndex,

            numberOffset:
                targetNode.number -
                baseNode.number
        };
    }

    function buildNodeSet(
        drawNodes
    ) {
        const nodeSet =
            new Set();

        drawNodes.forEach(
            draw => {
                draw.numbers.forEach(
                    node => {
                        nodeSet.add(
                            `${node.drawIndex}:${node.number}`
                        );
                    }
                );
            }
        );

        return nodeSet;
    }

    function matchPatternAtAnchor(
        pattern,
        anchorDrawIndex,
        anchorNumber,
        nodeSet
    ) {
        if (
            !pattern ||
            !Array.isArray(pattern.points) ||
            pattern.points.length === 0
        ) {
            return false;
        }

        const [
            baseDrawOffset,
            baseNumberOffset
        ] = pattern.points[0];

        return pattern.points.every(
            point => {
                const [
                    drawOffset,
                    numberOffset
                ] = point;

                const normalizedDrawOffset =
                    drawOffset -
                    baseDrawOffset;

                const normalizedNumberOffset =
                    numberOffset -
                    baseNumberOffset;

                const targetDrawIndex =
                    anchorDrawIndex +
                    normalizedDrawOffset;

                const targetNumber =
                    anchorNumber +
                    normalizedNumberOffset;

                if (
                    targetNumber < 1 ||
                    targetNumber > 49
                ) {
                    return false;
                }

                return nodeSet.has(
                    `${targetDrawIndex}:${targetNumber}`
                );
            }
        );
    }

    function findPatternMatches(
        drawNodes,
        pattern
    ) {
        const matches = [];

        if (
            !Array.isArray(drawNodes) ||
            !pattern
        ) {
            return matches;
        }

        const nodeSet =
            buildNodeSet(
                drawNodes
            );

        drawNodes.forEach(
            draw => {
                draw.numbers.forEach(
                    node => {
                        const matched =
                            matchPatternAtAnchor(
                                pattern,
                                node.drawIndex,
                                node.number,
                                nodeSet
                            );

                        if (
                            matched
                        ) {
                            const [
                                baseDrawOffset,
                                baseNumberOffset
                            ] = pattern.points[0];

                            const matchedNodes =
                                pattern.points.map(
                                    point => {
                                        const [
                                            drawOffset,
                                            numberOffset
                                        ] = point;

                                        return {
                                            drawIndex:
                                                node.drawIndex +
                                                (
                                                    drawOffset -
                                                    baseDrawOffset
                                                ),

                                            number:
                                                node.number +
                                                (
                                                    numberOffset -
                                                    baseNumberOffset
                                                )
                                        };
                                    }
                                );

                            matches.push({
                                patternId:
                                    pattern.id,

                                patternName:
                                    pattern.name,

                                anchorDrawIndex:
                                    node.drawIndex,

                                anchorNumber:
                                    node.number,

                                matchedNodes
                            });
                        }
                    }
                );
            }
        );

        return matches;
    }

    function findAllPatternMatches(
        drawNodes,
        patternLibrary
    ) {
        if (
            !Array.isArray(drawNodes)
        ) {
            return [];
        }

        const patterns =
            Array.isArray(patternLibrary)
                ? patternLibrary
                : getPatternLibrary();

        return patterns.map(
            pattern => ({
                pattern,
                matches:
                    findPatternMatches(
                        drawNodes,
                        pattern
                    )
            })
        );
    }

    function predictNextDrawCandidates(
        drawNodes,
        patternLibrary
    ) {
        if (
            !Array.isArray(drawNodes) ||
            drawNodes.length === 0
        ) {
            return [];
        }

        const patterns =
            Array.isArray(patternLibrary)
                ? patternLibrary
                : getPatternLibrary();

        const nodeSet =
            buildNodeSet(
                drawNodes
            );

        const lastDrawIndex =
            Math.max(
                ...drawNodes.map(
                    draw =>
                        draw.drawIndex
                )
            );

        const nextDrawIndex =
            lastDrawIndex + 1;

        const predictions = [];

        patterns.forEach(
            pattern => {

                if (
                    !pattern ||
                    !Array.isArray(pattern.points) ||
                    pattern.points.length < 2
                ) {
                    return;
                }

                const maxDrawOffset =
                    Math.max(
                        ...pattern.points.map(
                            point => point[0]
                        )
                    );

                if (
                    maxDrawOffset <= 0
                ) {
                    return;
                }

                const historicalPoints =
                    pattern.points.filter(
                        point =>
                            point[0] <
                            maxDrawOffset
                    );

                const futurePoints =
                    pattern.points.filter(
                        point =>
                            point[0] ===
                            maxDrawOffset
                    );

                if (
                    historicalPoints.length === 0 ||
                    futurePoints.length === 0
                ) {
                    return;
                }

                const anchorDrawIndex =
                    nextDrawIndex -
                    maxDrawOffset;

                for (
                    let anchorNumber = 1;
                    anchorNumber <= 49;
                    anchorNumber += 1
                ) {
                    const historicalMatched =
                        historicalPoints.every(
                            point => {
                                const [
                                    drawOffset,
                                    numberOffset
                                ] = point;

                                const targetDrawIndex =
                                    anchorDrawIndex +
                                    drawOffset;

                                const targetNumber =
                                    anchorNumber +
                                    numberOffset;

                                if (
                                    targetNumber < 1 ||
                                    targetNumber > 49
                                ) {
                                    return false;
                                }

                                return nodeSet.has(
                                    `${targetDrawIndex}:${targetNumber}`
                                );
                            }
                        );

                    if (
                        !historicalMatched
                    ) {
                        continue;
                    }

                    const candidateNumbers =
                        futurePoints
                            .map(
                                point =>
                                    anchorNumber +
                                    point[1]
                            )
                            .filter(
                                number =>
                                    number >= 1 &&
                                    number <= 49
                            );

                    if (
                        candidateNumbers.length === 0
                    ) {
                        continue;
                    }

                    predictions.push({
                        patternId:
                            pattern.id,

                        patternName:
                            pattern.name,

                        nextDrawIndex,

                        candidateNumbers:
                            [...new Set(
                                candidateNumbers
                            )]
                    });
                }
            }
        );

        return predictions;
    }

    function summarizeCandidatePredictions(
        predictions
    ) {
        if (
            !Array.isArray(predictions)
        ) {
            return [];
        }

        const candidateMap =
            new Map();

        predictions.forEach(
            prediction => {

                if (
                    !prediction ||
                    !Array.isArray(
                        prediction.candidateNumbers
                    )
                ) {
                    return;
                }

                prediction.candidateNumbers.forEach(
                    number => {

                        if (
                            !candidateMap.has(number)
                        ) {
                            candidateMap.set(
                                number,
                                {
                                    number,
                                    supportCount: 0,
                                    patternIds: [],
                                    patternNames: []
                                }
                            );
                        }

                        const item =
                            candidateMap.get(number);

                        if (
                            !item.patternIds.includes(
                                prediction.patternId
                            )
                        ) {
                            item.patternIds.push(
                                prediction.patternId
                            );

                            item.patternNames.push(
                                prediction.patternName
                            );

                            item.supportCount += 1;
                        }
                    }
                );
            }
        );

        return Array.from(
            candidateMap.values()
        ).sort(
            (a, b) => {
                if (
                    b.supportCount !==
                    a.supportCount
                ) {
                    return (
                        b.supportCount -
                        a.supportCount
                    );
                }

                return (
                    a.number -
                    b.number
                );
            }
        );
    }

    function validatePatternLibrary(
        patternLibrary
    ) {
        const patterns =
            Array.isArray(patternLibrary)
                ? patternLibrary
                : getPatternLibrary();

        const issues = [];
        const idSet = new Set();
        const shapeMap = new Map();

        patterns.forEach(
            pattern => {
                if (
                    !pattern ||
                    !pattern.id
                ) {
                    issues.push({
                        type: "missing-id",
                        patternId:
                            pattern?.id || "--"
                    });

                    return;
                }

                if (
                    idSet.has(
                        pattern.id
                    )
                ) {
                    issues.push({
                        type: "duplicate-id",
                        patternId:
                            pattern.id
                    });
                }

                idSet.add(
                    pattern.id
                );

                if (
                    !Array.isArray(
                        pattern.points
                    )
                ) {
                    issues.push({
                        type: "invalid-points",
                        patternId:
                            pattern.id
                    });

                    return;
                }

                if (
                    pattern.pointCount !==
                    pattern.points.length
                ) {
                    issues.push({
                        type: "point-count-mismatch",
                        patternId:
                            pattern.id,
                        pointCount:
                            pattern.pointCount,
                        actualCount:
                            pattern.points.length
                    });
                }

                const pointSet =
                    new Set();

                pattern.points.forEach(
                    point => {
                        if (
                            !Array.isArray(point) ||
                            point.length !== 2
                        ) {
                            issues.push({
                                type: "invalid-point",
                                patternId:
                                    pattern.id
                            });

                            return;
                        }

                        const key =
                            `${point[0]}:${point[1]}`;

                        if (
                            pointSet.has(key)
                        ) {
                            issues.push({
                                type: "duplicate-point",
                                patternId:
                                    pattern.id,
                                point: key
                            });
                        }

                        pointSet.add(key);
                    }
                );

                const normalizedPoints =
                    [...pattern.points]
                        .map(
                            point => [
                                Number(point[0]),
                                Number(point[1])
                            ]
                        )
                        .sort(
                            (a, b) =>
                                a[0] - b[0] ||
                                a[1] - b[1]
                        );

                const minDrawOffset =
                    Math.min(
                        ...normalizedPoints.map(
                            point => point[0]
                        )
                    );

                const minNumberOffset =
                    Math.min(
                        ...normalizedPoints.map(
                            point => point[1]
                        )
                    );

                const shapeKey =
                    normalizedPoints
                        .map(
                            point =>
                                `${point[0] - minDrawOffset}:${point[1] - minNumberOffset}`
                        )
                        .join("|");

                if (
                    shapeMap.has(
                        shapeKey
                    )
                ) {
                    issues.push({
                        type: "duplicate-shape",
                        patternId:
                            pattern.id,
                        duplicateOf:
                            shapeMap.get(
                                shapeKey
                            )
                    });
                } else {
                    shapeMap.set(
                        shapeKey,
                        pattern.id
                    );
                }
            }
        );

        return {
            patternCount:
                patterns.length,
            issueCount:
                issues.length,
            issues
        };
    }

    window.LotteryPatternEngine = {
        getPatternLibrary,
        normalizeDrawNumbers,
        createDrawNodes,
        getRelativeOffset,
        buildNodeSet,
        matchPatternAtAnchor,
        findPatternMatches,
        findAllPatternMatches,
        predictNextDrawCandidates,
        summarizeCandidatePredictions,
        validatePatternLibrary
    };
})();