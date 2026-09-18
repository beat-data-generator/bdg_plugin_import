window.__bdgPluginRegister(function activate(api) {
  api.log("renderer entry activated (id=" + api.id + ")");

  function notify(message, isError) {
    api.log((isError ? "[import error] " : "[import] ") + message);
    try {
      var host = document.body || document.documentElement;
      if (!host) throw new Error("no document body");
      var old = document.querySelector("[data-bdg-toast]");
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var box = document.createElement("div");
      box.setAttribute("data-bdg-toast", "1");
      box.textContent = message;
      box.style.position = "fixed";
      box.style.left = "50%";
      box.style.top = "16px";
      box.style.transform = "translateX(-50%)";
      box.style.zIndex = "2147483647";
      box.style.maxWidth = "70vw";
      box.style.boxSizing = "border-box";
      box.style.padding = "10px 16px";
      box.style.borderRadius = "6px";
      box.style.font = "13px/1.5 system-ui, sans-serif";
      box.style.whiteSpace = "pre-wrap";
      box.style.wordBreak = "break-word";
      box.style.color = "#fff";
      box.style.background = isError ? "#b91c1c" : "#1f2937";
      box.style.boxShadow = "0 4px 16px rgba(0,0,0,.35)";
      box.style.pointerEvents = "auto";
      box.style.cursor = "pointer";
      box.title = "点击关闭";
      box.addEventListener("click", function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      });
      host.appendChild(box);
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      }, isError ? 8000 : 3500);
    } catch (e) {
      try {
        window.alert(message);
      } catch (e2) {}
    }
  }

  function parseTimestamp(token) {
    if (token === undefined || token === null) return null;
    var t = String(token).trim().toLowerCase();
    if (!t) return null;
    var isSeconds = false;
    if (t.slice(-2) === "ms") {
      t = t.slice(0, -2);
    } else if (t.slice(-1) === "s") {
      t = t.slice(0, -1);
      isSeconds = true;
    } else if (t.indexOf(".") >= 0) {
      isSeconds = true;
    }
    var v = parseFloat(t);
    if (!isFinite(v) || v < 0) return null;
    return isSeconds ? v * 1000 : v;
  }

  api.ui.registerImporter({
    label: { zh: "导入时间戳踩点", en: "Import timestamp markers" },
    run: function () {
      var pickedPath = "";
      api.system
        .pickFile({
          title: "Open timestamp file",
          filters: [
            { name: "Text", extensions: ["txt", "csv", "tsv", "log"] },
            { name: "All files", extensions: ["*"] },
          ],
        })
        .then(function (path) {
          if (!path) return;
          pickedPath = path;
          return api.system.readText(path);
        })
        .then(function (res) {
          if (!res || res.canceled || res.content === undefined) return;
          var rows = res.content.split(/\r?\n/);
          var trackName = pickedPath.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
          var count = 0;
          api.project.edit.batch(function () {
            var trackId = api.project.edit.addTrack({
              name: trackName || "Imported",
            });
            for (var i = 0; i < rows.length; i++) {
              var line = rows[i].trim();
              if (!line || line.charAt(0) === "#") continue;
              var token = line.split(/[\s,;\t]+/)[0];
              var ms = parseTimestamp(token);
              if (ms === null) continue;
              var beat = api.project.beatOfTime(ms);
              if (!isFinite(beat) || beat < 0) continue;
              api.project.edit.addMarker({ trackId: trackId, beat: beat });
              count++;
            }
          });
          if (count > 0) {
            notify("已导入 " + count + " 个踩点（" + (trackName || "Imported") + "）");
          } else {
            notify("未识别到任何时间戳，请检查文件格式", true);
          }
        })
        .catch(function (err) {
          notify("时间戳导入失败：" + errMessage(err), true);
        });
    },
  });

  api.ui.registerImporter({
    label: { zh: "导入 MIDI 踩点", en: "Import MIDI markers" },
    run: function () {
      api.callMain("importMidi")
        .then(function (data) {
          if (!data) {
            notify("MIDI 导入失败：主进程无返回数据", true);
            return;
          }
          if (data.canceled) return;
          if (data.error) {
            notify("MIDI 导入失败：" + data.error, true);
            return;
          }
          if (!data.tracks || !data.tracks.length) {
            notify("MIDI 导入失败：文件不含任何轨道", true);
            return;
          }
          var fileBase = data.fileName || "MIDI";
          var total = 0;
          var trackCount = 0;
          api.project.edit.batch(function () {
            for (var i = 0; i < data.tracks.length; i++) {
              var tr = data.tracks[i];
              if (!tr.notes || !tr.notes.length) continue;
              var name = tr.name
                ? fileBase + " - " + tr.name
                : fileBase + " " + (i + 1);
              var trackId = api.project.edit.addTrack({ name: name });
              if (!trackId) continue;
              var added = 0;
              for (var j = 0; j < tr.notes.length; j++) {
                var beat = api.project.beatOfTime(tr.notes[j].timeMs);
                if (!isFinite(beat) || beat < 0) continue;
                api.project.edit.addMarker({ trackId: trackId, beat: beat });
                added++;
              }
              total += added;
              trackCount++;
            }
          });
          api.log(
            "midi importer: added " + total + " markers on " + trackCount + " tracks",
          );
          if (total > 0) {
            notify("已导入 " + total + " 个踩点（" + trackCount + " 轨）");
          } else {
            notify("MIDI 中未找到 Note On 音符", true);
          }
        })
        .catch(function (err) {
          notify("MIDI 导入失败：" + errMessage(err), true);
        });
    },
  });

  function errMessage(err) {
    if (!err) return "未知错误";
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    return String(err);
  }

  api.log("contributions registered");

  return function dispose() {
    try {
      var old = document.querySelector("[data-bdg-toast]");
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (e) {}
    api.log("renderer entry disposed");
  };
});
