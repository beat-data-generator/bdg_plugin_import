window.__bdgPluginRegister(function activate(api) {
  api.log("renderer entry activated (id=" + api.id + ")");

  var tr = api.trackTypes.register({
    id: "flip",
    trackName: { zh: "翻转轨", en: "Flip track" },
    pointName: { zh: "翻转点", en: "Flip" },
    color: "#e11d48",
    fields: [
      {
        key: "direction",
        label: { zh: "方向", en: "Direction" },
        type: "enum",
        default: "up",
        options: [
          { value: "up", label: { zh: "上", en: "Up" } },
          { value: "down", label: { zh: "下", en: "Down" } },
        ],
      },
      {
        key: "power",
        label: { zh: "力度", en: "Power" },
        type: "number",
        default: 1,
        min: 0,
        max: 10,
        step: 0.5,
      },
      {
        key: "hold",
        label: { zh: "长按", en: "Hold" },
        type: "bool",
        default: false,
      },
    ],
  });
  api.log("track type register:", tr);

  var stopEvents = [];

  function clearStopEvents() {
    for (var i = 0; i < stopEvents.length; i++) stopEvents[i]();
    stopEvents.length = 0;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var panel = api.ui.registerPanel({
    id: "demo",
    title: { zh: "示例面板", en: "Demo Panel" },
    mount: function mount(host) {
      host.textContent = "";

      var wrap = el("div", "demo-wrap");
      host.appendChild(wrap);

      var head = el("div", "demo-head");
      head.textContent = api.id + " v" + api.version;
      wrap.appendChild(head);

      var stats = el("div", "demo-row");
      wrap.appendChild(stats);

      var log = el("pre", "demo-log");
      wrap.appendChild(log);

      function renderStats() {
        var s = api.project.snapshot();
        var pos = api.player.positionMs();
        stats.textContent =
          "tracks=" + s.tracks.length +
          " markers=" + s.markers.length +
          " bpm=" + s.baseBpm.toFixed(1) +
          " t=" + pos.toFixed(0) + "ms";
      }

      function logText(msg) {
        log.textContent = msg + "\n" + log.textContent;
      }

      stopEvents.push(api.events.on("project", renderStats));
      stopEvents.push(api.events.on("playhead", renderStats));

      var btnAdd = el("button", "demo-btn", "add marker @ playhead");
      btnAdd.addEventListener("click", function () {
        var beat = api.project.beatOfTime(api.player.positionMs());
        var s = api.project.snapshot();
        var trackId = s.tracks.length ? s.tracks[0].id : "";
        if (!trackId) return;
        var id = api.project.edit.addMarker({ trackId: trackId, beat: beat });
        logText("added marker " + id);
      });
      wrap.appendChild(btnAdd);

      var btnPing = el("button", "demo-btn", "ping main.js");
      btnPing.addEventListener("click", function () {
        api.callMain("ping", 1, 2)
          .then(function (res) {
            logText("main says: " + res);
          })
          .catch(function (err) {
            logText("main error: " + err);
          });
      });
      wrap.appendChild(btnPing);

      var btnExport = el("button", "demo-btn", "export tracks to txt");
      btnExport.addEventListener("click", function () {
        var s = api.project.snapshot();
        var lines = s.markers.map(function (m) {
          return m.timeMs.toFixed(3) + " (beat " + m.beat + ")";
        });
        api.system
          .saveFile({
            title: "Save sample export",
            defaultPath: "tracks.txt",
            filters: [{ name: "Text", extensions: ["txt"] }],
          })
          .then(function (res) {
            if (res.canceled || !res.filePath) return;
            return api.system.writeText(res.filePath, lines.join("\n"));
          })
          .then(function (ok) {
            logText(ok ? "saved" : "write failed");
          });
      });
      wrap.appendChild(btnExport);

      renderStats();
      logText("panel mounted");
      return function unmount() {
        clearStopEvents();
        host.textContent = "";
      };
    },
  });

  api.ui.registerAction({
    label: { zh: "切换示例面板", en: "Toggle demo panel" },
    run: function () {
      panel.toggle();
    },
  });

  api.ui.registerShortcut({
    id: "toggle-demo",
    label: { zh: "切换示例面板", en: "Toggle demo panel" },
    combo: "Alt+1",
    run: function () {
      panel.toggle();
    },
  });

  var flipKey = api.id + ":flip";

  api.ui.registerExporter({
    label: { zh: "示例:翻转点 CSV", en: "Sample: flip points CSV" },
    run: function () {
      var s = api.project.snapshot();
      var lines = ["beat,timeMs,direction,power,hold"];
      for (var i = 0; i < s.markers.length; i++) {
        var m = s.markers[i];
        var track = null;
        for (var j = 0; j < s.tracks.length; j++) {
          if (s.tracks[j].id === m.trackId) track = s.tracks[j];
        }
        if (!track || track.type !== flipKey || !m.attrs) continue;
        lines.push(
          m.beat +
            "," +
            m.timeMs.toFixed(3) +
            "," +
            m.attrs.direction +
            "," +
            (m.attrs.power !== undefined ? m.attrs.power : "") +
            "," +
            (m.attrs.hold ? 1 : 0),
        );
      }
      if (lines.length === 1) {
        api.log("exporter: no flip points to export");
        return;
      }
      api.system
        .saveFile({
          title: "Export flip CSV",
          defaultPath: "flip.csv",
          filters: [{ name: "CSV", extensions: ["csv"] }],
        })
        .then(function (res) {
          if (res.canceled || !res.filePath) return;
          return api.system.writeText(res.filePath, lines.join("\n"));
        })
        .then(function (ok) {
          api.log("exporter:", ok ? "saved" : "write failed");
        });
    },
  });

  api.ui.registerImporter({
    label: { zh: "示例:导入翻转 CSV", en: "Sample: import flip CSV" },
    run: function () {
      api.system
        .pickFile({
          title: "Open flip CSV",
          filters: [
            { name: "CSV", extensions: ["csv", "txt"] },
            { name: "All files", extensions: ["*"] },
          ],
        })
        .then(function (path) {
          if (!path) return;
          return api.system.readText(path);
        })
        .then(function (res) {
          if (!res || res.canceled || res.content === undefined) return;
          var rows = res.content.split(/\r?\n/);
          var trackId = null;
          api.project.edit.batch(function () {
            trackId = api.project.edit.addTypedTrack(flipKey);
            for (var i = 0; i < rows.length; i++) {
              var line = rows[i].trim();
              if (!line || line.charAt(0) === "#") continue;
              if (line.indexOf("beat") === 0) continue;
              var cols = line.split(",");
              var beat = parseFloat(cols[0]);
              if (!isFinite(beat) || beat < 0) continue;
              if (trackId) {
                api.project.edit.addMarker({
                  trackId: trackId,
                  beat: beat,
                });
              }
            }
          });
          api.log("importer: done, track =", trackId);
        });
    },
  });

  api.log("contributions registered");

  return function dispose() {
    clearStopEvents();
    api.log("renderer entry disposed");
  };
});
