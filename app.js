(function () {
  "use strict";
  var config = window.SITE_CONFIG || {};

  // 文本归一化：转小写、去标点空格，保留中英数字
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // 双字母组（bigram），用于 Dice 相似度
  function bigrams(value) {
    var text = normalize(value);
    if (!text) return [];
    if (text.length === 1) return [text];
    var result = [];
    for (var i = 0; i < text.length - 1; i += 1) {
      result.push(text.slice(i, i + 2));
    }
    return result;
  }

  // Dice 系数 = 2 * |交集| / (|A| + |B|)
  function diceSimilarity(left, right) {
    var a = bigrams(left);
    var b = bigrams(right);
    if (!a.length || !b.length) return 0;
    var counts = {};
    for (var i = 0; i < a.length; i += 1) {
      counts[a[i]] = (counts[a[i]] || 0) + 1;
    }
    var overlap = 0;
    for (var j = 0; j < b.length; j += 1) {
      if (counts[b[j]] && counts[b[j]] > 0) {
        overlap += 1;
        counts[b[j]] -= 1;
      }
    }
    return (2 * overlap) / (a.length + b.length);
  }

  // 单短语打分：完全匹配 1.0；包含关系 0.9+；其余走 Dice
  function phraseScore(query, phrase) {
    var q = normalize(query);
    var p = normalize(phrase);
    if (!q || !p) return 0;
    if (q === p) return 1;
    var shorter = Math.min(q.length, p.length);
    if (shorter >= 4 && (q.indexOf(p) !== -1 || p.indexOf(q) !== -1)) {
      return 0.9 + 0.08 * (shorter / Math.max(q.length, p.length));
    }
    return diceSimilarity(q, p);
  }

  // 在知识库里找最匹配的一条：综合 question + synonyms 的最高分
  function findKnowledge(text) {
    var ranked = (config.knowledge || []).map(function (item) {
      var phrases = [item.question].concat(item.synonyms || []);
      var score = 0;
      for (var i = 0; i < phrases.length; i += 1) {
        var s = phraseScore(text, phrases[i]);
        if (s > score) score = s;
      }
      return { item: item, score: score };
    });
    ranked.sort(function (x, y) { return y.score - x.score; });

    var best = ranked[0];
    var runnerUp = ranked[1];
    if (!best || best.score < 0.44) return null;
    // 分数不够高且与第二名接近时，视为歧义，不命中
    if (best.score < 0.72 && runnerUp && best.score - runnerUp.score < 0.035) return null;
    return best.item;
  }

  function answerFor(text) {
    var hit = findKnowledge(text);
    return hit ? hit.answer : config.fallbackAnswer;
  }

  window.NEW_STUDENT_QA = { answerFor: answerFor, findKnowledge: findKnowledge, normalize: normalize };
  if (typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var setText = function (id, value) { var n = $(id); if (n) n.textContent = value || ""; };
  var setSrc = function (id, value) { var n = $(id); if (n) n.src = value || ""; };

  document.title = config.title ? config.title + " | 新生答疑助手" : "新生答疑助手";

  setText("headerName", config.title);
  setText("profileName", config.profileName || config.title);
  setText("headerStatus", config.status);
  setText("schoolName", config.school);
  setText("subtitle", config.subtitle);
  setText("serviceLine", config.serviceLine);
  setText("admissionPhone", config.admissionPhone);
  setText("consultPhone", config.consultPhone);
  setText("notice", config.notice);
  setText("wechatLabel", config.wechatLabel);
  setText("inputTip", config.inputTip);
  setText("disclaimer", config.disclaimer);
  setText("dialogText", config.wechatLabel || "扫码咨询");
  setSrc("headerAvatar", config.avatar);
  setSrc("heroAvatar", config.avatar);
  setSrc("wechatQr", config.wechatQr);
  setSrc("dialogQr", config.wechatQr);

  var input = $("questionInput");
  var sendBtn = $("sendBtn");
  var chatArea = $("chatArea");
  var welcomePanel = $("welcomePanel");
  var grid = $("questionGrid");

  if (config.inputPlaceholder) input.placeholder = config.inputPlaceholder;

  function addMessage(text, role, options) {
    welcomePanel.classList.add("compact");
    var row = document.createElement("div");
    row.className = "message-row " + role;
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    var messageText = document.createElement("div");
    messageText.className = "bubble-text";
    messageText.textContent = text;
    bubble.appendChild(messageText);

    if (options && options.showQr) {
      var qrButton = document.createElement("button");
      qrButton.className = "fallback-qr-card";
      qrButton.type = "button";
      qrButton.setAttribute("aria-label", config.fallbackQrLabel || "添加学长微信");
      var qrImage = document.createElement("img");
      qrImage.className = "fallback-qr-image";
      qrImage.src = config.wechatQr;
      qrImage.alt = "微信二维码";
      var qrCaption = document.createElement("span");
      qrCaption.className = "fallback-qr-caption";
      qrCaption.textContent = config.fallbackQrLabel || "长按识别二维码，添加学长微信";
      qrButton.append(qrImage, qrCaption);
      qrButton.addEventListener("click", function () { $("qrDialog").showModal(); });
      bubble.appendChild(qrButton);
    }
    row.appendChild(bubble);
    chatArea.appendChild(row);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function ask(text) {
    var clean = String(text || "").trim();
    if (!clean) return;
    addMessage(clean, "user");
    input.value = "";
    sendBtn.disabled = true;
    var hit = findKnowledge(clean);
    var answer = hit ? hit.answer : config.fallbackAnswer;
    setTimeout(function () {
      addMessage(answer, "assistant", { showQr: !hit });
    }, 260);
  }

  // 渲染常见问题按钮
  (config.questions || []).forEach(function (item) {
    var q = typeof item === "string" ? { icon: "•", text: item } : item;
    var button = document.createElement("button");
    button.className = "question-btn";
    button.type = "button";
    var icon = document.createElement("span");
    var label = document.createElement("span");
    icon.textContent = q.icon || "•";
    label.textContent = q.text;
    button.append(icon, label);
    button.addEventListener("click", function () { ask(q.text); });
    grid.appendChild(button);
  });

  // 输入框自适应高度 + 发送按钮启停
  input.addEventListener("input", function () {
    sendBtn.disabled = input.value.trim().length === 0;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });

  $("askForm").addEventListener("submit", function (event) {
    event.preventDefault();
    ask(input.value);
  });

  $("downloadBtn").addEventListener("click", function () {
    if (config.downloadUrl) {
      window.open(config.downloadUrl, "_blank", "noopener");
      return;
    }
    addMessage(config.fallbackAnswer, "assistant", { showQr: true });
    $("qrDialog").showModal();
  });

  $("wechatBtn").addEventListener("click", function () { $("qrDialog").showModal(); });
  $("qrPreview").addEventListener("click", function () { $("qrDialog").showModal(); });
  $("closeDialog").addEventListener("click", function () { $("qrDialog").close(); });

  // 返回键：对话中点它回到首页欢迎面板；首页点它返回上一页（优先可靠路径，避免回到 webview 空白起始页）
  var backBtn = $("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      var dlg = $("qrDialog");
      if (dlg && dlg.open) { dlg.close(); return; }
      if (welcomePanel.classList.contains("compact")) {
        // 只删除聊天气泡，保留 welcomePanel（它在 chatArea 内部）
        var rows = chatArea.querySelectorAll(".message-row");
        for (var i = 0; i < rows.length; i += 1) {
          chatArea.removeChild(rows[i]);
        }
        welcomePanel.classList.remove("compact");
        input.value = "";
        sendBtn.disabled = true;
        return;
      }
      // 首页：优先用可靠方式返回，避免 history.back() 跳到 webview 空白起始页
      function doClose() {
        if (typeof WeixinJSBridge !== "undefined") {
          WeixinJSBridge.call("closeWindow");
          return true;
        }
        return false;
      }
      if (doClose()) return;
      document.addEventListener("WeixinJSBridgeReady", function () { doClose(); }, false);
      // 1 秒后仍未关闭，兜底回退或提示
      setTimeout(function () {
        if (document.referrer && document.referrer !== location.href) {
          location.href = document.referrer;
          return;
        }
        if (window.history.length > 1) { window.history.back(); return; }
        alert("已是最外层页面，请使用微信左上角关闭按钮返回聊天");
      }, 1000);
    });
  }
})();
