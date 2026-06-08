let capture;
let handpose;
let predictions = [];
let gestureText = "";
let modelLoaded = false;

// 新增狀態機
let appState = "COVER";        // 應用程式狀態: COVER, TUTORIAL, WARNING, LOADING, CALIBRATING, PLAYING, RESULT, ADVENTURE_WARNING, ADVENTURE

// 啟動（校正）階段的相關變數
let calibrateStartTime = 0;    // 記錄開始偵測到手的時間
let calibrateProgress = 0;     // 記錄 1 秒鐘的進度 (0.0 ~ 1.0)
let calibrateSide = "";        // 記錄目前正在校正哪一邊 ("left" 或 "right")
let isFading = false;          // 是否正在播放淡出動畫
let fadeStartTime = 0;         // 淡出動畫開始時間
let lockedSide = "";           // 記錄最終選定的一側

let gestureHistory = [];       // 用於時間平滑化的陣列
const historyLength = 10;      // 收集最近 10 幀來取眾數，解決閃爍問題

let actionButton;              // 流程控制按鈕
let adventureButton;           // 出發冒險按鈕
let homeButton;                // 回首頁按鈕
let pauseButton;               // 暫停按鈕
let tutorialImgs = [];         // 宣告陣列用來存放 0-9 的教材圖片
let enlargedImageIndex = -1;   // 用來記錄目前被放大的圖片索引 (-1 表示無)
let viewedCards = new Set();   // 記錄已閱讀的卡片索引

// 新增：動畫過渡相關變數
let activeImageIndex = -1;     // 為了淡出動畫，記錄最後一次放大的圖片索引
let overlayAlpha = 0;          // 遮罩與大圖的透明度 (0~220)
let animSlideX = 0;            // 圖片左右切換時的 X 軸滑動偏移量
let animPrevIndex = -1;        // 記錄上一張圖片的索引（滑動時使用）
let slideDirection = 0;        // 1 表示向右滑，-1 表示向左滑

// 新增：小提示系統相關變數
let hintState = "CLOSED";      // 小提示狀態: "CLOSED", "MENU", "IMAGE"
let hintImageIndex = -1;       // 當前顯示的小提示圖片索引

// 遊戲邏輯變數
let targetGesture = "";
let gameScore = 0;
let isEndlessMode = false;      // 是否為無上限練習模式
const gestures = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
let showCorrectMessage = false; // 記錄是否顯示答對提示
let correctMessageTime = 0;     // 記錄答對的時間
let isHolding = false;          // 記錄是否正在維持正確手勢
let holdStartTime = 0;          // 記錄開始維持正確手勢的時間

let confettis = [];             // 儲存結算畫面的彩帶粒子
let coverDigits = [];           // 儲存封面背景漂浮數字

// === 第三部分：出發冒險相關變數 ===
let advState = {
  hp: 3,                 // 生命值
  score: 0,              // 消除障礙數
  obstacles: [],         // 障礙物陣列
  projectiles: [],       // 光球陣列
  particles: [],         // 爆炸粒子陣列
  gameOver: false,       // 遊戲是否結束
  gameWon: false,        // 遊戲是否勝利
  isPaused: false,       // 遊戲是否暫停
  groundY: 0,            // 地板高度
  hurtTimer: 0,          // 受傷閃爍特效計時器
  animTime: 0,           // 控制動畫的時間，暫停時停止增加
  clouds: [],            // 雲朵陣列
  birds: [],             // 飛鳥陣列
  decorations: []        // 草地裝飾陣列
};

function preload() {
  // 迴圈載入 0.png 到 9.png
  for (let i = 0; i < 10; i++) {
    // 加上 image/ 資料夾路徑
    tutorialImgs[i] = loadImage(`image/${i}.png`);
  }
}

function setup() {
  // 建立全螢幕畫布
  createCanvas(windowWidth, windowHeight);
  
  // === 載入外部字體 (Noto Sans TC 與 Montserrat) ===
  let fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&family=Noto+Sans+TC:wght@400;500;900&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  // === 初始化封面背景漂浮數字 ===
  let colors = ['#F4C542', '#32CD32', '#FF69B4', '#00BFFF', '#9370DB', '#FF4500'];
  for (let i = 0; i < 30; i++) {
    coverDigits.push({
      num: floor(random(10)),
      x: random(windowWidth),
      y: random(windowHeight),
      size: random(40, 150),
      color: random(colors),
      alpha: random(15, 60), // 淡淡的半透明
      angle: random(TWO_PI),
      speedY: random(-0.5, 0.5),
      speedX: random(-0.5, 0.5),
      spin: random(-0.01, 0.01)
    });
  }

  // === 建立流程控制按鈕 ===
  actionButton = createButton('下一步');
  actionButton.position(width / 2 - 75, height - 100);
  actionButton.size(150, 50);
  actionButton.style('font-size', '24px');
  actionButton.style('cursor', 'pointer');
  actionButton.style('border-radius', '12px');
  actionButton.style('background-color', '#F4C542'); // 暖黃色
  actionButton.style('color', '#2F4F6F'); // 深藍色
  actionButton.style('border', 'none');
  actionButton.style('font-family', '"Noto Sans TC", sans-serif');
  actionButton.style('font-weight', '900');
  actionButton.style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');
  actionButton.style('z-index', '1000');
  actionButton.mousePressed(nextState);
  actionButton.hide(); // 封面階段先隱藏按鈕

  // === 建立出發冒險按鈕 ===
  adventureButton = createButton('出發冒險');
  adventureButton.size(200, 50);
  adventureButton.style('font-size', '24px');
  adventureButton.style('cursor', 'pointer');
  adventureButton.style('border-radius', '12px');
  adventureButton.style('background-color', '#32CD32'); // 採用綠色做為冒險前進的顏色
  adventureButton.style('color', '#FFFFFF'); 
  adventureButton.style('border', 'none');
  adventureButton.style('font-family', '"Noto Sans TC", sans-serif');
  adventureButton.style('font-weight', '900');
  adventureButton.style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');
  adventureButton.style('z-index', '1000');
  adventureButton.mousePressed(goToAdventure);
  adventureButton.hide(); // 預設隱藏

  // === 建立回首頁按鈕 ===
  homeButton = createButton('回首頁');
  homeButton.size(200, 50);
  homeButton.style('font-size', '24px');
  homeButton.style('cursor', 'pointer');
  homeButton.style('border-radius', '12px');
  homeButton.style('background-color', '#87CEFA'); // 柔和的天藍色
  homeButton.style('color', '#2F4F6F');
  homeButton.style('border', 'none');
  homeButton.style('font-family', '"Noto Sans TC", sans-serif');
  homeButton.style('font-weight', '900');
  homeButton.style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');
  homeButton.style('z-index', '1000');
  homeButton.mousePressed(goHome);
  homeButton.hide(); // 預設隱藏

  // === 建立暫停按鈕 ===
  pauseButton = createButton('暫停');
  pauseButton.size(100, 50);
  pauseButton.style('font-size', '24px');
  pauseButton.style('cursor', 'pointer');
  pauseButton.style('border-radius', '12px');
  pauseButton.style('background-color', '#FF6347'); // 橘紅色
  pauseButton.style('color', '#FFFFFF');
  pauseButton.style('border', 'none');
  pauseButton.style('font-family', '"Noto Sans TC", sans-serif');
  pauseButton.style('font-weight', '900');
  pauseButton.style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');
  pauseButton.style('z-index', '1000');
  pauseButton.mousePressed(togglePause);
  pauseButton.hide(); // 預設隱藏
}

function nextState() {
  if (appState === "TUTORIAL") {
    appState = "WARNING";
    actionButton.html("開啟鏡頭並開始");
    actionButton.size(250, 50);
    actionButton.position(width / 2 - 125, height - 100);
  } else if (appState === "WARNING") {
    appState = "LOADING";
    actionButton.hide();
    startCamera();
  } else if (appState === "RESULT") {
    isEndlessMode = true;        // 開啟無上限練習模式
    gameScore = 0;               // 重置分數
    isFading = false;            
    calibrateProgress = 0;       // 重置校正進度
    appState = "CALIBRATING";    // 直接回到校正畫面重新開始
    actionButton.hide();
    homeButton.hide();
    adventureButton.position(width - 220, 20); // 將出發冒險按鈕移至畫面右上角，讓玩家隨時可前往下一關
  } else if (appState === "ADVENTURE_WARNING") {
    appState = "ADVENTURE";
    actionButton.hide();
    initAdventure();
  } else if (appState === "ADVENTURE") {
    // 處理遊戲結束後的重新挑戰
    initAdventure();
    actionButton.hide();
    homeButton.hide();
  }
}

// === 回到首頁處理 ===
function goHome() {
  appState = "COVER";
  
  // 重置 actionButton 為預設狀態
  actionButton.html("下一步");
  actionButton.size(150, 50);
  actionButton.position(width / 2 - 75, height - 100);
  
  actionButton.hide();
  adventureButton.hide();
  homeButton.hide();
  // 重置教學卡片閱讀進度
  enlargedImageIndex = -1;
  viewedCards.clear();
  
  // 重置第二階段遊戲狀態
  gameScore = 0;
  isEndlessMode = false;
  isHolding = false;
  showCorrectMessage = false;
}

// 點擊出發冒險按鈕的處理
function goToAdventure() {
  appState = "ADVENTURE_WARNING";
  actionButton.html("出發");
  actionButton.size(200, 50);
  actionButton.position(width / 2 - 100, height - 100);
  actionButton.show();
  
  adventureButton.hide();
  homeButton.hide();
}

// === 初始化冒險模式 ===
function initAdventure() {
  advState.hp = 3;
  advState.score = 0;
  advState.obstacles = [];
  advState.projectiles = []; // 重置光球
  advState.particles = [];   // 重置粒子
  advState.gameOver = false;
  advState.gameWon = false;
  advState.isPaused = false;
  advState.groundY = height * 0.85; // 地板高度設定在畫面下方
  advState.hurtTimer = 0;
  advState.animTime = 0; // 重置動畫時間

  // 初始化背景雲朵
  advState.clouds = [];
  for (let i = 0; i < 5; i++) {
    advState.clouds.push({
      x: random(width),
      y: random(50, advState.groundY - 150),
      w: random(80, 180),
      h: random(30, 60),
      speed: random(0.2, 0.8)
    });
  }
  
  // 初始化背景飛鳥
  advState.birds = [];
  for (let i = 0; i < 4; i++) {
    advState.birds.push({
      x: random(width),
      y: random(50, advState.groundY - 200),
      speedX: random(1.5, 3.5),
      speedY: random(-0.3, 0.3),
      flapSpeed: random(0.008, 0.015),
      flapOffset: random(TWO_PI),
      size: random(10, 18)
    });
  }

  isHolding = false;
  holdStartTime = 0;

  if (pauseButton) {
    pauseButton.html("暫停");
    pauseButton.position(30, 110); // 移至消除障礙文字下方
    pauseButton.show();
  }
}

// === 切換暫停狀態 ===
function togglePause() {
  advState.isPaused = !advState.isPaused;
  if (advState.isPaused) {
    pauseButton.html("繼續");
  } else {
    pauseButton.html("暫停");
  }
}

// === 檢查教學進度來控制按鈕 ===
function checkTutorialProgress() {
  if (appState === "TUTORIAL" && viewedCards.size >= 10 && enlargedImageIndex === -1) {
    actionButton.html("下一步");
    actionButton.size(150, 50);
    actionButton.position(width / 2 - 75, height - 100);
    actionButton.show();
  } else {
    actionButton.hide();
  }
}

