const state = {
        points: [],
        remainingPoints: [],
        wrongPoints: [],
        currentQuestion: null,
        svgText: "",
        fileName: "",
        correct: 0,
        wrong: 0,
        streak: 0,
        answered: false,
      };

      const svgFileEl = document.querySelector("#svgFile");
      const hideObjectsEl = document.querySelector("#hideObjects");
      const promptEl = document.querySelector("#prompt");
      const feedbackEl = document.querySelector("#feedback");
      const correctCountEl = document.querySelector("#correctCount");
      const wrongCountEl = document.querySelector("#wrongCount");
      const streakCountEl = document.querySelector("#streakCount");
      const progressCountEl = document.querySelector("#progressCount");
      const nextButton = document.querySelector("#nextButton");
      const revealButton = document.querySelector("#revealButton");
      const resetButton = document.querySelector("#resetButton");
      const retryButton = document.querySelector("#retryButton");
      const mapStatus = document.querySelector("#mapStatus");
      const mapWrap = document.querySelector("#mapWrap");
      const mapImage = document.querySelector("#mapImage");
      const hotspotLayer = document.querySelector("#hotspotLayer");
      const module = JSON.parse(localStorage.getItem("activeModule"));

      function SetTitle(){
        document.title = module.title;
        document.getElementById("pageTitle").innerText = module.title;
      }

      SetTitle();

      function initMap() {

        if (!module || module.type !== "map") {
          window.location.href = "index.html";
          return;
        }

        document.title = module.title;

        fetch(`maps/${module.map}`)
          .then(r => r.text())
          .then(svgText => loadSvgText(svgText, module.map));
      }

      initMap();

      function number(value) {
        return Number.parseFloat(String(value || "").replace(",", "."));
      }

      function parseMatrix(transform) {
        const match = /matrix\(([^)]+)\)/.exec(transform || "");
        if (!match) return [1, 0, 0, 1, 0, 0];
        return match[1]
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(number);
      }

      function transformPoint(x, y, matrix) {
        const [a, b, c, d, e, f] = matrix;
        return { x: a * x + c * y + e, y: b * x + d * y + f };
      }

      function readViewBox(svg) {
        const viewBox = svg.documentElement.getAttribute("viewBox");
        if (viewBox) {
          const values = viewBox
            .split(/[,\s]+/)
            .filter(Boolean)
            .map(number);
          if (values.length === 4) return values;
        }

        return [
          0,
          0,
          number(svg.documentElement.getAttribute("width")) || 1586.6667,
          number(svg.documentElement.getAttribute("height")) || 1121.3333,
        ];
      }

      function readPoints(svg) {
        return Array.from(svg.querySelectorAll('[data-geo-svg-tool="object"]'))
          .map((object) => {
            const label =
              object.getAttribute("data-title") ||
              object.querySelector("title")?.textContent.trim();
            if (!label) return null;

            const marker = object.querySelector("circle, ellipse, path, polygon, rect");

            const cx =
              number(marker?.getAttribute("sodipodi:cx")) ||
              number(marker?.getAttribute("cx")) ||
              0;
            const cy =
              number(marker?.getAttribute("sodipodi:cy")) ||
              number(marker?.getAttribute("cy")) ||
              0;
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

            const matrix = parseAnyTransform(object.getAttribute("transform"));
            const point =
              matrix && matrix.length === 6
                ? transformPoint(cx, cy, matrix)
                : { x: cx, y: cy };

            return { label, x: point.x, y: point.y };
          })
          .filter(Boolean)
          .sort((a, b) => a.label.localeCompare(b.label));
        }

        function parseAnyTransform(transformStr) {
            if (!transformStr) return null;

            // Check op translate(x, y) of translate(x y)
            if (transformStr.includes("translate")) {
                const matches = transformStr.match(/translate\s*\(([^)]+)\)/);
                if (matches && matches[1]) {
                // Splits op komma's of spaties en zet om naar getallen
                const args = matches[1].split(/[\s,]+/).map(Number);
                const e = args[0] || 0;
                const f = args[1] || 0;
                // Een pure translate is wiskundig gezien deze matrix: [1, 0, 0, 1, e, f]
                return [1, 0, 0, 1, e, f];
                }
            }

            // Check op matrix(a, b, c, d, e, f)
            if (transformStr.includes("matrix")) {
                const matches = transformStr.match(/matrix\s*\(([^)]+)\)/);
                if (matches && matches[1]) {
                return matches[1].split(/[\s,]+/).map(Number);
                }
            }
            return null;
        }   


      function makeDisplaySvg(svgText) {
        if (!hideObjectsEl.checked) return svgText;

        const parser = new DOMParser();
        const svg = parser.parseFromString(svgText, "image/svg+xml");
        svg
          .querySelectorAll(
            '[data-geo-svg-tool="object"], [data-geo-svg-tool="object-label"]'
          )
          .forEach((object) => {
            object.setAttribute("display", "none");
        });

        return new XMLSerializer().serializeToString(svg);
      }

      function updateMapDisplay() {
        if (!state.svgText) return;

        mapWrap.classList.toggle("hide-points", hideObjectsEl.checked);
        mapImage.src = URL.createObjectURL(
          new Blob([makeDisplaySvg(state.svgText)], { type: "image/svg+xml" })
        );
      }

      function clearMarks() {
        state.points.forEach((point) =>
          point.element?.classList.remove("correct", "incorrect", "reveal")
        );
      }

      function updateStats() {
        correctCountEl.textContent = String(state.correct);
        wrongCountEl.textContent = String(state.wrong);
        streakCountEl.textContent = String(state.streak);
        const total = state.points.length;
        const answered = total - state.remainingPoints.length - (state.currentQuestion ? 1 : 0);
        progressCountEl.textContent = `${answered} / ${total}`;
      }

      function setFeedback(text, type = "") {
        feedbackEl.textContent = text;
        feedbackEl.className = type ? `feedback ${type}` : "feedback";
      }

      function setControlsEnabled(enabled) {
        nextButton.disabled = !enabled;
        revealButton.disabled = !enabled;
        resetButton.disabled = !enabled;
      }

      function shuffle(points) {
        const result = [...points];
        for (let index = result.length - 1; index > 0; index -= 1) {
          const randomIndex = Math.floor(Math.random() * (index + 1));
          [result[index], result[randomIndex]] = [
            result[randomIndex],
            result[index],
          ];
        }
        return result;
      }

      function finishRound() {
        state.currentQuestion = null;
        state.answered = true;
        promptEl.textContent = "Ronde klaar";
        setFeedback(
          `Je had ${state.correct} juist en ${state.wrong} fout.`,
          "good"
        );
        clearMarks();
        nextButton.disabled = true;
        revealButton.disabled = true;
        retryButton.style.display = state.wrongPoints.length > 0 ? "" : "none";
      }

      function pickQuestion() {
        if (state.points.length === 0) return;
        if (state.remainingPoints.length === 0) {
          finishRound();
          return;
        }

        state.currentQuestion = state.remainingPoints.shift();
        state.answered = false;
        promptEl.textContent = state.currentQuestion.label;
        setFeedback("");
        clearMarks();
      }

      function goToNextQuestion() {
        if (!state.currentQuestion) return;
        if (!state.answered) {
          window.alert("Duid eerst een punt aan");
          return;
        }

        pickQuestion();
      }

      function checkAnswer(point) {
        if (state.answered || !state.currentQuestion) return;
        state.answered = true;

        if (point === state.currentQuestion) {
          point.element.classList.add("correct");
          state.correct += 1;
          state.streak += 1;
          setFeedback("Juist.", "good");
        } else {
          point.element.classList.add("incorrect");
          state.currentQuestion.element.classList.add("reveal");
          state.wrong += 1;
          state.streak = 0;
          if (!state.wrongPoints.includes(state.currentQuestion)) {
            state.wrongPoints.push(state.currentQuestion);
          }
          setFeedback(`Fout.`, "bad");
        }

        updateStats();
      }

      function revealAnswer() {
        if (!state.currentQuestion || state.answered) return;

        clearMarks();
        state.currentQuestion.element.classList.add("reveal");
        state.answered = true;
        state.wrong += 1;
        state.streak = 0;
        if (!state.wrongPoints.includes(state.currentQuestion)) {
          state.wrongPoints.push(state.currentQuestion);
        }
        updateStats();
        setFeedback(`Dit is ${state.currentQuestion.label}.`, "bad");
      }

      function resetQuiz() {
        state.correct = 0;
        state.wrong = 0;
        state.streak = 0;
        state.wrongPoints = [];
        state.remainingPoints = shuffle(state.points);
        nextButton.disabled = false;
        revealButton.disabled = false;
        retryButton.style.display = "none";
        updateStats();
        pickQuestion();
      }

      function renderHotspots(points) {
        hotspotLayer.textContent = "";
        const namespace = "http://www.w3.org/2000/svg";

        points.forEach((point) => {
          const circle = document.createElementNS(namespace, "circle");
          circle.setAttribute("class", "hotspot");
          circle.setAttribute("cx", point.x);
          circle.setAttribute("cy", point.y);
          circle.setAttribute("r", 14);
          circle.setAttribute("aria-label", point.label);
          circle.addEventListener("click", () => checkAnswer(point));
          point.element = circle;
          hotspotLayer.appendChild(circle);
        });
      }

      function loadSvgText(svgText, fileName) {
        const parser = new DOMParser();
        const svg = parser.parseFromString(svgText, "image/svg+xml");

        if (svg.querySelector("parsererror")) {
          throw new Error("Deze SVG kon niet gelezen worden.");
        }

        const [minX, minY, width, height] = readViewBox(svg);
        const points = readPoints(svg);

        hotspotLayer.setAttribute(
          "viewBox",
          `${minX} ${minY} ${width} ${height}`
        );
        mapWrap.style.setProperty("--map-ratio", `${width} / ${height}`);

        state.svgText = svgText;
        state.fileName = fileName;
        state.points = points;
        state.remainingPoints = shuffle(points);
        state.wrongPoints = [];
        state.currentQuestion = null;
        state.correct = 0;
        state.wrong = 0;
        state.streak = 0;

        renderHotspots(points);
        updateMapDisplay();
        updateStats();
        retryButton.style.display = "none";

        if (points.length === 0) {
          promptEl.textContent = "Geen punten gevonden";
          mapStatus.textContent = `${fileName}: geen objecten uit de nieuwe editor gevonden.`;
          setFeedback(
            "Voeg eerst objecten toe via de SVG georeferentie editor.",
            "bad"
          );
          setControlsEnabled(false);
          return;
        }

        setControlsEnabled(true);
        pickQuestion();
      }
      

      function retryWrongPoints() {
        if (state.wrongPoints.length === 0) return;
        state.correct = 0;
        state.wrong = 0;
        state.streak = 0;
        state.remainingPoints = shuffle(state.wrongPoints);
        state.wrongPoints = [];
        nextButton.disabled = false;
        revealButton.disabled = false;
        retryButton.style.display = "none";
        updateStats();
        pickQuestion();
      }

      nextButton.addEventListener("click", goToNextQuestion);
      revealButton.addEventListener("click", revealAnswer);
      resetButton.addEventListener("click", resetQuiz);
      retryButton.addEventListener("click", retryWrongPoints);
      hideObjectsEl.addEventListener("change", updateMapDisplay);
      resetQuiz();
