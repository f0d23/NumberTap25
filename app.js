/**
 * 瞬間視・周辺視野トレーニング 25 アプリケーションロジック
 * スマホ連続タップ・マルチタッチ完全対応 / 超高速レスポンス
 */

(() => {
  'use strict';

  // --- 定数 & 設定 ---
  const STORAGE_KEY_RECORDS = 'ooburi2_records_v1';
  const STORAGE_KEY_SETTINGS = 'ooburi2_settings_v1';
  const GRID_SIZE = 5;
  const TOTAL_CELLS = 25;

  // --- 状態管理 ---
  let gameState = 'IDLE'; // 'IDLE' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED'
  let currentTarget = 1;
  let missCount = 0;
  let startTime = 0;
  let timerRafId = null;
  let lastFinalTimeMs = 0;

  let settings = {
    sound: true,
    vibrate: true,
    countdown: true,
    boardSize: 'compact',
    fontSize: 'huge'
  };

  let records = [];

  // --- DOM要素 ---
  const elements = {
    headerBest: document.getElementById('headerBest'),
    headerAvg: document.getElementById('headerAvg'),
    btnHistory: document.getElementById('btnHistory'),
    btnSettings: document.getElementById('btnSettings'),

    targetDisplay: document.getElementById('targetDisplay'),
    timerDisplay: document.getElementById('timerDisplay'),
    missDisplay: document.getElementById('missDisplay'),

    boardContainer: document.getElementById('boardContainer'),
    gameBoard: document.getElementById('gameBoard'),
    countdownOverlay: document.getElementById('countdownOverlay'),
    countdownText: document.getElementById('countdownText'),
    readyOverlay: document.getElementById('readyOverlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayDesc: document.getElementById('overlayDesc'),
    btnStartGame: document.getElementById('btnStartGame'),
    btnRestart: document.getElementById('btnRestart'),

    // 結果モーダル
    resultModal: document.getElementById('resultModal'),
    resultTime: document.getElementById('resultTime'),
    resultMisses: document.getElementById('resultMisses'),
    resultTotalPlays: document.getElementById('resultTotalPlays'),
    newRecordTag: document.getElementById('newRecordTag'),
    btnPlayAgain: document.getElementById('btnPlayAgain'),
    btnCloseResult: document.getElementById('btnCloseResult'),

    // 履歴モーダル
    historyModal: document.getElementById('historyModal'),
    btnCloseHistory: document.getElementById('btnCloseHistory'),
    hStatBest: document.getElementById('hStatBest'),
    hStatAvg5: document.getElementById('hStatAvg5'),
    hStatAvgAll: document.getElementById('hStatAvgAll'),
    hStatTotal: document.getElementById('hStatTotal'),
    historyTableBody: document.getElementById('historyTableBody'),
    emptyHistoryNotice: document.getElementById('emptyHistoryNotice'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnClearAllHistory: document.getElementById('btnClearAllHistory'),

    // 設定モーダル
    settingsModal: document.getElementById('settingsModal'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    settingSound: document.getElementById('settingSound'),
    settingVibrate: document.getElementById('settingVibrate'),
    settingCountdown: document.getElementById('settingCountdown'),
    settingBoardSize: document.getElementById('settingBoardSize'),
    settingFontSize: document.getElementById('settingFontSize')
  };

  // --- Web Audio 音声システム ---
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.06, gainLevel = 0.2) {
    if (!settings.sound || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainLevel, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // 音声再生エラーはゲームに影響させない
    }
  }

  function playCorrectSound() {
    // 軽快な高音ピピッ
    playTone(900, 'sine', 0.05, 0.25);
  }

  function playWrongSound() {
    // 低音ブッ
    playTone(200, 'sawtooth', 0.08, 0.2);
  }

  function playCountdownSound(isGo = false) {
    if (isGo) {
      playTone(880, 'triangle', 0.2, 0.3);
    } else {
      playTone(440, 'triangle', 0.08, 0.2);
    }
  }

  function playFanfare() {
    if (!settings.sound || !audioCtx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, High C
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playTone(freq, 'triangle', 0.2, 0.25);
      }, idx * 80);
    });
  }

  function triggerVibrate(ms = 15) {
    if (settings.vibrate && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch (e) {}
    }
  }

  // 視覚設定（盤面サイズ・文字サイズ）のDOM反映
  function applyVisualSettings() {
    if (!elements.boardContainer) return;
    elements.boardContainer.classList.remove('board-size-compact', 'board-size-normal', 'board-size-wide');
    elements.boardContainer.classList.add(`board-size-${settings.boardSize || 'compact'}`);

    elements.boardContainer.classList.remove('font-size-huge', 'font-size-large');
    elements.boardContainer.classList.add(`font-size-${settings.fontSize || 'huge'}`);
  }

  // --- 初期化 & ローカルストレージ ---
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (raw) {
        settings = { ...settings, ...JSON.parse(raw) };
      }
    } catch (e) {}
    elements.settingSound.checked = settings.sound;
    elements.settingVibrate.checked = settings.vibrate;
    elements.settingCountdown.checked = settings.countdown;
    if (elements.settingBoardSize) elements.settingBoardSize.value = settings.boardSize || 'compact';
    if (elements.settingFontSize) elements.settingFontSize.value = settings.fontSize || 'huge';
    applyVisualSettings();
  }

  function saveSettings() {
    settings.sound = elements.settingSound.checked;
    settings.vibrate = elements.settingVibrate.checked;
    settings.countdown = elements.settingCountdown.checked;
    if (elements.settingBoardSize) settings.boardSize = elements.settingBoardSize.value;
    if (elements.settingFontSize) settings.fontSize = elements.settingFontSize.value;
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {}
    applyVisualSettings();
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (raw) {
        records = JSON.parse(raw);
      }
    } catch (e) {
      records = [];
    }
    updateHeaderStats();
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
    } catch (e) {}
    updateHeaderStats();
  }

  // タイムフォーマット変換 (ミリ秒 -> 00.000)
  function formatTime(ms) {
    const totalSeconds = ms / 1000;
    return totalSeconds.toFixed(3);
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}/${day} ${h}:${min}`;
  }

  function getBestRecord() {
    if (records.length === 0) return null;
    return records.reduce((best, cur) => cur.timeMs < best.timeMs ? cur : best, records[0]);
  }

  function getAverage(count = 0) {
    if (records.length === 0) return null;
    const targetRecords = count > 0 ? records.slice(-count) : records;
    const sum = targetRecords.reduce((acc, cur) => acc + cur.timeMs, 0);
    return sum / targetRecords.length;
  }

  function updateHeaderStats() {
    const best = getBestRecord();
    const avg = getAverage();

    elements.headerBest.textContent = best ? `${formatTime(best.timeMs)}s` : '--.--s';
    elements.headerAvg.textContent = avg ? `${formatTime(avg)}s` : '--.--s';
  }

  // --- ゲーム盤面生成 ---
  function shuffleNumbers() {
    const arr = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderBoard(numbers, showNumbers = false) {
    elements.gameBoard.innerHTML = '';
    const fragment = document.createDocumentFragment();

    numbers.forEach((num) => {
      const cell = document.createElement('button');
      cell.className = `cell ${showNumbers ? '' : 'cell-masked'}`;
      cell.setAttribute('type', 'button');
      cell.dataset.number = String(num);
      cell.textContent = showNumbers ? num : ''; // スタート前は空（カンニング完全防止）

      // ポインターイベントで超高速検知（遅延0ms、マルチタッチ個別対応）
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // ズームやスクロールなどの既定のジェスチャーを完全無効化
        handleCellTap(num, cell);
      }, { passive: false });

      fragment.appendChild(cell);
    });

    elements.gameBoard.appendChild(fragment);
  }

  // スタート合図（GO!）と同時に全セルの数字を一斉点灯
  function revealBoardNumbers() {
    const cells = elements.gameBoard.querySelectorAll('.cell');
    cells.forEach((cell) => {
      cell.classList.remove('cell-masked');
      cell.textContent = cell.dataset.number;
    });
  }

  // --- タップ判定ロジック ---
  function handleCellTap(num, cell) {
    if (gameState !== 'PLAYING') return;

    if (num === currentTarget) {
      // 【正解タップ】
      playCorrectSound();
      triggerVibrate(12);

      // 一瞬の緑アニメーション
      cell.classList.remove('flash-wrong');
      cell.classList.remove('flash-correct');
      void cell.offsetWidth; // リフロー強制でアニメーションを確実発火
      cell.classList.add('flash-correct');

      setTimeout(() => {
        cell.classList.remove('flash-correct');
      }, 110);

      // ターゲット番号を即座に進める（アニメーション待ちなし！）
      currentTarget++;

      if (currentTarget > TOTAL_CELLS) {
        // 全問クリア！
        finishGame();
      } else {
        // 次の数字を即時表示
        elements.targetDisplay.textContent = currentTarget;
      }
    } else {
      // 【不正解タップ（お手付き）】
      playWrongSound();
      triggerVibrate(35);

      missCount++;
      elements.missDisplay.textContent = missCount;

      // 一瞬の赤アニメーション
      cell.classList.remove('flash-correct');
      cell.classList.remove('flash-wrong');
      void cell.offsetWidth; // リフロー強制
      cell.classList.add('flash-wrong');

      setTimeout(() => {
        cell.classList.remove('flash-wrong');
      }, 110);
    }
  }

  // --- タイマー処理 ---
  function startTimer() {
    startTime = performance.now();
    function update() {
      if (gameState !== 'PLAYING') return;
      const now = performance.now();
      const elapsed = now - startTime;
      elements.timerDisplay.textContent = formatTime(elapsed);
      timerRafId = requestAnimationFrame(update);
    }
    timerRafId = requestAnimationFrame(update);
  }

  function stopTimer() {
    if (timerRafId) {
      cancelAnimationFrame(timerRafId);
      timerRafId = null;
    }
    const finalElapsed = performance.now() - startTime;
    elements.timerDisplay.textContent = formatTime(finalElapsed);
    return Math.round(finalElapsed);
  }

  // --- ゲーム進行フロー ---
  function prepareGame() {
    gameState = 'IDLE';
    currentTarget = 1;
    missCount = 0;
    elements.targetDisplay.textContent = '1';
    elements.missDisplay.textContent = '0';
    elements.timerDisplay.textContent = '00.000';

    const numbers = shuffleNumbers();
    renderBoard(numbers, false); // 数字は伏せてパネル枠のみ表示（カンニング不可）

    elements.readyOverlay.classList.remove('hidden');
    elements.countdownOverlay.classList.add('hidden');
  }

  function startGameFlow() {
    initAudio();
    elements.readyOverlay.classList.add('hidden');

    if (settings.countdown) {
      runCountdown(() => {
        beginPlaying();
      });
    } else {
      beginPlaying();
    }
  }

  function runCountdown(onFinish) {
    gameState = 'COUNTDOWN';
    elements.countdownOverlay.classList.remove('hidden');

    const steps = ['3', '2', '1', 'GO!'];
    let stepIndex = 0;

    function nextStep() {
      if (stepIndex < steps.length) {
        const text = steps[stepIndex];
        elements.countdownText.textContent = text;
        const isGo = (text === 'GO!');
        playCountdownSound(isGo);
        triggerVibrate(isGo ? 30 : 15);

        // アニメーション再トリガー
        elements.countdownText.style.animation = 'none';
        void elements.countdownText.offsetWidth;
        elements.countdownText.style.animation = 'countdownPulse 0.7s ease-out';

        stepIndex++;
        setTimeout(nextStep, 750);
      } else {
        elements.countdownOverlay.classList.add('hidden');
        onFinish();
      }
    }

    nextStep();
  }

  function beginPlaying() {
    revealBoardNumbers(); // GO! の瞬間に一斉点灯！
    gameState = 'PLAYING';
    currentTarget = 1;
    missCount = 0;
    elements.targetDisplay.textContent = '1';
    elements.missDisplay.textContent = '0';
    startTimer();
  }

  function finishGame() {
    gameState = 'FINISHED';
    lastFinalTimeMs = stopTimer();
    playFanfare();
    triggerVibrate([40, 60, 40]);

    // 記録保存
    const isFirst = records.length === 0;
    const prevBest = getBestRecord();
    const isNewRecord = !isFirst && prevBest && lastFinalTimeMs < prevBest.timeMs;

    const newRecord = {
      id: Date.now(),
      date: Date.now(),
      timeMs: lastFinalTimeMs,
      timeStr: formatTime(lastFinalTimeMs),
      misses: missCount
    };

    records.push(newRecord);
    saveRecords();

    // 結果モーダル表示
    showResultModal(newRecord, isNewRecord || isFirst);
  }

  // --- 結果モーダル ---
  function showResultModal(record, isBest) {
    elements.resultTime.textContent = `${record.timeStr}s`;
    elements.resultMisses.textContent = `${record.misses}回`;
    elements.resultTotalPlays.textContent = `${records.length}回目`;

    if (isBest) {
      elements.newRecordTag.classList.remove('hidden');
      elements.resultTrophy.textContent = '👑';
    } else {
      elements.newRecordTag.classList.add('hidden');
      elements.resultTrophy.textContent = '🏁';
    }

    elements.resultModal.classList.remove('hidden');
  }

  function closeResultModal() {
    elements.resultModal.classList.add('hidden');
    prepareGame();
  }

  // --- 履歴モーダル ---
  function openHistoryModal() {
    const best = getBestRecord();
    const avg5 = getAverage(5);
    const avgAll = getAverage();

    elements.hStatBest.textContent = best ? `${formatTime(best.timeMs)}s` : '--.--s';
    elements.hStatAvg5.textContent = avg5 ? `${formatTime(avg5)}s` : '--.--s';
    elements.hStatAvgAll.textContent = avgAll ? `${formatTime(avgAll)}s` : '--.--s';
    elements.hStatTotal.textContent = `${records.length}回`;

    renderHistoryTable();
    elements.historyModal.classList.remove('hidden');
  }

  function renderHistoryTable() {
    elements.historyTableBody.innerHTML = '';

    if (records.length === 0) {
      elements.emptyHistoryNotice.classList.remove('hidden');
      return;
    }
    elements.emptyHistoryNotice.classList.add('hidden');

    const best = getBestRecord();
    // 新しい順に最大100件表示
    const displayList = [...records].reverse().slice(0, 100);

    displayList.forEach((rec, idx) => {
      const isBest = best && rec.id === best.id;
      const tr = document.createElement('tr');
      tr.className = `history-row ${isBest ? 'is-best' : ''}`;

      tr.innerHTML = `
        <td>${records.length - idx}</td>
        <td>${formatDate(rec.date)}</td>
        <td class="td-time">${rec.timeStr}s ${isBest ? '👑' : ''}</td>
        <td>${rec.misses}</td>
        <td><button class="delete-btn" data-id="${rec.id}" title="削除">&times;</button></td>
      `;

      tr.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteRecord(rec.id);
      });

      elements.historyTableBody.appendChild(tr);
    });
  }

  function deleteRecord(id) {
    if (confirm('この記録を削除しますか？')) {
      records = records.filter(r => r.id !== id);
      saveRecords();
      openHistoryModal();
    }
  }

  function clearAllHistory() {
    if (confirm('すべてのプレイ履歴を完全に消去しますか？この操作は取り消せません。')) {
      records = [];
      saveRecords();
      openHistoryModal();
    }
  }

  function exportCsv() {
    if (records.length === 0) {
      alert('エクスポートする記録がありません。');
      return;
    }

    let csvContent = '\uFEFF'; // BOM付きUTF-8
    csvContent += 'No,日時,タイム(秒),ミス回数\n';

    records.forEach((rec, idx) => {
      const d = new Date(rec.date).toLocaleString('ja-JP');
      csvContent += `${idx + 1},"${d}",${rec.timeStr},${rec.misses}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `瞬間視トレーニング_記録_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- 設定モーダル ---
  function openSettingsModal() {
    loadSettings();
    elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    saveSettings();
    elements.settingsModal.classList.add('hidden');
  }

  // --- スマホ誤作動・ズーム・ジェスチャー完全防止ガード ---
  function installTouchGuards() {
    // 2本指以上のタッチによるピンチズーム抑止
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

    // iOS Safari用 ジェスチャーズーム抑止
    window.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('gesturechange', (e) => e.preventDefault());
    window.addEventListener('gestureend', (e) => e.preventDefault());

    // ダブルタップによる拡大抑止
    window.addEventListener('dblclick', (e) => e.preventDefault());

    // コンテキストメニュー（長押しメニュー）抑止
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // モーダル外タップでモーダルを閉じる
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', () => {
        elements.resultModal.classList.add('hidden');
        elements.historyModal.classList.add('hidden');
        elements.settingsModal.classList.add('hidden');
      });
    });
  }

  // --- イベントリスナーバインド ---
  function bindEvents() {
    // ボタン
    elements.btnStartGame.addEventListener('click', startGameFlow);
    elements.btnRestart.addEventListener('click', prepareGame);

    elements.btnPlayAgain.addEventListener('click', () => {
      elements.resultModal.classList.add('hidden');
      prepareGame();
      startGameFlow();
    });
    elements.btnCloseResult.addEventListener('click', closeResultModal);

    // 履歴モーダル
    elements.btnHistory.addEventListener('click', openHistoryModal);
    elements.btnCloseHistory.addEventListener('click', () => elements.historyModal.classList.add('hidden'));
    elements.btnExportCsv.addEventListener('click', exportCsv);
    elements.btnClearAllHistory.addEventListener('click', clearAllHistory);

    // 設定モーダル
    elements.btnSettings.addEventListener('click', openSettingsModal);
    elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
    elements.btnSaveSettings.addEventListener('click', closeSettingsModal);
    elements.settingSound.addEventListener('change', saveSettings);
    elements.settingVibrate.addEventListener('change', saveSettings);
    elements.settingCountdown.addEventListener('change', saveSettings);
    if (elements.settingBoardSize) elements.settingBoardSize.addEventListener('change', saveSettings);
    if (elements.settingFontSize) elements.settingFontSize.addEventListener('change', saveSettings);
  }

  // --- Service Worker 登録 ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('Service Worker registration skipped/failed:', err);
        });
      });
    }
  }

  // --- アプリ初期化 ---
  function init() {
    installTouchGuards();
    loadSettings();
    loadRecords();
    bindEvents();
    prepareGame();
    registerServiceWorker();
  }

  // 起動
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
