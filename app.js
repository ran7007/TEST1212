const STAGES = [
  { rows: 14, cols: 18, mines: 18, name: "2026 내부 점검표", meta: "부서별 이상치 검토" },
  { rows: 15, cols: 20, mines: 26, name: "Q2 리스크 보정표", meta: "중복 이슈 교차 확인" },
  { rows: 16, cols: 22, mines: 34, name: "최종 감사 시트", meta: "집중 점검 구간 재검토" }
];

const INITIAL_LIVES = 3;

const boardBody = document.getElementById("boardBody");
const columnHeaderRow = document.getElementById("columnHeaderRow");
const statusText = document.getElementById("statusText");
const subStatus = document.getElementById("subStatus");
const mineCount = document.getElementById("mineCount");
const timer = document.getElementById("timer");
const flagCount = document.getElementById("flagCount");
const resetBtn = document.getElementById("resetBtn");
const stageLabel = document.getElementById("stageLabel");
const scoreValue = document.getElementById("scoreValue");
const comboValue = document.getElementById("comboValue");
const livesValue = document.getElementById("livesValue");
const sheetName = document.getElementById("sheetName");
const sheetMeta = document.getElementById("sheetMeta");
const failOverlay = document.getElementById("failOverlay");
const retryBtn = document.getElementById("retryBtn");

const state = {
  stageIndex: 0,
  board: [],
  minesPlaced: false,
  openedCount: 0,
  flaggedCount: 0,
  startedAt: 0,
  timerId: null,
  gameOver: false,
  score: 0,
  combo: 1,
  lives: INITIAL_LIVES
};

buildHeaders();
loadStage(0, true);

resetBtn.addEventListener("click", () => {
  state.score = 0;
  state.combo = 1;
  state.lives = INITIAL_LIVES;
  loadStage(0, true);
});

retryBtn.addEventListener("click", restartGame);

function currentStage() {
  return STAGES[state.stageIndex];
}

function buildHeaders() {
  const headerCells = Array.from({ length: maxCols() }, (_, index) => {
    return `<th scope="col" data-col-header="${index}">${numberToColumn(index)}</th>`;
  }).join("");

  columnHeaderRow.innerHTML = '<th class="corner-cell"></th>' + headerCells;
}

function maxCols() {
  return STAGES.reduce((max, stage) => Math.max(max, stage.cols), 0);
}

function loadStage(stageIndex, resetTimer) {
  hideFailOverlay();

  if (resetTimer) {
    stopTimer();
    state.startedAt = 0;
    timer.textContent = "00:00";
  }

  state.stageIndex = stageIndex;
  state.board = createEmptyBoard();
  state.minesPlaced = false;
  state.openedCount = 0;
  state.flaggedCount = 0;
  state.gameOver = false;

  updateHeaders();
  updateSheetInfo();
  renderBoard();
  syncStats();
  setStatus("점검 진행 중", "연속으로 많이 열수록 점수가 커지고 다음 시트까지 이어집니다.");
}

function createEmptyBoard() {
  const stage = currentStage();
  return Array.from({ length: stage.rows }, (_, row) => {
    return Array.from({ length: stage.cols }, (_, col) => ({
      row,
      col,
      mine: false,
      open: false,
      flagged: false,
      count: 0,
      tripped: false
    }));
  });
}

function updateHeaders() {
  const stage = currentStage();
  columnHeaderRow.querySelectorAll("[data-col-header]").forEach((header, index) => {
    header.hidden = index >= stage.cols;
  });
}

function updateSheetInfo() {
  const stage = currentStage();
  stageLabel.textContent = `${state.stageIndex + 1} / ${STAGES.length}`;
  sheetName.textContent = stage.name;
  sheetMeta.textContent = stage.meta;
}

function placeMines(firstRow, firstCol) {
  const stage = currentStage();
  let placed = 0;

  while (placed < stage.mines) {
    const row = Math.floor(Math.random() * stage.rows);
    const col = Math.floor(Math.random() * stage.cols);
    const cell = state.board[row][col];

    if (cell.mine) {
      continue;
    }

    if (Math.abs(row - firstRow) <= 1 && Math.abs(col - firstCol) <= 1) {
      continue;
    }

    cell.mine = true;
    placed += 1;
  }

  for (let row = 0; row < stage.rows; row += 1) {
    for (let col = 0; col < stage.cols; col += 1) {
      const cell = state.board[row][col];
      cell.count = cell.mine ? -1 : countAdjacentMines(row, col);
    }
  }

  state.minesPlaced = true;
}

function countAdjacentMines(row, col) {
  let count = 0;

  for (let y = row - 1; y <= row + 1; y += 1) {
    for (let x = col - 1; x <= col + 1; x += 1) {
      if (y === row && x === col) {
        continue;
      }

      if (isInside(y, x) && state.board[y][x].mine) {
        count += 1;
      }
    }
  }

  return count;
}

function renderBoard() {
  boardBody.innerHTML = state.board.map((row, rowIndex) => {
    const cells = row.map((cell) => {
      const classes = ["sheet-cell"];
      let content = "";

      if (cell.open) {
        classes.push("open");

        if (cell.mine) {
          classes.push(cell.tripped ? "mine-safe" : "mine");
          content = cell.tripped ? "!" : "X";
        } else {
          classes.push(`n${cell.count}`);
          if (cell.count === 0) {
            classes.push("zero");
          }
          content = cell.count > 0 ? String(cell.count) : "0";
        }
      } else if (cell.flagged) {
        classes.push("flagged");
        content = "!";
      }

      return `<td>
        <button
          type="button"
          class="${classes.join(" ")}"
          data-row="${cell.row}"
          data-col="${cell.col}"
          aria-label="${rowIndex + 1}-${numberToColumn(cell.col)}"
        >${content}</button>
      </td>`;
    }).join("");

    return `<tr><th scope="row" class="row-header">${rowIndex + 1}</th>${cells}</tr>`;
  }).join("");

  bindBoardEvents();
}