function startCamera() {
  // 如果模型已經載入過，直接進行狀態切換，避免重複載入攝影機
  if (modelLoaded) {
    appState = "CALIBRATING";
    return;
  }

  // 取得攝影機影像，並加入「限制解析度與幀率」的設定
  let constraints = {
    audio: false,
    video: {
      width: 640,
      height: 480,
      frameRate: { max: 30 }
    }
  };
  capture = createCapture(constraints);
  capture.hide(); // 隱藏預設的 HTML 影片元素
  
  // 載入 ml5.js handpose 模型
  handpose = ml5.handpose(capture, () => {
    console.log("Handpose 模型載入成功！");
    modelLoaded = true;
    appState = "CALIBRATING"; // 模型載入完畢，進入校正階段
  });
  
  // 監聽辨識結果
  handpose.on("predict", results => {
    predictions = results;
  });
}

function draw() {
  // 設定背景顏色為淺灰白
  background('#F5F7FA');
  
  // 在非第三階段時，共用背景漂浮數字
  if (appState !== "ADVENTURE") {
    drawFloatingDigits();
  }

  if (appState === "COVER") {
    drawCover();
  } else if (appState === "TUTORIAL") {
    drawTutorial();
  } else if (appState === "WARNING") {
    drawWarning();
  } else if (appState === "LOADING") {
    drawLoading();
  } else if (appState === "CALIBRATING") {
    drawCameraView();
    drawCalibrating();
    drawGameUI();
    drawHintModal();
  } else if (appState === "PLAYING") {
    drawCameraView();
    drawPlaying();
    drawGameUI();
    drawHintModal();
  } else if (appState === "RESULT") {
    drawResult();
  } else if (appState === "ADVENTURE_WARNING") {
    drawAdventureWarning();
  } else if (appState === "ADVENTURE") {
    drawAdventure();
  }
}

