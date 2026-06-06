let capture;
let handpose;
let predictions = [];
let gestureText = "";
let modelLoaded = false;

// 新增啟動（校正）階段的相關變數
let isCalibrated = false;      // 是否已完成啟動校正
let calibrateStartTime = 0;    // 記錄開始偵測到手的時間
let calibrateProgress = 0;     // 記錄 1 秒鐘的進度 (0.0 ~ 1.0)
let calibrateSide = "";        // 記錄目前正在校正哪一邊 ("left" 或 "right")
let isFading = false;          // 是否正在播放淡出動畫
let fadeStartTime = 0;         // 淡出動畫開始時間
let lockedSide = "";           // 記錄最終選定的一側

let gestureHistory = [];       // 用於時間平滑化的陣列
const historyLength = 10;      // 收集最近 10 幀來取眾數，解決閃爍問題

let infoButton;                // 提醒圖案按鈕

function setup() {
  // 建立全螢幕畫布
  createCanvas(windowWidth, windowHeight);
  
  // 取得攝影機影像，並加入「限制解析度與幀率」的設定
  // 避免高畫質鏡頭（如 1080p）導致 AI 模型運算負載過大而使畫面卡死
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
  });
  
  // 監聽辨識結果，每當辨識出節點時將結果儲存起來
  handpose.on("predict", results => {
    predictions = results;
  });

  // === 建立提醒圖案（按鈕） ===
  infoButton = createButton('💡 台灣手語辭典');
  infoButton.position(width - 220, 20); // 放置於畫面右上角
  infoButton.style('font-size', '20px');
  infoButton.style('padding', '10px 15px');
  infoButton.style('cursor', 'pointer');
  infoButton.style('border-radius', '12px');
  infoButton.style('background-color', '#FFD700'); // 呼應原本的黃色字體
  infoButton.style('color', '#333');
  infoButton.style('border', 'none');
  infoButton.style('font-weight', 'bold');
  infoButton.style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');
  infoButton.style('z-index', '1000'); // 確保顯示在最上層
  
  // 點擊按鈕時，在新分頁開啟台灣手語辭典
  infoButton.mousePressed(() => {
    window.open('https://twtsl.ccu.edu.tw/', '_blank');
  });
}

