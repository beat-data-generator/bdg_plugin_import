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

  api.ui.registerImporter({
    label: { zh: "导入 MIDI 踩点", en: "Import MIDI markers" },
    run: function () {
      var pickedPath = "";
      api.system
        .pickFile({
          title: "Open MIDI file",
          filters: [
            { name: "MIDI", extensions: ["mid", "midi"] },
            { name: "All files", extensions: ["*"] },
          ],
        })
        .then(function (path) {
          if (!path) return;
          pickedPath = path;
          return api.callMain("parseMidiFile", path);
        })
        .then(function (data) {
          if (!data || data.error) {
            api.log("midi importer failed:", (data && data.error) || "no data");
            return;
          }
          var fileBase = pickedPath
            .replace(/^.*[\\/]/, "")
            .replace(/\.[^.]+$/, "");
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
        })
        .catch(function (err) {
          api.log("midi importer error:", err);
        });
    },
  });

  api.log("contributions registered");

  return function dispose() {
    api.log("renderer entry disposed");
  };
});