// === 繪製封面 ===
function drawCover() {
  push();
  
  textAlign(CENTER, CENTER);

  let titleSize = min(80, width * 0.08, height * 0.1);
  textSize(titleSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${titleSize}px "Noto Sans TC", sans-serif`;
  
  let titleStr = "手語數字大冒險";
  let titleY = height * 0.4;
  
  // 繪製黃色螢光筆塗鴉裝飾 (在文字後方)
  push();
  noStroke();
  fill(244, 197, 66, 200); // 帶有一點透明度的暖黃色 (#F4C542)
  rectMode(CENTER);
  translate(width / 2, titleY + titleSize * 0.25); // 定位在文字下半部
  rotate(-0.02); // 微微傾斜增加手繪塗鴉感
  rect(0, 0, textWidth(titleStr) * 1.05, titleSize * 0.4, titleSize * 0.2); // 寬度稍寬於文字，帶有圓角
  pop();

  // 主標題：手語數字大冒險(粗體)
  fill('#2F4F6F'); // 深藍色
  noStroke();
  text(titleStr, width / 2, titleY);

  // 副標題：從 0 到 9，一起認識台灣手語裡的數字！(一般)
  fill('#5D7A99'); // 輔助藍
  let subtitleSize = min(32, width * 0.035, height * 0.05);
  textSize(subtitleSize);
  drawingContext.font = `500 ${subtitleSize}px "Noto Sans TC", sans-serif`;
  text("從 0 到 9，一起認識台灣手語裡的數字！", width / 2, height * 0.55);

  // 下方提示：點擊任意處開始冒險 (加上微小的閃爍動畫增加互動感)
  let alpha = map(sin(millis() / 300), -1, 1, 100, 255);
  fill(150, 150, 150, alpha); // 淺灰色，帶有呼吸燈透明度
  let hintSize = min(20, width * 0.025);
  textSize(hintSize);
  drawingContext.font = `500 ${hintSize}px "Noto Sans TC", sans-serif`;
  text("點擊任意處或按「空白鍵」開始冒險", width / 2, height * 0.85);
  
  pop();
}

// === 動態計算教學畫面的排版與卡片位置，避免文字與卡片重疊 ===
function getTutorialLayout() {
  let hintSize = min(40, width * 0.045, height * 0.06);     // 第一部分標題的字體大小 (放大)
  let subHintSize = min(20, width * 0.022, height * 0.035); // 縮小下方說明文字的字體大小
  let leading = min(36, height * 0.05);
  let hintY = max(30, height * 0.06); // 提示文字的 Y 座標
  
  let imgW = min(180, width * 0.11, height * 0.16); // 放大卡片圖片寬度基準
  let estimatedImgH = (tutorialImgs[0] && tutorialImgs[0].width > 0) ? tutorialImgs[0].height * (imgW / tutorialImgs[0].width) : imgW;
  
  let cardW = imgW + min(40, width * 0.03);
  let cardH = estimatedImgH + min(80, height * 0.1);
  let spacingX = cardW + min(30, width * 0.02);
  let spacingY = cardH + min(40, height * 0.03);
  let startX = width / 2 - (spacingX * 2);
  
  // 動態計算圖片排版的 Y 軸中心，確保完美置中在提示文字底部跟按鈕頂部的「安全空白區域」
  let hintBottom = hintY + hintSize + 15 + (leading * 0.8 * 2) + 10; 
  let barY = hintBottom + 40; // 進度條的 Y 座標
  let buttonTop = height - 120;
  let startY = ((barY + 20 + buttonTop) / 2) - (spacingY * 0.5);

  return {
    hintSize, subHintSize, leading, hintY, barY,
    imgW, cardW, cardH, spacingX, spacingY, startX, startY
  };
}

function drawTutorial() {
  push();
  
  let layout = getTutorialLayout();
  let titleStr = "【第一部分：整裝待發】";

  // 先設定第一部分標題字體，以便讓後方螢光筆抓取正確寬度
  textSize(layout.hintSize);
  textStyle(BOLD); // 確保標題為粗體
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${layout.hintSize}px "Noto Sans TC", sans-serif`;

  // 繪製黃色螢光筆塗鴉裝飾 (在文字後方)
  push();
  noStroke();
  fill(244, 197, 66, 200); // 帶有一點透明度的暖黃色
  rectMode(CENTER);
  translate(width / 2, layout.hintY + layout.hintSize * 0.75); // 定位在文字下半部
  rotate(-0.02); // 微微傾斜
  rect(0, 0, textWidth(titleStr) * 1.05, layout.hintSize * 0.4, layout.hintSize * 0.2); // 寬度稍寬於文字，帶有圓角
  pop();

  // 顯示第一部分標題
  textAlign(CENTER, TOP); // 改為對齊上方，避免向下擠壓
  fill('#2F4F6F'); // 深藍色
  noStroke();
  text(titleStr, width / 2, layout.hintY);

  // 顯示下方說明 (字體縮小)
  fill('#5D7A99'); // 輔助藍
  textSize(layout.subHintSize);
  textStyle(NORMAL); // 恢復一般字體粗細
  textLeading(layout.leading * 0.8);
  drawingContext.font = `500 ${layout.subHintSize}px "Noto Sans TC", sans-serif`;
  let subHintText = "請先熟悉 0-9 的手語數字，點擊圖片可放大查看。\n" +
                    "閱讀完所有卡片後才能點擊下方「下一步」。";
  text(subHintText, width / 2, layout.hintY + layout.hintSize + 15);

  // 繪製進度條
  let progress = viewedCards.size / 10;
  let barWidth = min(300, width * 0.3);
  let barHeight = 12;
  let barX = width / 2 - barWidth / 2;
  
  noStroke();
  fill(93, 122, 153, 50); // 淺色底框
  rectMode(CORNER);
  rect(barX, layout.barY, barWidth, barHeight, 6);
  
  if (progress > 0) {
    fill('#F4C542'); // 暖黃色進度
    rect(barX, layout.barY, barWidth * progress, barHeight, 6);
  }
  
  fill('#5D7A99');
  let progressTextSize = min(16, width * 0.02);
  textSize(progressTextSize);
  textAlign(CENTER, BOTTOM);
  drawingContext.font = `700 ${progressTextSize}px "Noto Sans TC", sans-serif`;
  text(`閱讀進度：${viewedCards.size} / 10`, width / 2, layout.barY - 10);

  // === 繪製資料來源超連結 ===
  let linkText = "資料來源:衛生福利部-社會與家庭屬-政府資訊公開專區-臺灣手語基礎字彙圖卡(部分)";
  let linkW = min(600, width * 0.8);
  let linkY = height - 35; // 放置於按鈕下方的視窗最底側
  
  // 判斷滑鼠是否懸停在文字區域
  let isLinkHover = (enlargedImageIndex === -1 && mouseX > width / 2 - linkW / 2 && mouseX < width / 2 + linkW / 2 && mouseY > linkY && mouseY < linkY + 30);
  
  fill(isLinkHover ? '#E67E22' : '#9BAEBF'); // 懸停時變橘色，平常為淡藍灰色
  noStroke();
  let linkSize = min(12, width * 0.025);
  textSize(linkSize);
  textAlign(CENTER, TOP); // p5.js 中搭配寬度參數，會以 width/2 - linkW/2 為起點往右自動換行置中
  drawingContext.font = `500 ${linkSize}px "Noto Sans TC", sans-serif`;
  text(linkText, width / 2 - linkW / 2, linkY, linkW);

  // 顯示 0-9 的教材圖片 (排成兩排)
  if (tutorialImgs.length === 10) {
    for (let i = 0; i < 10; i++) {
      let row = floor(i / 5); // 0 或 1 (分兩排)
      let col = i % 5;        // 0 到 4 (每排 5 張)
      let x = layout.startX + col * layout.spacingX;
      let y = layout.startY + row * layout.spacingY;

      let img = tutorialImgs[i];
      if (img && img.width > 0) { // 確保圖片已載入成功
        let imgH = img.height * (layout.imgW / img.width);
        
        // 判斷滑鼠是否懸停在卡片上
        let isHover = (mouseX > x - layout.cardW / 2 && mouseX < x + layout.cardW / 2 &&
                       mouseY > y - layout.cardH / 2 && mouseY < y + layout.cardH / 2);
        
        let scaleFactor = isHover ? 1.05 : 1.0;
        let offsetY = isHover ? -10 : 0;
        
        push();
        translate(x, y + offsetY);
        scale(scaleFactor);
        
        // 畫卡片陰影
        drawingContext.shadowOffsetX = 0;
        drawingContext.shadowOffsetY = isHover ? 12 : 4;
        drawingContext.shadowBlur = isHover ? 20 : 10;
        drawingContext.shadowColor = 'rgba(0, 0, 0, 0.15)';
        
        // 畫白底圓角卡片
        fill(255);
        noStroke();
        rectMode(CENTER);
        rect(0, 0, layout.cardW, layout.cardH, 16);
        
        // 關閉陰影以免影響圖片與文字
        drawingContext.shadowColor = 'transparent';
        
        // 畫手語圖片 (稍微往上移，留空間給文字)
        imageMode(CENTER);
        image(img, 0, -min(15, layout.cardH * 0.08), layout.imgW, imgH);
        
        // 畫數字標示
        fill('#2F4F6F'); // 深藍色
        let cardNumSize = min(32, width * 0.035, height * 0.04);
        textSize(cardNumSize);
        textFont('Montserrat');
        drawingContext.font = `900 ${cardNumSize}px "Montserrat", sans-serif`;
        textAlign(CENTER, CENTER);
        text(i, 0, layout.cardH / 2 - min(25, layout.cardH * 0.15));
        pop();
      }
    }

    // === 計算淡入淡出目標透明度與滑動偏移 ===
    let targetAlpha = (enlargedImageIndex !== -1) ? 220 : 0;
    overlayAlpha = lerp(overlayAlpha, targetAlpha, 0.15); // 平滑透明度
    animSlideX = lerp(animSlideX, 0, 0.15);               // 平滑滑動
    
    if (enlargedImageIndex !== -1) {
      activeImageIndex = enlargedImageIndex; // 更新實際顯示的圖片
    }

    // 若有圖片被放大或「正在淡出」，繪製放大畫面與遮罩
    if (overlayAlpha > 1 && activeImageIndex !== -1) {
      // 畫一個半透明黑色背景遮罩
      rectMode(CORNER);
      fill(0, 0, 0, overlayAlpha); 
      rect(0, 0, width, height);

      // 設定整體的透明度，套用於後續的圖片與文字 (0.0 ~ 1.0)
      drawingContext.globalAlpha = overlayAlpha / 220.0;

      // 確保使用中心點對齊來繪製放大的圖片
      imageMode(CENTER);

      // 1. 繪製前一張圖片 (正在滑出)
      if (animPrevIndex !== -1 && animPrevIndex !== activeImageIndex && abs(animSlideX) > 1) {
        let prevImg = tutorialImgs[animPrevIndex];
        let prevW = min(800, width * 0.6); // 稍微縮小為 0.6 以留出邊界
        let prevH = prevImg.height * (prevW / prevImg.width);
        if (prevH > height * 0.6) {
          prevH = height * 0.6;
          prevW = prevImg.width * (prevH / prevImg.height);
        }
        let offsetOut = animSlideX + (slideDirection === 1 ? -width : width);
        image(prevImg, width / 2 + offsetOut, height / 2, prevW, prevH);
        fill('#F4C542'); // 暖黃色
        let prevNumSize = min(80, width * 0.08);
        textSize(prevNumSize);
        textFont('Montserrat');
        drawingContext.font = `900 ${prevNumSize}px "Montserrat", sans-serif`;
        text(animPrevIndex, width / 2 + offsetOut, height / 2 - prevH / 2 - 50);
      }

      // 2. 繪製當前圖片 (正在滑入或縮放顯示)
      let img = tutorialImgs[activeImageIndex];
      let bigImgW = min(800, width * 0.6); 
      let bigImgH = img.height * (bigImgW / img.width);
      
      if (bigImgH > height * 0.6) {
        bigImgH = height * 0.6;
        bigImgW = img.width * (bigImgH / img.height);
      }

      image(img, width / 2 + animSlideX, height / 2, bigImgW, bigImgH);
      
      fill('#F4C542'); // 暖黃色
      let bigNumSize = min(80, width * 0.08);
      textSize(bigNumSize);
      textFont('Montserrat');
      drawingContext.font = `900 ${bigNumSize}px "Montserrat", sans-serif`;
      text(activeImageIndex, width / 2 + animSlideX, height / 2 - bigImgH / 2 - 50);

      fill(255);
      textSize(24);
      textFont('Noto Sans TC');
      drawingContext.font = `500 24px "Noto Sans TC", sans-serif`;
      text("點擊畫面任何地方返回，或使用 ⬅️ ➡️ 方向鍵切換圖片", width / 2, height / 2 + bigImgH / 2 + 50);
      
      // 繪製左右箭頭提示 (加入懸停高亮效果)
      textSize(48);
      drawingContext.font = `900 48px "Noto Sans TC", sans-serif`;
      let leftArrowX = width / 2 - bigImgW / 2 - 60;
      let rightArrowX = width / 2 + bigImgW / 2 + 60;
      let arrowY = height / 2;
      
      // 左邊箭頭
      if (dist(mouseX, mouseY, leftArrowX, arrowY) < 50) {
        fill('#F4C542');
      } else {
        fill(255, 255, 255, 150); // globalAlpha 會自動疊加透明度
      }
      text("◀", leftArrowX, arrowY);
      
      // 右邊箭頭
      if (dist(mouseX, mouseY, rightArrowX, arrowY) < 50) {
        fill('#F4C542');
      } else {
        fill(255, 255, 255, 150);
      }
      text("▶", rightArrowX, arrowY);
      
      drawingContext.globalAlpha = 1.0; // 恢復預設透明度
    }
  }
  pop();
}

function drawWarning() {
  push();
  
  let hintSize = min(40, width * 0.045, height * 0.06);     // 第二部分標題的字體大小 (放大並與第一部分統一)
  let subHintSize = min(24, width * 0.026, height * 0.04);  // 縮小下方說明文字的字體大小
  let leading = min(54, height * 0.07);                     // 加大行距，讓閱讀更舒適

  let warningText = "⚠️ 接下來將會開啟您的攝影機進行手勢辨識。\n\n" +
                    "遊戲操作說明：\n" +
                    "1. 畫面出現後，請將手掌對準左側或右側的圖示，維持 1 秒鐘進行啟動校正。\n" +
                    "2. 校正完成後，畫面上方會出現指定的「目標數字」。\n" +
                    "3. 本挑戰沒有時間限制，請對著鏡頭比出正確的手語數字，累積答對 15 題即可通關！\n" +
                    "4. 通關後您可以自由選擇「繼續練習」無上限挑戰，或「出發冒險」進入下一階段！\n\n" +
                    "準備好迎接挑戰了嗎？請點擊「開啟鏡頭並開始」";

  let lines = warningText.split('\n').length;
  let cardW = min(900, width * 0.85); // 加寬以容納說明文字
  let cardH = lines * leading + 80;
  
  // 動態計算整體高度，讓標題與卡片在視窗與按鈕之間「完美垂直置中」
  let totalHeight = hintSize + 30 + cardH;
  let buttonTop = height - 100; // 下方按鈕的位置
  let hintY = max(20, (buttonTop - totalHeight) / 2); 
  let cardTop = hintY + hintSize + 30;

  let titleStr = "【第二部分：實戰演練】";

  // 先設定第二部分標題字體，以便讓後方螢光筆抓取正確寬度
  textSize(hintSize);
  textStyle(BOLD); // 確保標題為粗體
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${hintSize}px "Noto Sans TC", sans-serif`;

  // 繪製黃色螢光筆塗鴉裝飾 (在文字後方)
  push();
  noStroke();
  fill(244, 197, 66, 200); // 帶有一點透明度的暖黃色
  rectMode(CENTER);
  translate(width / 2, hintY + hintSize * 0.75); // 定位在文字下半部
  rotate(-0.02); // 微微傾斜
  rect(0, 0, textWidth(titleStr) * 1.05, hintSize * 0.4, hintSize * 0.2); // 寬度稍寬於文字，帶有圓角
  pop();

  // 顯示第二部分標題
  textAlign(CENTER, TOP); // 改為對齊上方，避免向下擠壓
  fill('#2F4F6F'); // 深藍色
  noStroke();
  text(titleStr, width / 2, hintY);

  // 繪製白底陰影卡片
  push();
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 8;
  drawingContext.shadowBlur = 20;
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.15)';
  fill(255);
  noStroke();
  rectMode(CENTER);
  rect(width / 2, cardTop + cardH / 2, cardW, cardH, 16);
  pop();

  // 顯示下方說明 (支援關鍵字高亮)
  textSize(subHintSize);
  textAlign(LEFT, TOP); // 改為靠左繪製，以利分段拼接
  
  let linesArray = warningText.split('\n');
  let currentY = cardTop + 40;
  
  for (let i = 0; i < linesArray.length; i++) {
    let lineStr = linesArray[i];
    if (lineStr === "") {
      currentY += leading;
      continue;
    }

    // 利用正則表達式分割字串，並保留關鍵字
    let parts = lineStr.split(/(維持 1 秒鐘|15 題)/g);
    
    // 先計算這行文字真正的總寬度 (考慮粗體的寬度差異)
    let totalLineWidth = 0;
    for (let part of parts) {
      if (!part) continue;
      let isKeyword = (part === "維持 1 秒鐘" || part === "15 題");
      drawingContext.font = isKeyword ? `900 ${subHintSize}px "Noto Sans TC", sans-serif` : `500 ${subHintSize}px "Noto Sans TC", sans-serif`;
      totalLineWidth += textWidth(part);
    }

    // 繪製這行文字，起始 X 座標讓整行置中
    let currentX = width / 2 - totalLineWidth / 2;
    for (let part of parts) {
      if (!part) continue;
      let isKeyword = (part === "維持 1 秒鐘" || part === "15 題");
      fill(isKeyword ? '#E67E22' : '#5D7A99'); // 關鍵字使用暖橘色，其餘用輔助藍
      drawingContext.font = isKeyword ? `900 ${subHintSize}px "Noto Sans TC", sans-serif` : `500 ${subHintSize}px "Noto Sans TC", sans-serif`;
      text(part, currentX, currentY);
      currentX += textWidth(part);
    }
    currentY += leading;
  }
  pop();
}

function drawAdventureWarning() {
  push();
  
  let hintSize = min(40, width * 0.045, height * 0.06);     
  let subHintSize = min(24, width * 0.026, height * 0.04);  
  let leading = min(54, height * 0.07);                     

  let warningText = "準備好迎接最終挑戰了嗎？\n\n" +
                    "遊戲操作說明：\n" +
                    "1. 接下來您將要保護小人，讓他順利前進！\n" +
                    "2. 畫面右側會出現帶有數字的障礙物，請對鏡頭比出對應的手語數字。\n" +
                    "3. 維持正確手勢一小段時間，就能發射魔法光球擊碎障礙物！\n" +
                    "4. 小人最多只能承受 3 次撞擊，成功消滅 20 個障礙物即可完全通關！\n\n" +
                    "若準備好了，請點擊「出發」";

  let lines = warningText.split('\n').length;
  let cardW = min(900, width * 0.85); 
  let cardH = lines * leading + 80;
  
  // 動態計算整體高度，讓標題與卡片在視窗與按鈕之間「完美垂直置中」
  let totalHeight = hintSize + 30 + cardH;
  let buttonTop = height - 100; // 下方按鈕的位置
  let hintY = max(20, (buttonTop - totalHeight) / 2); 
  let cardTop = hintY + hintSize + 30;

  let titleStr = "【第三部分：出發冒險】";

  // 先設定第三部分標題字體，以便讓後方螢光筆抓取正確寬度
  textSize(hintSize);
  textStyle(BOLD); 
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${hintSize}px "Noto Sans TC", sans-serif`;

  // 繪製黃色螢光筆塗鴉裝飾 (在文字後方)
  push();
  noStroke();
  fill(244, 197, 66, 200); 
  rectMode(CENTER);
  translate(width / 2, hintY + hintSize * 0.75); 
  rotate(-0.02); 
  rect(0, 0, textWidth(titleStr) * 1.05, hintSize * 0.4, hintSize * 0.2); 
  pop();

  // 顯示第三部分標題
  textAlign(CENTER, TOP); 
  fill('#2F4F6F'); 
  noStroke();
  text(titleStr, width / 2, hintY);

  // 繪製白底陰影卡片
  push();
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 8;
  drawingContext.shadowBlur = 20;
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.15)';
  fill(255);
  noStroke();
  rectMode(CENTER);
  rect(width / 2, cardTop + cardH / 2, cardW, cardH, 16);
  pop();

  // 顯示下方說明 (支援關鍵字高亮)
  textSize(subHintSize);
  textAlign(LEFT, TOP); 
  
  let linesArray = warningText.split('\n');
  let currentY = cardTop + 40;
  
  for (let i = 0; i < linesArray.length; i++) {
    let lineStr = linesArray[i];
    if (lineStr === "") {
      currentY += leading;
      continue;
    }

    // 利用正則表達式分割字串，並保留關鍵字
    let parts = lineStr.split(/(3 次撞擊|20 個障礙物|完全通關)/g);
    
    let totalLineWidth = 0;
    for (let part of parts) {
      if (!part) continue;
      let isKeyword = (part === "3 次撞擊" || part === "20 個障礙物" || part === "完全通關");
      drawingContext.font = isKeyword ? `900 ${subHintSize}px "Noto Sans TC", sans-serif` : `500 ${subHintSize}px "Noto Sans TC", sans-serif`;
      totalLineWidth += textWidth(part);
    }

    // 繪製這行文字，起始 X 座標讓整行置中
    let currentX = width / 2 - totalLineWidth / 2;
    for (let part of parts) {
      if (!part) continue;
      let isKeyword = (part === "3 次撞擊" || part === "20 個障礙物" || part === "完全通關");
      fill(isKeyword ? '#E67E22' : '#5D7A99'); // 關鍵字使用暖橘色，其餘用輔助藍
      drawingContext.font = isKeyword ? `900 ${subHintSize}px "Noto Sans TC", sans-serif` : `500 ${subHintSize}px "Noto Sans TC", sans-serif`;
      text(part, currentX, currentY);
      currentX += textWidth(part);
    }
    currentY += leading;
  }
  pop();
}