function draw() {
  // 設定背景顏色
  background('#778DA9');
  
  if (!modelLoaded) {
    // 顯示載入中文字
    fill(255);
    noStroke();
    textSize(32);
    textAlign(CENTER, CENTER);
    text("模型載入中...", width / 2, height / 2);
    return; // 尚未載入完成則提早結束，不執行下方繪圖
  }

  // --- 以下為模型載入後的共用繪圖（鏡頭影像與骨架） ---
  imageMode(CENTER);
  push(); 
  translate(width / 2, height / 2);
  scale(-1, 1); 
  image(capture, 0, 0, width * 0.6, height * 0.6); 
  drawHandSkeleton(predictions);
  pop(); 

  if (!isCalibrated) {
    // === 1. 啟動（校正）階段 ===
    push();
    textAlign(CENTER, CENTER);
    
    // 設定左右兩邊手掌的位置
    let leftX = width / 2 - 200;
    let rightX = width / 2 + 200;
    let centerY = height / 2;
    
    // 計算淡出動畫的透明度比例 (1.0 ~ 0.0)
    let leftFade = 1.0;
    let rightFade = 1.0;
    if (isFading) {
      let currentFade = min((millis() - fadeStartTime) / 500, 1); // 500ms 淡出動畫
      let alphaMultiplier = map(currentFade, 0, 1, 1.0, 0.0);
      if (lockedSide === "left") rightFade = alphaMultiplier;
      else if (lockedSide === "right") leftFade = alphaMultiplier;
    }
    
    // 顯示半透明的手掌 Emoji，並套用淡出效果
    textSize(200);
    drawingContext.globalAlpha = 0.5 * leftFade; // 基本透明度 50% 乘上淡出比例
    text("🖐️", leftX, centerY);
    drawingContext.globalAlpha = 0.5 * rightFade;
    text("🖐️", rightX, centerY);
    drawingContext.globalAlpha = 1.0; // 恢復 100% 透明度
    
    // 顯示提示文字
    fill(255);
    noStroke();
    textSize(36);
    textStyle(BOLD);
    text("請將手掌對準畫面左側或右側，維持 1 秒鐘", width / 2, height / 2 - 250);
    
    let activeSide = "";

    // 處理計時器邏輯
    if (!isFading) {
      if (predictions.length > 0) {
        // 取得手腕的 X 座標來判斷目前在哪一邊
        let wristX = predictions[0].landmarks[0][0]; 
        // 影像寬度是 width * 0.6，計算出對應畫面的相對位置
        let mappedX = map(wristX, 0, capture.width, -(width * 0.6) / 2, (width * 0.6) / 2);
        // 因為畫布有做 scale(-1, 1)，所以實際在畫布上的 X 座標要反轉
        let canvasX = width / 2 - mappedX; 
        
        activeSide = canvasX < width / 2 ? "left" : "right";
        
        // 若換邊或剛開始，重置計時器
        if (calibrateSide !== activeSide) {
          calibrateSide = activeSide;
          calibrateStartTime = millis();
        }
        
        calibrateProgress = min((millis() - calibrateStartTime) / 1000, 1); // 將經過毫秒數轉為 0~1 的進度
        
        if (calibrateProgress >= 1) {
          isFading = true;            // 達成 1 秒，觸發淡出動畫
          fadeStartTime = millis();
          lockedSide = calibrateSide; // 記錄最終選擇的手掌邊
        }
      } else {
        // 如果手離開畫面，歸零進度
        calibrateStartTime = 0; 
        calibrateProgress = 0;
        calibrateSide = "";
      }
    } else {
      // 動畫進行中，如果進度滿了就切換狀態
      let currentFade = min((millis() - fadeStartTime) / 500, 1);
      if (currentFade >= 1) {
        isCalibrated = true; // 動畫結束，正式進入辨識階段
        isFading = false;    // 狀態重置
      }
    }
    
    noFill();
    strokeWeight(12);
    
    // 繪製左側圓形進度條
    drawingContext.globalAlpha = leftFade; // 將淡出比例同時套用在進度條上
    stroke(255, 255, 255, 100);
    circle(leftX, centerY, 300); // 畫進度條底框
    
    if (calibrateProgress > 0 && calibrateSide === "left") {
      stroke('#FFD700'); 
      strokeCap(ROUND);
      let angle = map(calibrateProgress, 0, 1, 0, TWO_PI);
      // 畫圓弧，從 -HALF_PI（時鐘 12 點鐘方向）開始順時針畫
      arc(leftX, centerY, 300, 300, -HALF_PI, -HALF_PI + angle);
    }
    
    // 繪製右側圓形進度條
    drawingContext.globalAlpha = rightFade;
    stroke(255, 255, 255, 100);
    circle(rightX, centerY, 300); // 畫進度條底框
    
    if (calibrateProgress > 0 && calibrateSide === "right") {
      stroke('#FFD700'); 
      strokeCap(ROUND);
      let angle = map(calibrateProgress, 0, 1, 0, TWO_PI);
      arc(rightX, centerY, 300, 300, -HALF_PI, -HALF_PI + angle);
    }
    
    drawingContext.globalAlpha = 1.0; // 恢復透明度
    pop();
  } else {
    // === 2. 正式手勢辨識階段 ===
    checkGesture();
    
    fill('#FFD700'); 
    stroke(0);       
    strokeWeight(6); 
    textSize(64);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text(gestureText, 20, 20); 
  }
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
    let thumbBent = isThumbOut && (d4_2 <= d3_2 * 1.4);
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

    // 判斷「百」的捏合特徵：大拇指(4)、食指(8)、中指(12)指尖接觸
    let d4_8 = dist3D(hand.landmarks[4], hand.landmarks[8]);
    let d8_12 = dist3D(hand.landmarks[8], hand.landmarks[12]);
    let d4_12 = dist3D(hand.landmarks[4], hand.landmarks[12]);
    // 只要三個指尖彼此的距離都小於掌寬(d5_17)的 0.8 倍，即視為捏合
    let isHundredPinch = (d4_8 < d5_17 * 0.8) && (d8_12 < d5_17 * 0.8) && (d4_12 < d5_17 * 0.8);

    let currentGesture = "";

    // 根據伸直、彎曲、握緊的組合設定對應的文字 (優先級高的放前面)
    if (isHundredPinch && ring.up && pinky.up) {
      currentGesture = "百";
    } else if (thumbBent && index.bent && middle.bent && ring.bent && pinky.bent) {
      currentGesture = "九十";
    } else if (thumbBent && index.bent && middle.bent && ring.bent && !pinky.up) {
      currentGesture = "八十";
    } else if (thumbBent && index.bent && middle.bent && !ring.up && !pinky.up) {
      currentGesture = "七十";
    } else if (thumbBent && index.bent && !middle.up && !ring.up && !pinky.up) {
      currentGesture = "六十";
    } else if (thumbBent && !index.up && !middle.up && !ring.up && !pinky.up) {
      currentGesture = "五十";
    } else if (thumbClosed && index.bent && middle.bent && ring.bent && pinky.bent) {
      currentGesture = "四十";
    } else if (thumbClosed && index.bent && middle.bent && ring.bent && !pinky.up) {
      currentGesture = "三十";
    } else if (thumbClosed && index.bent && middle.bent && !ring.up && !pinky.up) {
      currentGesture = "二十";
    } else if (thumbClosed && index.bent && !middle.up && !ring.up && !pinky.up) {
      currentGesture = "十";
    } else if (thumbUp && index.up && middle.up && ring.up && pinky.up) {
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
function drawHandSkeleton(predictions) {
  if (predictions.length > 0) {
    const hand = predictions[0];
    
    // 【防呆機制】骨架收成一團時不繪製，避免畫面出現混亂的義大利麵線條
    let d5_17 = dist3D(hand.landmarks[5], hand.landmarks[17]);
    let d0_9 = dist3D(hand.landmarks[0], hand.landmarks[9]);
    if (d5_17 < 20 || d0_9 < 20 || (hand.handInViewConfidence !== undefined && hand.handInViewConfidence < 0.7)) {
      return;
    }

    const landmarks = hand.landmarks;
    const imgWidth = width * 0.6;
    const imgHeight = height * 0.6;

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

    // 繪製骨架（白色線條）
    stroke(255, 255, 255);
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

// 當視窗大小改變時，重新調整畫布大小以維持全螢幕
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // 同步更新按鈕的位置，保持在右上角
  if (infoButton) {
    infoButton.position(width - 220, 20);
  }
}