function bindBoardEvents() {
  boardBody.querySelectorAll(".sheet-cell").forEach((button) => {
    button.addEventListener("click", (event) => {
      const row = Number(button.dataset.row);
      const col = Number(button.dataset.col);

      if (event.shiftKey) {
        handleFlag(row, col);
        return;
      }

      handleOpen(row, col);
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      handleFlag(Number(button.dataset.row), Number(button.dataset.col));
    });
  });
}

function handleOpen(row, col) {
  if (state.gameOver) {
    return;
  }

  const cell = state.board[row][col];
  if (cell.open || cell.flagged) {
    return;
  }

  if (!state.minesPlaced) {
    placeMines(row, col);
    startTimer();
  }

  if (cell.mine) {
    consumeLife(cell);
    return;
  }

  const openedNow = openCell(row, col);
  addScore(openedNow);
  renderBoard();
  syncStats();
  checkStageClear();
}

function handleFlag(row, col) {
  if (state.gameOver) {
    return;
  }

  const cell = state.board[row][col];
  if (cell.open) {
    return;
  }

  cell.flagged = !cell.flagged;
  state.flaggedCount += cell.flagged ? 1 : -1;
  renderBoard();
  syncStats();
}

function consumeLife(cell) {
  state.lives -= 1;
  state.combo = 1;
  cell.open = true;
  cell.tripped = true;
  cell.flagged = true;
  state.flaggedCount += 1;

  if (state.lives <= 0) {
    revealAllMines();
    state.gameOver = true;
    stopTimer();
    setStatus("검토 실패", "실수 허용치를 모두 사용했습니다. 첫 번째 시트부터 다시 시작하세요.");
    renderBoard();
    syncStats();
    showFailOverlay();
    return;
  }

  setStatus("위험 감지", `실수 허용치가 1 감소했습니다. 남은 보호 횟수: ${state.lives}`);
  renderBoard();
  syncStats();
}

function openCell(startRow, startCol) {
  const queue = [[startRow, startCol]];
  let openedNow = 0;

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const cell = state.board[row][col];

    if (cell.open || cell.flagged) {
      continue;
    }

    cell.open = true;
    state.openedCount += 1;
    openedNow += 1;

    if (cell.count !== 0) {
      continue;
    }

    for (let y = row - 1; y <= row + 1; y += 1) {
      for (let x = col - 1; x <= col + 1; x += 1) {
        if (!isInside(y, x)) {
          continue;
        }

        const next = state.board[y][x];
        if (!next.open && !next.mine && !next.flagged) {
          queue.push([y, x]);
        }
      }
    }
  }

  return openedNow;
}

function addScore(openedNow) {
  if (openedNow <= 0) {
    return;
  }

  const stageBonus = state.stageIndex + 1;
  const points = openedNow * 10 * state.combo * stageBonus;
  state.score += points;
  state.combo = Math.min(state.combo + (openedNow > 2 ? 1 : 0), 8);
  setStatus("점검 진행 중", `${openedNow}개 셀 확인 완료, +${points}점 획득`);
}

function revealAllMines() {
  const stage = currentStage();

  for (let row = 0; row < stage.rows; row += 1) {
    for (let col = 0; col < stage.cols; col += 1) {
      if (state.board[row][col].mine) {
        state.board[row][col].open = true;
      }
    }
  }
}

function checkStageClear() {
  const stage = currentStage();
  const safeCellTotal = stage.rows * stage.cols - stage.mines;

  if (state.openedCount !== safeCellTotal) {
    return;
  }

  const clearBonus = 250 * (state.stageIndex + 1) * state.combo;
  state.score += clearBonus;

  if (state.stageIndex === STAGES.length - 1) {
    state.gameOver = true;
    stopTimer();
    setStatus("검토 완료", `모든 시트를 정리했습니다. 최종 보너스 +${clearBonus}`);
    renderBoard();
    syncStats();
    return;
  }

  setStatus("시트 완료", `다음 점검표로 이동합니다. 완료 보너스 +${clearBonus}`);
  syncStats();

  window.setTimeout(() => {
    if (state.gameOver) {
      return;
    }

    loadStage(state.stageIndex + 1, false);
  }, 900);
}

function syncStats() {
  const stage = currentStage();
  mineCount.textContent = String(stage.mines - state.flaggedCount);
  flagCount.textContent = String(state.flaggedCount);
  scoreValue.textContent = String(state.score);
  comboValue.textContent = `x${state.combo}`;
  livesValue.textContent = String(state.lives);
}

function setStatus(title, detail) {
  statusText.textContent = title;
  subStatus.textContent = detail;
}

function restartGame() {
  state.score = 0;
  state.combo = 1;
  state.lives = INITIAL_LIVES;
  loadStage(0, true);
}

function showFailOverlay() {
  failOverlay.hidden = false;
}

function hideFailOverlay() {
  failOverlay.hidden = true;
}

function startTimer() {
  if (state.timerId) {
    return;
  }

  if (!state.startedAt) {
    state.startedAt = Date.now();
  }

  state.timerId = window.setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
    timer.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  if (!state.timerId) {
    return;
  }

  window.clearInterval(state.timerId);
  state.timerId = null;
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function numberToColumn(index) {
  let current = index + 1;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function isInside(row, col) {
  const stage = currentStage();
  return row >= 0 && row < stage.rows && col >= 0 && col < stage.cols;
}