function drawLoading() {
  fill('#5D7A99'); // 輔助藍
  noStroke();
  let loadSize = min(32, width * 0.04);
  textSize(loadSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${loadSize}px "Noto Sans TC", sans-serif`;
  textAlign(CENTER, CENTER);
  
  // 動態計算點點動畫：每 500 毫秒增加一個點，從 1 到 3 個點循環
  let dotCount = (floor(millis() / 500) % 3) + 1;
  let dots = ".".repeat(dotCount);
  text(`模型與攝影機載入中，請稍候${dots}`, width / 2, height / 2);
}

// === 繪製遊戲階段通用介面 (提醒與提示按鈕) ===
function drawGameUI() {
  push();
  let camBottomY = height / 2 + height * 0.25;
  let textY = camBottomY + 35;
  
  // 小提醒文字
  fill('#5D7A99');
  noStroke();
  let hintTextSize = min(20, width * 0.02);
  textSize(hintTextSize);
  textFont('Noto Sans TC');
  drawingContext.font = `500 ${hintTextSize}px "Noto Sans TC", sans-serif`;
  textAlign(CENTER, CENTER);
  text("小提醒：一隻手入鏡即可唷！", width / 2 - 60, textY);
  
  // 小提示按鈕
  let btnX = width / 2 + 150;
  let btnY = textY;
  let btnW = 100;
  let btnH = 36;
  let isHover = mouseX > btnX - btnW/2 && mouseX < btnX + btnW/2 && mouseY > btnY - btnH/2 && mouseY < btnY + btnH/2;
  
  fill(isHover ? '#F4C542' : '#FFFFFF');
  stroke('#2F4F6F');
  strokeWeight(2);
  rectMode(CENTER);
  rect(btnX, btnY, btnW, btnH, 18); // 圓角藥丸形狀
  
  fill('#2F4F6F');
  noStroke();
  textSize(16);
  drawingContext.font = `900 16px "Noto Sans TC", sans-serif`;
  text("💡 小提示", btnX, btnY);
  pop();
}

// === 繪製小提示選單與圖解 ===
function drawHintModal() {
  if (hintState === "CLOSED") return;
  
  push();
  // 繪製半透明遮罩
  rectMode(CORNER);
  fill(0, 0, 0, 200);
  rect(0, 0, width, height);
  
  if (hintState === "MENU") {
    fill('#FFFFFF');
    textAlign(CENTER, CENTER);
    textSize(32);
    textFont('Noto Sans TC');
    drawingContext.font = `900 32px "Noto Sans TC", sans-serif`;
    text("請選擇想查看的數字", width / 2, height / 2 - 120);
    
    // 繪製 0-9 數字按鈕陣列
    for(let i = 0; i < 10; i++) {
      let row = floor(i / 5);
      let col = i % 5;
      let bx = width / 2 - 160 + col * 80;
      let by = height / 2 - 30 + row * 80;
      
      let isHover = dist(mouseX, mouseY, bx, by) < 30;
      fill(isHover ? '#F4C542' : '#FFFFFF');
      stroke('#2F4F6F');
      strokeWeight(3);
      circle(bx, by, 60);
      
      fill('#2F4F6F');
      noStroke();
      textSize(28);
      drawingContext.font = `900 28px "Montserrat", sans-serif`;
      text(i, bx, by);
    }
    
    fill('#FFFFFF');
    textSize(20);
    drawingContext.font = `500 20px "Noto Sans TC", sans-serif`;
    text("點擊畫面其他地方關閉", width / 2, height / 2 + 150);
    
  } else if (hintState === "IMAGE" && hintImageIndex !== -1) {
    let img = tutorialImgs[hintImageIndex];
    let bigImgW = min(800, width * 0.6); 
    let bigImgH = img.height * (bigImgW / img.width);
    if (bigImgH > height * 0.6) {
      bigImgH = height * 0.6;
      bigImgW = img.width * (bigImgH / img.height);
    }
    
    imageMode(CENTER);
    image(img, width / 2, height / 2, bigImgW, bigImgH);
    
    fill('#FFFFFF');
    textAlign(CENTER, CENTER);
    textSize(24);
    drawingContext.font = `500 24px "Noto Sans TC", sans-serif`;
    text("點擊畫面返回選單", width / 2, height / 2 + bigImgH / 2 + 50);
  }
  pop();
}

function drawCameraView() {
  imageMode(CENTER);
  push(); 
  translate(width / 2, height / 2);
  
  // 繪製攝影機邊框
  rectMode(CENTER);
  stroke('#2F4F6F'); // 深藍色邊框
  strokeWeight(8);
  noFill();
  rect(0, 0, width * 0.5, height * 0.5);

  scale(-1, 1); 
  image(capture, 0, 0, width * 0.5, height * 0.5); 
  drawHandSkeleton(predictions);
  pop(); 
}

function drawCalibrating() {
  push();
  textAlign(CENTER, CENTER);
  
  // 設定左右兩邊手掌的位置 (改用相對比例，避免小螢幕超出邊界)
  let leftX = width * 0.15;
  let rightX = width * 0.85;
  let centerY = height / 2;
  let circleSize = min(250, width * 0.18);
  
  let leftFade = 1.0;
  let rightFade = 1.0;
  if (isFading) {
    let currentFade = min((millis() - fadeStartTime) / 500, 1);
    let alphaMultiplier = map(currentFade, 0, 1, 1.0, 0.0);
    if (lockedSide === "left") rightFade = alphaMultiplier;
    else if (lockedSide === "right") leftFade = alphaMultiplier;
  }
  
  let emojiSize = min(120, width * 0.08);
  textSize(emojiSize);
  drawingContext.font = `${emojiSize}px sans-serif`;
  drawingContext.globalAlpha = 0.5 * leftFade;
  text("🖐️", leftX, centerY);
  drawingContext.globalAlpha = 0.5 * rightFade;
  text("🖐️", rightX, centerY);
  drawingContext.globalAlpha = 1.0;
  
  fill('#5D7A99'); // 輔助藍
  noStroke();
  let calSize = min(32, width * 0.03);
  textSize(calSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${calSize}px "Noto Sans TC", sans-serif`;
  // 將提示文字移至攝影機畫面上方
  text("請將手掌對準畫面左側或右側，維持 1 秒鐘", width / 2, height * 0.15);
  
  let activeSide = "";

  if (!isFading) {
    if (predictions.length > 0) {
      let wristX = predictions[0].landmarks[0][0]; 
      let mappedX = map(wristX, 0, capture.width, -(width * 0.5) / 2, (width * 0.5) / 2);
      let canvasX = width / 2 - mappedX; 
      
      activeSide = canvasX < width / 2 ? "left" : "right";
      
      if (calibrateSide !== activeSide) {
        calibrateSide = activeSide;
        calibrateStartTime = millis();
      }
      
      calibrateProgress = min((millis() - calibrateStartTime) / 1000, 1);
      
      if (calibrateProgress >= 1) {
        isFading = true;            
        fadeStartTime = millis();
        lockedSide = calibrateSide; 
      }
    } else {
      calibrateStartTime = 0; 
      calibrateProgress = 0;
      calibrateSide = "";
    }
  } else {
    let currentFade = min((millis() - fadeStartTime) / 500, 1);
    if (currentFade >= 1) {
      appState = "PLAYING"; // 動畫結束，正式進入遊戲階段
      isFading = false;
      pickNewTarget();      // 挑選第一個目標數字
    }
  }
  
  noFill();
  strokeWeight(12);
  
  drawingContext.globalAlpha = leftFade;
  stroke(93, 122, 153, 100); // 輔助藍加上透明度
  circle(leftX, centerY, circleSize);
  
  if (calibrateProgress > 0 && calibrateSide === "left") {
    stroke('#F4C542'); // 暖黃色
    strokeCap(ROUND);
    let angle = map(calibrateProgress, 0, 1, 0, TWO_PI);
    arc(leftX, centerY, circleSize, circleSize, -HALF_PI, -HALF_PI + angle);
  }
  
  drawingContext.globalAlpha = rightFade;
  stroke(93, 122, 153, 100); // 輔助藍加上透明度
  circle(rightX, centerY, circleSize);
  
  if (calibrateProgress > 0 && calibrateSide === "right") {
    stroke('#F4C542'); // 暖黃色
    strokeCap(ROUND);
    let angle = map(calibrateProgress, 0, 1, 0, TWO_PI);
    arc(rightX, centerY, circleSize, circleSize, -HALF_PI, -HALF_PI + angle);
  }
  
  drawingContext.globalAlpha = 1.0;
  pop();
}

function drawPlaying() {
  // 如果小提示被開啟，則暫停辨識與計分
  if (hintState === "CLOSED") {
    checkGesture();
  }
  
  // 若辨識結果與目標一致，開始計時 (需維持 1 秒)
  if (hintState === "CLOSED" && gestureText === targetGesture && targetGesture !== "") {
    if (!isHolding) {
      isHolding = true;
      holdStartTime = millis();
    } else {
      let holdProgress = min((millis() - holdStartTime) / 1000, 1);
      if (holdProgress >= 1) {
        gameScore++;
        isHolding = false;             // 重置狀態
        
        // 若並非無盡模式且達到 15 分，進入結算畫面
        if (!isEndlessMode && gameScore >= 15) {
          appState = "RESULT"; // 達到 15 題，進入結算畫面
          initConfetti();      // 初始化彩帶特效
          actionButton.html("繼續練習");
          actionButton.size(200, 50);
          actionButton.position(width / 2 - 320, height * 0.75);
          actionButton.show();

          adventureButton.position(width / 2 - 100, height * 0.75);
          adventureButton.show();

          homeButton.position(width / 2 + 120, height * 0.75);
          homeButton.show();
        } else {
          pickNewTarget();
          showCorrectMessage = true;     // 觸發答對提示
          correctMessageTime = millis(); // 記錄當下時間
        }
      }
    }
  } else {
    isHolding = false;
    holdStartTime = 0;
  }
  
  push();
  // 顯示得分
  fill('#5D7A99'); // 輔助藍
  noStroke();
  let scoreSize = min(32, width * 0.03);
  textSize(scoreSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${scoreSize}px "Noto Sans TC", sans-serif`;
  textAlign(LEFT, TOP);
  if (isEndlessMode) {
    text(`累積答對題數：${gameScore}`, 20, 20); // 無上限模式顯示累積答對題數
  } else {
    text(`目前得分：${gameScore} / 15`, 20, 20);
    
    // 繪製 15 題通關進度條
    let pbWidth = min(200, width * 0.15);
    let pbHeight = 12;
    let pbY = 20 + scoreSize + 15;
    fill(93, 122, 153, 50); // 淺色底框
    rectMode(CORNER);
    rect(20, pbY, pbWidth, pbHeight, 6);
    fill('#F4C542'); // 暖黃色進度條
    let progress = min(gameScore / 15, 1);
    if (progress > 0) {
      rect(20, pbY, pbWidth * progress, pbHeight, 6);
    }
  }
  
  // 顯示目標數字
  textAlign(CENTER, TOP);
  let targetTextSize = min(48, width * 0.04);
  textSize(targetTextSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${targetTextSize}px "Noto Sans TC", sans-serif`;
  fill('#2F4F6F'); // 深藍色
  text(`請比出：${targetGesture}`, width / 2, 20);

  // 顯示維持手勢的進度條
  if (isHolding) {
    let holdProgress = min((millis() - holdStartTime) / 1000, 1);
    push();
    rectMode(CENTER);
    noStroke();
    fill(93, 122, 153, 100); // 輔助藍加上透明度
    let barY = 20 + targetTextSize + 15;
    rect(width / 2, barY, 200, 10, 5); // 底框
    fill('#32CD32');
    rectMode(CORNER);
    rect(width / 2 - 100, barY - 5, 200 * holdProgress, 10, 5); // 進度條
    pop();
  }

  // 顯示目前辨識結果
  textAlign(CENTER, BOTTOM); // 移至中央
  let resSize = min(56, width * 0.045);
  textSize(resSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${resSize}px "Noto Sans TC", sans-serif`;
  fill('#F4C542'); // 暖黃色
  stroke('#2F4F6F'); // 深藍色邊框       
  strokeWeight(6); 
  text(`辨識結果：${gestureText || "無"}`, width / 2, height - 20); 
  
  // 顯示答對提示動畫 (維持 1 秒並逐漸淡出)
  if (showCorrectMessage) {
    let timePassed = millis() - correctMessageTime;
    if (timePassed < 1000) {
      let alpha = map(timePassed, 0, 1000, 1.0, 0.0);
      drawingContext.globalAlpha = alpha;
      textAlign(CENTER, CENTER);
      let msgSize = min(100, width * 0.08);
      textSize(msgSize);
      textFont('Noto Sans TC');
      drawingContext.font = `900 ${msgSize}px "Noto Sans TC", sans-serif`;
      fill('#32CD32'); // 萊姆綠
      stroke('#2F4F6F'); // 深藍色邊框
      strokeWeight(8);
      text("✅ 答對了！", width / 2, height / 2);
      drawingContext.globalAlpha = 1.0; // 恢復透明度
    } else {
      showCorrectMessage = false;
    }
  }
  pop();
}

// === 繪製過關結算畫面 ===
function drawResult() {
  push();
  textAlign(CENTER, CENTER);
  
  // 繪製與更新彩帶特效
  noStroke();
  for (let i = 0; i < confettis.length; i++) {
    let c = confettis[i];
    push();
    translate(c.x, c.y);
    rotate(c.angle);
    fill(c.color);
    rectMode(CENTER);
    rect(0, 0, c.w, c.h);
    pop();

    c.y += c.speedY;
    c.x += c.speedX;
    c.angle += c.spin;

    // 若彩帶掉出畫面底部，讓它從上方重新落下，維持源源不絕的感覺
    if (c.y > height + 20) {
      c.y = random(-100, -20);
      c.x = random(width);
    }
  }
  
  fill('#2F4F6F'); // 深藍色
  noStroke();
  let titleSize = min(60, width * 0.06);
  textSize(titleSize);
  textFont('Noto Sans TC');
  drawingContext.font = `900 ${titleSize}px "Noto Sans TC", sans-serif`;
  text("🎉 恭喜過關！", width / 2, height * 0.4);

  fill('#5D7A99'); // 輔助藍
  let subSize = min(32, width * 0.035);
  textSize(subSize);
  drawingContext.font = `500 ${subSize}px "Noto Sans TC", sans-serif`;
  text("您已成功答對 15 題，完成實戰演練！", width / 2, height * 0.55);
  
  pop();
}

// === 繪製第三部分冒險畫面 ===
function drawAdventure() {
  // === 繪製天空漸層 (淺天空藍接到地板白色) ===
  push();
  let skyGradient = drawingContext.createLinearGradient(0, 0, 0, advState.groundY);
  skyGradient.addColorStop(0, '#A0C4FF'); // 頂部淺藍色
  skyGradient.addColorStop(1, '#FFFFFF'); // 底部白色
  drawingContext.fillStyle = skyGradient;
  noStroke();
  rectMode(CORNER);
  rect(0, 0, width, height);
  pop();

  // === 繪製與更新雲朵 ===
  push();
  noStroke();
  fill(255, 255, 255, 220); // 半透明白色的雲朵
  for (let c of advState.clouds) {
    if (!advState.isPaused) c.x -= c.speed;
    if (c.x < -c.w) { // 飄出畫面左側後從右側重新生成
      c.x = width + c.w;
      c.y = random(50, advState.groundY - 150);
    }
    rectMode(CENTER);
    rect(c.x, c.y, c.w, c.h, c.h / 2); // 雲朵主體 (圓角矩形)
    circle(c.x - c.w * 0.15, c.y - c.h * 0.3, c.h * 0.8); // 疊加的圓形營造蓬鬆感
    circle(c.x + c.w * 0.15, c.y - c.h * 0.4, c.h * 0.9);
  }
  pop();

  // === 繪製與更新飛鳥 ===
  push();
  noFill();
  stroke('#8CA5B7'); // 淡藍灰色
  strokeWeight(3);
  strokeJoin(ROUND);
  for (let b of advState.birds) {
    if (!advState.isPaused) {
      b.x -= b.speedX;
      b.y += b.speedY;
      if (b.y < 30 || b.y > advState.groundY - 150) b.speedY *= -1; // 上下微微浮動
    }
    if (b.x < -b.size * 2) {
      b.x = width + b.size * 2;
      b.y = random(50, advState.groundY - 200);
    }
    // 利用 sin 函數搭配 animTime 與各鳥獨立的偏移值，製造順暢的展翅效果
    let flap = sin(advState.animTime * b.flapSpeed + b.flapOffset) * b.size * 0.6;
    push();
    translate(b.x, b.y);
    beginShape();
    vertex(-b.size, -flap);
    vertex(0, 0);
    vertex(b.size, -flap);
    endShape();
    pop();
  }
  pop();
  
  // 繪製地板
  push();
  fill('#81C784'); // 柔和的草地綠色
  stroke('#2F4F6F'); // 保留深藍色邊線維持統一的插畫風格
  strokeWeight(8);
  rectMode(CORNER);
  // 左右稍微拉寬（-5 到 width+10），避免粗邊框在畫面兩側穿幫
  rect(-5, advState.groundY, width + 10, height - advState.groundY + 10);
  pop();

  // === 繪製與更新草地裝飾 ===
  push();
  let groundSpeed = 4 + (advState.score * 0.15); // 跟隨障礙物速度
  for (let dec of advState.decorations) {
    // 若遊戲未暫停且尚未結束，讓草地裝飾向左移動營造奔跑感
    if (!advState.isPaused && !advState.gameOver && !advState.gameWon) {
      dec.x -= groundSpeed;
      if (dec.x < -20) { // 超出畫面左側時從右側重新生成
        dec.x = width + random(20, 100);
        dec.y = random(advState.groundY + 15, height - 15);
        dec.type = random(['grass', 'grass', 'grass', 'flower']);
      }
    }
    
    if (dec.type === 'grass') {
      stroke('#2E8B57'); // 深綠色
      strokeWeight(3 * dec.size);
      strokeCap(ROUND);
      line(dec.x, dec.y, dec.x - 4 * dec.size, dec.y - 8 * dec.size); // 左葉
      line(dec.x, dec.y, dec.x + 4 * dec.size, dec.y - 6 * dec.size); // 右葉
      line(dec.x, dec.y, dec.x, dec.y - 10 * dec.size);               // 中葉
    } else {
      stroke('#2E8B57');
      strokeWeight(2 * dec.size);
      line(dec.x, dec.y, dec.x, dec.y - 10 * dec.size); // 莖
      
      fill(dec.color);
      noStroke();
      let fy = dec.y - 10 * dec.size;
      circle(dec.x - 3 * dec.size, fy - 3 * dec.size, 6 * dec.size); // 左上花瓣
      circle(dec.x + 3 * dec.size, fy - 3 * dec.size, 6 * dec.size); // 右上花瓣
      circle(dec.x - 3 * dec.size, fy + 3 * dec.size, 6 * dec.size); // 左下花瓣
      circle(dec.x + 3 * dec.size, fy + 3 * dec.size, 6 * dec.size); // 右下花瓣
      
      fill('#F4C542'); // 黃色花蕊
      circle(dec.x, fy, 5 * dec.size);
    }
  }
  pop();

  if (advState.gameOver || advState.gameWon) {
    push();
    fill(0, 0, 0, 150);
    rectMode(CORNER);
    rect(0, 0, width, height);

    // 如果是勝利，畫彩帶特效
    if (advState.gameWon) {
      noStroke();
      for (let i = 0; i < confettis.length; i++) {
        let c = confettis[i];
        push();
        translate(c.x, c.y);
        rotate(c.angle);
        fill(c.color);
        rectMode(CENTER);
        rect(0, 0, c.w, c.h);
        pop();
        c.y += c.speedY;
        c.x += c.speedX;
        c.angle += c.spin;
        if (c.y > height + 20) {
          c.y = random(-100, -20);
          c.x = random(width);
        }
      }
    }

    fill('#FFFFFF');
    textAlign(CENTER, CENTER);
    textSize(64);
    drawingContext.font = `900 64px "Noto Sans TC", sans-serif`;
    
    if (advState.gameWon) {
      text("🎉 完全通關！", width / 2, height / 2 - 60);
      textSize(32);
      drawingContext.font = `500 32px "Noto Sans TC", sans-serif`;
      text(`太棒了！您成功保護小人並消滅了 20 個障礙物！`, width / 2, height / 2 + 20);
    } else {
      text("遊戲結束", width / 2, height / 2 - 60);
      textSize(32);
      drawingContext.font = `500 32px "Noto Sans TC", sans-serif`;
      text(`好可惜未成功保護他，請繼續加油！`, width / 2, height / 2 + 20);
    }
    pop();
    return; // 遊戲結束停止更新邏輯
  }

  // 檢查手勢辨識
  if (!advState.isPaused) {
    checkGesture();
    advState.animTime += deltaTime; // 只有在沒暫停時，才更新動畫時間
  }

  let charX = width * 0.2; // 主角固定在畫面左側 20% 處
  let charY = advState.groundY - 40;
  let bounce = sin(advState.animTime / 80) * 5; // 跑步的上下跳動感

  // === 生成障礙物 ===
  let canSpawn = false;
  if (advState.obstacles.length === 0) {
    canSpawn = true;
  } else {
    let lastObs = advState.obstacles[advState.obstacles.length - 1];
    if (width - lastObs.x > -50) { // 大幅縮短安全距離，讓障礙物更密集出現在畫面上
      canSpawn = true;
    }
  }

  // 障礙物速度隨著分數稍微加快
  let currentSpeed = 4 + (advState.score * 0.15);
  let obsColors = ['#E67E22', '#32CD32', '#9370DB', '#00BFFF', '#FF69B4', '#F4C542']; // 準備多種障礙物顏色
  if (canSpawn && random() < 0.1 && !advState.isPaused) { 
    advState.obstacles.push({
      x: width + 300, // 將生成位置往更右側外推，讓預警氣泡能提早出現，增加反應時間
      y: advState.groundY - random(30, 120), // 隨機高度，最高到 -120
      size: 60,
      num: random(gestures),
      speed: currentSpeed,
      color: random(obsColors), // 隨機挑選顏色
      isHit: false // 尚未被光球鎖定
    });
  }

  // === 繪製與更新障礙物 ===
  let hitIndex = -1;
  for (let i = 0; i < advState.obstacles.length; i++) {
    let obs = advState.obstacles[i];
    if (!obs.isHit && !advState.isPaused) {
      obs.x -= obs.speed; // 若未被擊中鎖定，才繼續往左移動
    }

    push();
    fill(obs.color); // 使用障礙物專屬顏色
    stroke('#2F4F6F');
    strokeWeight(4);
    rectMode(CENTER);
    rect(obs.x, obs.y, obs.size, obs.size, 8);
    
    fill('#FFFFFF');
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(32);
    drawingContext.font = `900 32px "Noto Sans TC", sans-serif`;
    text(obs.num, obs.x, obs.y);
    pop();

    // 碰撞偵測 (判斷障礙物左側是否撞到主角右側)
    if (!obs.isHit && obs.x - obs.size / 2 < charX + 20) {
      hitIndex = i;
    }
  }

  // === 處理碰撞受傷 ===
  if (hitIndex !== -1) {
    advState.hp--;
    advState.hurtTimer = 30; // 啟動 30 幀的紅色受傷特效
    
    let hitObs = advState.obstacles[hitIndex];
    // 產生障礙物撞碎消散粒子
    for(let j = 0; j < 20; j++) {
      advState.particles.push({
        x: hitObs.x, y: hitObs.y,
        vx: random(-5, 8), vy: random(-6, 2),
        life: 30, maxLife: 30,
        color: random([hitObs.color, hitObs.color, '#FFFFFF']), // 碎片使用障礙物顏色與白色
        size: random(5, 12),
        angle: random(TWO_PI),
        spin: random(-0.2, 0.2),
        shape: 'rect'
      });
    }
    
    advState.obstacles.splice(hitIndex, 1);
    if (advState.hp <= 0) {
      advState.gameOver = true;
      if (pauseButton) pauseButton.hide();
      actionButton.html("重新挑戰");
      actionButton.position(width / 2 - 220, height / 2 + 80);
      actionButton.size(200, 50);
      actionButton.show();
      homeButton.position(width / 2 + 20, height / 2 + 80);
      homeButton.show();
    }
  }

  // === 處理辨識消除障礙物 ===
  if (!advState.isPaused && advState.obstacles.length > 0) {
    // 找出最前面且尚未被光球鎖定的障礙物
    let activeObs = advState.obstacles.find(o => !o.isHit);
    if (activeObs && gestureText === activeObs.num) {
      if (!isHolding) {
        isHolding = true;
        holdStartTime = advState.animTime;
      } else {
        // 需要維持 0.4 秒鐘即可消除該數字 (加快節奏)
        let holdProgress = min((advState.animTime - holdStartTime) / 400, 1);
        
        // 繪製障礙物上方的進度條
        push();
        rectMode(CORNER);
        noStroke();
        fill(255, 255, 255, 100);
        let barW = activeObs.size * 0.8;
        let barX = activeObs.x - barW / 2;
        let barY = activeObs.y - activeObs.size / 2 - 15;
        rect(barX, barY, barW, 8, 4);
        fill('#32CD32');
        rect(barX, barY, barW * holdProgress, 8, 4);
        pop();

        if (holdProgress >= 1) {
          isHolding = false;
          
          activeObs.isHit = true; // 標記為已被鎖定，讓它停在原地
          
          // 從主角位置發射追蹤魔法光球
          advState.projectiles.push({
            x: charX + 20,
            y: charY - 10,
            target: activeObs,
            progress: 0
          });
        }
      }
    } else {
      isHolding = false;
    }
  } else {
    isHolding = false;
  }

  // === 繪製奔跑的主角 ===
  push();
  translate(charX, charY + bounce);
  
  let swing = sin(advState.animTime / 80) * 15;
  
  // 繪製後方的手與腳 (圖層在身體下方)
  stroke('#2F4F6F');
  strokeWeight(6);
  line(0, -5, swing * 1.5, 15); // 後手
  line(0, 30, -swing, 50);      // 後腳

  // 受傷閃爍紅光與無敵狀態
  if (!advState.isPaused && advState.hurtTimer > 0) {
    // 讓主角在無敵期間快速閃爍
    if (floor(advState.hurtTimer / 6) % 2 === 0) fill('#FF4500'); // 紅光
    else fill(255, 255, 255, 150); // 半透明白光
    advState.hurtTimer--;
  } else if (advState.hurtTimer > 0) {
    fill('#FF4500'); // 暫停時維持紅光
  } else {
    fill('#32CD32');
  }
  stroke('#2F4F6F');
  strokeWeight(4);
  rectMode(CENTER);
  rect(0, 0, 40, 60, 10);
  
  // 眼睛 (往右側偏移，呈現面向右方行進的側視感)
  if (advState.hurtTimer > 0) {
    // 受傷時的 > < 眼睛表情
    stroke('#2F4F6F');
    strokeWeight(3);
    noFill();
    // 左眼 >
    line(-1, -18, 5, -15);
    line(5, -15, -1, -12);
    // 右眼 <
    line(19, -18, 13, -15);
    line(13, -15, 19, -12);
  } else {
    // 正常的眼睛
    fill('#FFFFFF');
    noStroke();
    circle(2, -15, 14);
    circle(16, -15, 14);
    fill('#2F4F6F');
    circle(5, -15, 6);
    circle(19, -15, 6);
  }
  
  // 繪製前方的手與腳 (圖層在身體上方)
  stroke('#2F4F6F');
  strokeWeight(6);
  line(0, -5, -swing * 1.5, 15); // 前手
  line(0, 30, swing, 50);        // 前腳
  
  pop();

  // === 繪製與更新光球 ===
  for (let i = advState.projectiles.length - 1; i >= 0; i--) {
    let proj = advState.projectiles[i];
    if (!advState.isPaused) {
      proj.progress += 0.15; // 光球極速飛行
    }
    
    let currentX = lerp(proj.x, proj.target.x, proj.progress);
    let currentY = lerp(proj.y, proj.target.y, proj.progress);
    
    push();
    noStroke();
    fill(135, 206, 250, 150); // 天藍色光暈
    circle(currentX, currentY, 40);
    fill(0, 191, 255, 200);   // 深藍色
    circle(currentX, currentY, 25);
    fill(255, 255, 255);      // 核心白光
    circle(currentX, currentY, 12);
    pop();

    if (proj.progress >= 1) {
      // 光球抵達，正式移除障礙物並加分
      let obsIdx = advState.obstacles.indexOf(proj.target);
      if (obsIdx !== -1) advState.obstacles.splice(obsIdx, 1);
      advState.score++;
      
      // 產生障礙物消散粒子 (對應顏色與白色方塊碎裂效果)
      for(let j = 0; j < 30; j++) {
        advState.particles.push({
          x: proj.target.x + random(-25, 25),
          y: proj.target.y + random(-25, 25),
          vx: random(-6, 6), vy: random(-8, 4),
          life: 40, maxLife: 40,
          color: random([proj.target.color, proj.target.color, '#FFFFFF']), // 碎片使用目標障礙物顏色
          size: random(6, 16),
          angle: random(TWO_PI),
          spin: random(-0.2, 0.2),
          shape: 'rect'
        });
      }
      advState.projectiles.splice(i, 1);
      
      // 檢查是否通關
      if (advState.score >= 20) {
        advState.gameWon = true;
        if (pauseButton) pauseButton.hide();
        initConfetti(); // 初始化彩帶
        actionButton.html("再次遊戲");
        actionButton.position(width / 2 - 220, height / 2 + 80);
        actionButton.size(200, 50);
        actionButton.show();
        homeButton.position(width / 2 + 20, height / 2 + 80);
        homeButton.show();
      }
    }
  }

  // === 繪製與更新爆炸粒子 ===
  for (let i = advState.particles.length - 1; i >= 0; i--) {
    let p = advState.particles[i];
    push();
    noStroke();
    fill(p.color);
    drawingContext.globalAlpha = p.life / p.maxLife; // 漸漸變透明
    
    translate(p.x, p.y);
    if (p.angle !== undefined) rotate(p.angle);
    
    let currentSize = (p.size || 15) * (p.life / p.maxLife);
    if (p.shape === 'rect') {
      rectMode(CENTER);
      rect(0, 0, currentSize, currentSize, 2);
    } else {
      circle(0, 0, currentSize);
    }
    pop();
    
    if (!advState.isPaused) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.angle !== undefined) p.angle += p.spin;
      p.life--;
    }
    
    if (p.life <= 0) advState.particles.splice(i, 1);
  }

  // === 繪製暫停遮罩 ===
  if (advState.isPaused) {
    push();
    fill(0, 0, 0, 150);
    rectMode(CORNER);
    rect(0, 0, width, height);

    fill('#FFFFFF');
    textAlign(CENTER, CENTER);
    textSize(64);
    drawingContext.font = `900 64px "Noto Sans TC", sans-serif`;
    text("遊戲暫停中", width / 2, height / 2);
    pop();
  }

  // === 窄螢幕/提早預警系統 ===
  if (width < 1200 && advState.obstacles.length > 0) { // 放寬螢幕寬度限制，讓更多裝置能看到預警
    let nextObs = advState.obstacles.find(o => !o.isHit);
    if (nextObs) {
      push();
      let bubbleX = width - 80;
      let bubbleY = advState.groundY - 180;
      
      // 讓氣泡有輕微的上下浮動感
      let floatY = sin(advState.animTime / 150) * 6;
      translate(0, floatY);
      
      // 氣泡主體
      fill(255, 255, 255, 230);
      stroke('#FF6347'); // 橘紅色邊框
      strokeWeight(4);
      rectMode(CENTER);
      rect(bubbleX, bubbleY, 80, 80, 16);
      
      // 氣泡右側的小尾巴 (指向右方外側)
      noStroke();
      fill(255, 255, 255, 230);
      triangle(bubbleX + 38, bubbleY - 12, bubbleX + 38, bubbleY + 12, bubbleX + 55, bubbleY);
      
      stroke('#FF6347');
      strokeWeight(4);
      line(bubbleX + 38, bubbleY - 12, bubbleX + 55, bubbleY);
      line(bubbleX + 38, bubbleY + 12, bubbleX + 55, bubbleY);
      
      // 顯示即將出現的目標數字
      fill(nextObs.color);
      noStroke();
      textAlign(CENTER, CENTER);
      textSize(42);
      drawingContext.font = `900 42px "Noto Sans TC", sans-serif`;
      text(nextObs.num, bubbleX, bubbleY);
      
      // 標題文字
      fill('#FF6347');
      textSize(18);
      drawingContext.font = `900 18px "Noto Sans TC", sans-serif`;
      text("即將出現", bubbleX, bubbleY - 55);
      
      pop();
    }
  }

  // === 繪製 UI (生命值與分數) ===
  push();
  fill('#2F4F6F');
  noStroke();
  textSize(28);
  textAlign(LEFT, TOP);
  drawingContext.font = `900 28px "Noto Sans TC", sans-serif`;
  text(`生命值: ${"❤️".repeat(advState.hp)}`, 30, 30);
  text(`消除障礙: ${advState.score}`, 30, 70);
  pop();

  // 繪製右下角的縮小版攝影機
  drawMiniCamera();
}

// === 繪製右上角縮小版攝影機 ===
function drawMiniCamera() {
  let camW = width * 0.25; // 寬度佔螢幕 25%
  let camH = capture.height * (camW / capture.width);
  let camX = width - camW / 2 - 20;
  let camY = camH / 2 + 20; // 將攝影機移到右上角
  
  push();
  translate(camX, camY);
  
  // 攝影機背景框
  rectMode(CENTER);
  stroke('#2F4F6F');
  strokeWeight(6);
  fill('#F5F7FA');
  rect(0, 0, camW, camH);

  scale(-1, 1); // 鏡像反轉
  imageMode(CENTER);
  image(capture, 0, 0, camW, camH);
  
  // 繪製骨架 (帶入自訂縮放大小)
  drawHandSkeleton(predictions, camW, camH);
  pop();

  // 顯示目前的辨識結果在攝影機下方
  push();
  textAlign(RIGHT, TOP); // 改為靠上對齊
  textSize(28);
  textFont('Noto Sans TC');
  drawingContext.font = `900 28px "Noto Sans TC", sans-serif`;
  fill('#F4C542');
  stroke('#2F4F6F');
  strokeWeight(4);
  text(`辨識: ${gestureText || "無"}`, width - 20, camY + camH / 2 + 15);
  pop();
}

// === 初始化彩帶粒子 ===
function initConfetti() {
  confettis = [];
  let colors = ['#F4C542', '#32CD32', '#FF69B4', '#FF4500', '#00BFFF', '#9370DB'];
  for (let i = 0; i < 100; i++) {
    confettis.push({
      x: random(width),
      y: random(-height, 0), // 初始位置在畫面外上方，製造落下的效果
      w: random(8, 15),
      h: random(10, 25),
      color: random(colors),
      speedY: random(2, 6),
      speedX: random(-1.5, 1.5),
      angle: random(TWO_PI),
      spin: random(-0.1, 0.1)
    });
  }
}

// === 繪製背景漂浮數字 ===
function drawFloatingDigits() {
  for (let i = 0; i < coverDigits.length; i++) {
    let d = coverDigits[i];
    push();
    translate(d.x, d.y);
    rotate(d.angle);
    
    // 將顏色轉換為 p5 色彩並套用透明度，避免 globalAlpha 污染其他圖層
    let c = color(d.color);
    c.setAlpha(d.alpha);
    fill(c);
    noStroke();
    textAlign(CENTER, CENTER);
    drawingContext.font = `900 ${d.size}px "Montserrat", sans-serif`;
    text(d.num, 0, 0);
    pop();
    
    // 讓數字緩慢漂浮
    d.x += d.speedX;
    d.y += d.speedY;
    d.angle += d.spin;
    
    // 邊界循環 (飄出畫面外時從另一側回來)
    if (d.x < -150) d.x = width + 150;
    if (d.x > width + 150) d.x = -150;
    if (d.y < -150) d.y = height + 150;
    if (d.y > height + 150) d.y = -150;
  }
}

function pickNewTarget() {
  let newTarget = random(gestures);
  // 避免連續出現同樣的題目
  while(newTarget === targetGesture) {
    newTarget = random(gestures);
  }
  targetGesture = newTarget;
}

// 輔助函式：計算兩個 3D 節點之間的距離
function dist3D(p1, p2) {
  return dist(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
}

function checkGesture() {
  gestureText = ""; // 預設為空字串
  
  // 如果有偵測到手部
  if (predictions.length > 0) {
    let hand = predictions[0];
    
    // 改用 3D 距離（包含 Z 軸深度）來判斷手指是否伸直。
    // 加入 Z 軸能有效抵抗手掌朝鏡頭前傾或後仰所造成的視覺誤差（透視縮短）。
    let wrist = hand.landmarks[0]; // 手腕節點
    
    // 掌寬 (食指根部到小指根部)，做為比例尺
    let d5_17 = dist3D(hand.landmarks[5], hand.landmarks[17]);
    let d0_9 = dist3D(wrist, hand.landmarks[9]); // 手腕到中指根部的距離

    // 【新增防呆機制】避免骨架收成一團時亂判定
    // 如果掌寬或手掌長度異常小（代表模型追蹤失敗或手太遠），或是模型信心度過低，就直接跳過判定
    if (d5_17 < 20 || d0_9 < 20 || (hand.handInViewConfidence !== undefined && hand.handInViewConfidence < 0.7)) {
      return;
    }
    
    // === 大拇指狀態 ===
    // 判斷大拇指是否張開（遠離手掌）：比較大拇指指尖(4)與關節(3)距離小指掌根(17)的遠近
    let dTip = dist3D(hand.landmarks[4], hand.landmarks[17]);
    let dIp = dist3D(hand.landmarks[3], hand.landmarks[17]);
    let isThumbOut = dTip > dIp; // 指尖比關節遠離小指掌根，就是張開的
    
    let d4_2 = dist3D(hand.landmarks[4], hand.landmarks[2]);
    let d3_2 = dist3D(hand.landmarks[3], hand.landmarks[2]);
    
    // 將大拇指伸直的嚴格度稍微放寬至 1.4 倍，讓「六七八九」可以更輕鬆地比出來
    let thumbUp = isThumbOut && (d4_2 > d3_2 * 1.4);
    let thumbClosed = !isThumbOut;
    
    // === 其他四指的統一狀態定義 (伸直, 彎曲, 握緊) ===
    const getFingerState = (tipIdx, dipIdx, pipIdx, mcpIdx) => {
      let tip = hand.landmarks[tipIdx];
      let dip = hand.landmarks[dipIdx];
      let pip = hand.landmarks[pipIdx];
      let mcp = hand.landmarks[mcpIdx];
      
      let dTip_Wrist = dist3D(tip, wrist);
      let dMcp_Wrist = dist3D(mcp, wrist);
      
      // 計算三段指骨的 3D 長度總和，以此作為該根手指的絕對比例尺
      let boneLenSum = dist3D(tip, dip) + dist3D(dip, pip) + dist3D(pip, mcp);
      let dTip_Mcp = dist3D(tip, mcp);
      
      // 伸直 (Up)：指尖到指根的距離大於骨頭總長的 80% (容許手指微彎)
      let isUp = dTip_Mcp > boneLenSum * 0.8;
      
      // 握緊 (Closed)：指尖嚴重捲曲 (dTip_Mcp < 骨頭總長 50%)，或指尖比指根更靠近手腕 (放鬆的拳頭)
      let isClosed = !isUp && (dTip_Mcp < boneLenSum * 0.5 || dTip_Wrist < dMcp_Wrist * 0.95);
      
      // 彎曲/鉤狀 (Bent)：非伸直且非握拳
      let isBent = !isClosed && !isUp;
      
      return { up: isUp, closed: isClosed, bent: isBent };
    };

    let index = getFingerState(8, 7, 6, 5);
    let middle = getFingerState(12, 11, 10, 9);
    let ring = getFingerState(16, 15, 14, 13);
    let pinky = getFingerState(20, 19, 18, 17);

    // === 新增：數字「零」的專屬判斷 (五指圈起來且圈圈朝著鏡頭) ===
    // 1. 圈圈朝著鏡頭：計算 2D 掌寬與 3D 掌寬的比例。若手掌側向鏡頭，2D 投影距離會大幅變短。
    let d5_17_2D = dist(hand.landmarks[5][0], hand.landmarks[5][1], hand.landmarks[17][0], hand.landmarks[17][1]);
    let isFacingCamera = (d5_17_2D / d5_17) > 0.55; 

    // 2. 五指圈起來：大拇指指尖(4)與食指指尖(8)、中指指尖(12)靠攏
    let d4_8 = dist3D(hand.landmarks[4], hand.landmarks[8]);
    let d8_12 = dist3D(hand.landmarks[8], hand.landmarks[12]);
    let tipsGathered = (d4_8 < d5_17 * 1.2) && (d8_12 < d5_17 * 1.2);

    // 3. 確保是「空心圓」而不是死握拳：指尖(8)距離手腕(0)需保持一定長度
    let d8_0 = dist3D(hand.landmarks[8], hand.landmarks[0]);
    let isHollow = (d8_0 > d5_17 * 1.1);

    // 綜合「零」的判定條件：四指均未伸直 + 指尖聚攏 + 空心 + 朝向鏡頭
    let isZero = !index.up && !middle.up && !ring.up && !pinky.up && tipsGathered && isHollow && isFacingCamera;

    // === 新增：數字「九」的專屬判斷 (五指併攏，手心朝向使用者，水平朝向) ===
    let handInfo = checkHandedness(hand); // 取得左右手資訊
    
    let d12_16 = dist3D(hand.landmarks[12], hand.landmarks[16]);
    let d16_20 = dist3D(hand.landmarks[16], hand.landmarks[20]);
    // 判斷五指靠攏 (包含大拇指靠近食指，其餘四指緊密併攏)
    let fingersGathered9 = (d4_8 < d5_17 * 1.5) && (d8_12 < d5_17 * 0.9) && (d12_16 < d5_17 * 0.9) && (d16_20 < d5_17 * 0.9);
    
    // 計算四指指尖相對於手腕的平均水平位移
    let avgTipX = (hand.landmarks[8][0] + hand.landmarks[12][0] + hand.landmarks[16][0] + hand.landmarks[20][0]) / 4;
    let avgTipY = (hand.landmarks[8][1] + hand.landmarks[12][1] + hand.landmarks[16][1] + hand.landmarks[20][1]) / 4;
    let dx = avgTipX - wrist[0];
    let dy = avgTipY - wrist[1];
    
    // 判斷是否為水平 (X軸位移大於Y軸位移)
    let isHorizontal = abs(dx) > abs(dy);
    
    // 判斷方向：修正攝影機鏡像的座標反轉，右手(朝左)為 dx > 0，左手(朝右)為 dx < 0
    let isPointingCorrectly = handInfo.isLeftHand ? (dx < 0) : (dx > 0);
    
    let isNine = index.up && middle.up && ring.up && pinky.up && fingersGathered9 && isFacingCamera && isHorizontal && isPointingCorrectly;

    let currentGesture = "";

    // 根據伸直、彎曲、握緊的組合設定對應的文字 (優先級高的放前面)
    if (isNine) {
      currentGesture = "九";
    } else if (thumbUp && index.up && middle.up && ring.up && !pinky.up) {
      currentGesture = "八";
    } else if (thumbUp && index.up && middle.up && !ring.up && !pinky.up) {
      currentGesture = "七";
    } else if (thumbUp && index.up && !middle.up && !ring.up && !pinky.up) {
      currentGesture = "六";
    } else if (thumbUp && !index.up && !middle.up && !ring.up && !pinky.up) {
      currentGesture = "五";
    } else if (thumbClosed && index.up && middle.up && ring.up && pinky.up) {
      currentGesture = "四";
    } else if (thumbClosed && index.up && middle.up && ring.up && !pinky.up) {
      currentGesture = "三";
    } else if (thumbClosed && index.up && middle.up && !ring.up && !pinky.up) {
      currentGesture = "二";
    } else if (thumbClosed && index.up && !middle.up && !ring.up && !pinky.up) {
      currentGesture = "一";
    } else if (isZero) {
      currentGesture = "零";
    }

    // === 時間平滑化（Debouncing） ===
    if (currentGesture !== "") {
      gestureHistory.push(currentGesture);
    }
    if (gestureHistory.length > historyLength) {
      gestureHistory.shift();
    }
    if (gestureHistory.length > 0) {
      let counts = {};
      let maxCount = 0;
      let mostFrequent = "";
      for (let g of gestureHistory) {
        counts[g] = (counts[g] || 0) + 1;
        if (counts[g] > maxCount) {
          maxCount = counts[g];
          mostFrequent = g;
        }
      }
      gestureText = mostFrequent; // 取最近 N 幀出現最多次的結果，可完美消除畫面閃爍
    }
  }
}

// 輔助函式：利用 3D 幾何純量三重積來判斷左/右手，並取得手掌朝向的 z 向量
function checkHandedness(hand) {
  let p0 = hand.landmarks[0];
  let p5 = hand.landmarks[5];
  let p17 = hand.landmarks[17];
  let p2 = hand.landmarks[2]; // 大拇指掌根

  // 建立 3D 向量 (從手腕指向各關節)
  let v1 = [p5[0] - p0[0], p5[1] - p0[1], p5[2] - p0[2]];
  let v2 = [p17[0] - p0[0], p17[1] - p0[1], p17[2] - p0[2]];
  let v3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

  // 叉積 N = v1 x v2 (計算手掌平面的法向量)
  let nx = v1[1] * v2[2] - v1[2] * v2[1];
  let ny = v1[2] * v2[0] - v1[0] * v2[2];
  let nz = v1[0] * v2[1] - v1[1] * v2[0]; // 即原本的 zCross
  
  // 純量三重積 D = v3 · N
  // 大拇指因為骨骼構造會往手掌內側微偏，利用此特性來判斷左右手
  // 在未鏡像的原始座標系中，D < 0 穩定代表左手，D > 0 代表右手
  let D = v3[0] * nx + v3[1] * ny + v3[2] * nz;
  
  return {
    isLeftHand: D < 0,
    nz: nz
  };
}

// 繪製手部骨架與關節點
function drawHandSkeleton(predictions, optW, optH) {
  if (predictions.length > 0) {
    const hand = predictions[0];
    
    // 【防呆機制】骨架收成一團時不繪製，避免畫面出現混亂的義大利麵線條
    let d5_17 = dist3D(hand.landmarks[5], hand.landmarks[17]);
    let d0_9 = dist3D(hand.landmarks[0], hand.landmarks[9]);
    if (d5_17 < 20 || d0_9 < 20 || (hand.handInViewConfidence !== undefined && hand.handInViewConfidence < 0.7)) {
      return;
    }

    const landmarks = hand.landmarks;
     // 支援傳入自訂寬高（用於右下角迷你攝影機），若無則使用預設值
    const imgWidth = optW || width * 0.5;
    const imgHeight = optH || height * 0.5;

    // 判斷左右手來決定點點顏色
    let handInfo = checkHandedness(hand);

    // 定義手指關節的連接方式
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // 大拇指
      [0, 5], [5, 6], [6, 7], [7, 8], // 食指
      [0, 9], [9, 10], [10, 11], [11, 12], // 中指
      [0, 13], [13, 14], [14, 15], [15, 16], // 無名指
      [0, 17], [17, 18], [18, 19], [19, 20], // 小指
      [5, 9], [9, 13], [13, 17] // 手掌
    ];

    // 繪製骨架（輔助藍）
    stroke('#5D7A99');
    strokeWeight(3);
    for (const conn of connections) {
      const [p1, p2] = conn;
      const [x1, y1] = landmarks[p1];
      const [x2, y2] = landmarks[p2];

      // 將原始座標對應到翻轉且縮放後的畫布座標
      const mappedX1 = map(x1, 0, capture.width, -imgWidth / 2, imgWidth / 2);
      const mappedY1 = map(y1, 0, capture.height, -imgHeight / 2, imgHeight / 2);
      const mappedX2 = map(x2, 0, capture.width, -imgWidth / 2, imgWidth / 2);
      const mappedY2 = map(y2, 0, capture.height, -imgHeight / 2, imgHeight / 2);

      line(mappedX1, mappedY1, mappedX2, mappedY2);
    }

    // 繪製關節點（紅色圓點）
    noStroke();
    if (handInfo.isLeftHand) {
      fill(0, 0, 255); // 左手為藍色點點
    } else {
      fill(255, 0, 0); // 右手為紅色點點
    }
    for (const landmark of landmarks) {
      const [x, y] = landmark;
      const mappedX = map(x, 0, capture.width, -imgWidth / 2, imgWidth / 2);
      const mappedY = map(y, 0, capture.height, -imgHeight / 2, imgHeight / 2);
      ellipse(mappedX, mappedY, 8, 8);
    }
  }
}

// 監聽滑鼠點擊事件
function mousePressed(event) {
  // 如果點擊到 DOM 元素 (例如按鈕)，則不處理以避免衝突
  if (event.target.tagName !== 'CANVAS') {
    return;
  }

  // 攔截並處理遊戲中的小提示系統點擊
  if (appState === "PLAYING" || appState === "CALIBRATING") {
    if (hintState === "IMAGE") {
      hintState = "MENU"; // 在查閱圖片時點擊返回選單
      return;
    }
    
    if (hintState === "MENU") {
      let clickedNumber = false;
      for(let i = 0; i < 10; i++) {
        let row = floor(i / 5);
        let col = i % 5;
        let bx = width / 2 - 160 + col * 80;
        let by = height / 2 - 30 + row * 80;
        if (dist(mouseX, mouseY, bx, by) < 30) {
          hintImageIndex = i;
          hintState = "IMAGE";
          clickedNumber = true;
          break;
        }
      }
      if (!clickedNumber) hintState = "CLOSED"; // 點擊外面則關閉提示
      return;
    }
    
    if (hintState === "CLOSED") {
      let camBottomY = height / 2 + height * 0.25;
      let btnX = width / 2 + 150; 
      let btnY = camBottomY + 35;
      if (mouseX > btnX - 50 && mouseX < btnX + 50 && mouseY > btnY - 18 && mouseY < btnY + 18) {
        hintState = "MENU"; // 點擊提示按鈕開啟選單
        return;
      }
    }
  }

  // 封面點擊進入教學
  if (appState === "COVER") {
    appState = "TUTORIAL";
    checkTutorialProgress();
    return;
  }
  
  if (appState === "TUTORIAL" && tutorialImgs.length === 10) {
    // 檢查是否點擊到資料來源連結
    if (enlargedImageIndex === -1) {
      let linkW = min(600, width * 0.8);
      let linkY = height - 35;
      if (mouseX > width / 2 - linkW / 2 && mouseX < width / 2 + linkW / 2 &&
          mouseY > linkY && mouseY < linkY + 30) {
        window.open("https://www.sfaa.gov.tw/sfaa/ebook/detail/5lp/6sf", "_blank");
        return;
      }
    }

    // 如果已經有放大的圖片
    if (enlargedImageIndex !== -1) {
      // 重新計算目前的放大圖片寬度，以便定位箭頭
      let img = tutorialImgs[enlargedImageIndex];
      let bigImgW = min(800, width * 0.6); 
      let bigImgH = img.height * (bigImgW / img.width);
      if (bigImgH > height * 0.6) {
        bigImgH = height * 0.6;
        bigImgW = img.width * (bigImgH / img.height);
      }
      
      let leftArrowX = width / 2 - bigImgW / 2 - 60;
      let rightArrowX = width / 2 + bigImgW / 2 + 60;
      let arrowY = height / 2;

      // 判斷是否點擊到左邊箭頭 (給予 60px 的感應半徑，方便手機點擊)
      if (dist(mouseX, mouseY, leftArrowX, arrowY) < 60) {
        animPrevIndex = enlargedImageIndex;
        slideDirection = -1;
        animSlideX = -width;
        enlargedImageIndex = (enlargedImageIndex - 1 + 10) % 10;
        viewedCards.add(enlargedImageIndex); // 標記為已讀
        return; // 結束函式，不觸發恢復縮圖
      }
      
      // 判斷是否點擊到右邊箭頭
      if (dist(mouseX, mouseY, rightArrowX, arrowY) < 60) {
        animPrevIndex = enlargedImageIndex;
        slideDirection = 1;
        animSlideX = width;
        enlargedImageIndex = (enlargedImageIndex + 1) % 10;
        viewedCards.add(enlargedImageIndex); // 標記為已讀
        return;
      }

      // 如果點到箭頭以外的其他地方，則恢復縮圖
      enlargedImageIndex = -1;
      checkTutorialProgress();
      return;
    }
    
    // 檢查是否點擊到任一張縮圖
    let imgW = min(140, width * 0.09); 
    let estimatedImgH = tutorialImgs[0].height * (imgW / tutorialImgs[0].width);
    let cardW = imgW + 40;
    let cardH = estimatedImgH + 80;
    let spacingX = cardW + 30;
    let spacingY = cardH + 40;
    let startX = width / 2 - (spacingX * 2);
    let startY = height * 0.48 - spacingY * 0.4;

    for (let i = 0; i < 10; i++) {
      let row = floor(i / 5);
      let col = i % 5;
      let x = startX + col * spacingX;
      let y = startY + row * spacingY;
      
      let img = tutorialImgs[i];
      if (img && img.width > 0) {
        // 判斷滑鼠是否在卡片範圍內
        if (mouseX > x - cardW / 2 && mouseX < x + cardW / 2 &&
            mouseY > y - cardH / 2 && mouseY < y + cardH / 2) {
          enlargedImageIndex = i;
          viewedCards.add(i); // 標記為已讀
          animSlideX = 0; // 直接點擊縮圖不滑動，純淡入
          actionButton.hide(); // 隱藏下一步按鈕避免誤觸
          break;
        }
      }
    }
  }
}

// 監聽鍵盤事件
function keyPressed() {
  // 封面按下空白鍵進入教學
  if (appState === "COVER" && key === ' ') {
    appState = "TUTORIAL";
    checkTutorialProgress();
    return;
  }

  if (appState === "TUTORIAL" && enlargedImageIndex !== -1) {
    if (keyCode === LEFT_ARROW) {
      animPrevIndex = enlargedImageIndex;
      slideDirection = -1;
      animSlideX = -width; // 準備從左側滑入
      enlargedImageIndex = (enlargedImageIndex - 1 + 10) % 10; // 往前一張，加上 10 避免出現負數
      viewedCards.add(enlargedImageIndex); // 標記為已讀
    } else if (keyCode === RIGHT_ARROW) {
      animPrevIndex = enlargedImageIndex;
      slideDirection = 1;
      animSlideX = width;  // 準備從右側滑入
      enlargedImageIndex = (enlargedImageIndex + 1) % 10;      // 往後一張
      viewedCards.add(enlargedImageIndex); // 標記為已讀
    }
  }
}

// 當視窗大小改變時，重新調整畫布大小以維持全螢幕
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // 同步更新流程按鈕位置
  if (actionButton) {
    if (appState === "TUTORIAL") {
      actionButton.position(width / 2 - 75, height - 100);
    } else if (appState === "WARNING") {
      actionButton.position(width / 2 - 125, height - 100);
    } else if (appState === "RESULT") {
      actionButton.position(width / 2 - 320, height * 0.75);
      if (adventureButton) adventureButton.position(width / 2 - 100, height * 0.75);
      if (homeButton) homeButton.position(width / 2 + 120, height * 0.75);
    } else if (appState === "ADVENTURE_WARNING") {
      actionButton.position(width / 2 - 100, height - 100);
    }
  }
  
  // 同步更新出發冒險按鈕在無盡模式時的位置
  if (adventureButton && isEndlessMode && (appState === "CALIBRATING" || appState === "PLAYING")) {
    adventureButton.position(width - 220, 20);
  }
  
  // 同步更新第三階段結束按鈕位置
  if (homeButton && (advState.gameOver || advState.gameWon) && appState === "ADVENTURE") {
    actionButton.position(width / 2 - 220, height / 2 + 80);
    homeButton.position(width / 2 + 20, height / 2 + 80);
  }

  // 同步更新暫停按鈕位置
  if (pauseButton && appState === "ADVENTURE" && !advState.gameOver && !advState.gameWon) {
    pauseButton.position(30, 110);
  }
}
