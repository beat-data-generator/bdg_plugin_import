window.__bdgPluginRegister(function activate(api) {
  api.log("renderer entry activated (id=" + api.id + ")");

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
          api.log("timestamp importer: added " + count + " markers");
        });
    },
  });

  api.log("contributions registered");

  return function dispose() {
    api.log("renderer entry disposed");
  };
});
