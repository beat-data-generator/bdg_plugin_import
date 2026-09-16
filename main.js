var fs = require("fs");

var DEFAULT_TEMPO = 500000;

module.exports = function activate(ctx) {
  ctx.log("main entry activated", ctx.id);

  ctx.registerHandler("parseMidiFile", function (path) {
    try {
      return parseMidiFile(path);
    } catch (err) {
      return { error: err && err.message ? err.message : String(err) };
    }
  });

  ctx.onDispose(function () {
    ctx.log("main entry disposed");
  });
};

function parseMidiFile(path) {
  var buf = fs.readFileSync(path);
  if (buf.length < 14) throw new Error("file too small to be MIDI");
  if (buf.toString("latin1", 0, 4) !== "MThd") throw new Error("missing MThd header");

  var pos = 4;
  var headerLen = buf.readUInt32BE(pos);
  pos += 4;
  var format = buf.readUInt16BE(pos);
  pos += 2;
  var trackCount = buf.readUInt16BE(pos);
  pos += 2;
  var division = buf.readUInt16BE(pos);
  pos += 2;
  pos = 8 + headerLen;

  var tempoEvents = [];
  var rawTracks = [];

  for (var t = 0; t < trackCount && pos + 8 <= buf.length; t++) {
    var chunkId = buf.toString("latin1", pos, pos + 4);
    pos += 4;
    var chunkLen = buf.readUInt32BE(pos);
    pos += 4;
    var chunkEnd = Math.min(pos + chunkLen, buf.length);
    if (chunkId === "MTrk") rawTracks.push(parseTrack(buf, pos, chunkEnd, tempoEvents));
    pos = chunkEnd;
  }

  var isSmpte = (division & 0x8000) !== 0;
  var ppq = division & 0x7fff;
  var tempoMap = buildTempoMap(tempoEvents);

  var tracks = [];
  for (var i = 0; i < rawTracks.length; i++) {
    var notes = mergeByTick(rawTracks[i].notes);
    var out = [];
    for (var j = 0; j < notes.length; j++) {
      var n = notes[j];
      var ms = isSmpte ? smpteToMs(n.tick, division) : tickToMs(n.tick, tempoMap, ppq);
      out.push({ tick: n.tick, timeMs: ms, note: n.note, velocity: n.velocity });
    }
    tracks.push({ index: i, name: rawTracks[i].name, notes: out });
  }

  return {
    format: format,
    division: division,
    ppq: isSmpte ? null : ppq,
    tracks: tracks,
  };
}

function parseTrack(buf, start, end, tempoEvents) {
  var pos = start;
  var tick = 0;
  var running = 0;
  var notes = [];
  var name = "";

  while (pos < end) {
    var delta = 0;
    var b;
    do {
      if (pos >= end) return { name: name, notes: notes };
      b = buf[pos++];
      delta = (delta << 7) | (b & 0x7f);
    } while (b & 0x80);
    tick += delta;

    if (pos >= end) break;
    var status = buf[pos];
    if (status & 0x80) {
      pos++;
      if (status < 0xf0) running = status;
    } else {
      status = running;
      if (!status) return { name: name, notes: notes };
    }

    if (status === 0xff) {
      if (pos >= end) break;
      var metaType = buf[pos++];
      var meta = readVlq(buf, pos, end);
      pos = meta.next;
      var dataEnd = Math.min(pos + meta.value, end);
      if (metaType === 0x51 && dataEnd - pos >= 3) {
        var us = (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2];
        if (us > 0) tempoEvents.push({ tick: tick, usPerQuarter: us });
      } else if (metaType === 0x03) {
        name = buf.toString("utf8", pos, dataEnd).replace(/\0+$/, "").trim();
      }
      pos = dataEnd;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      var sysex = readVlq(buf, pos, end);
      pos = Math.min(sysex.next + sysex.value, end);
      continue;
    }

    var hi = status & 0xf0;
    if (hi === 0x80 || hi === 0x90 || hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
      if (pos + 2 > end) break;
      var d1 = buf[pos++];
      var d2 = buf[pos++];
      if (hi === 0x90 && d2 > 0) notes.push({ tick: tick, note: d1, velocity: d2 });
    } else if (hi === 0xc0 || hi === 0xd0) {
      if (pos + 1 > end) break;
      pos++;
    } else {
      break;
    }
  }

  return { name: name, notes: notes };
}

function readVlq(buf, pos, end) {
  var value = 0;
  var b = 0;
  do {
    if (pos >= end) break;
    b = buf[pos++];
    value = (value << 7) | (b & 0x7f);
  } while (b & 0x80);
  return { value: value, next: pos };
}

function mergeByTick(notes) {
  var sorted = notes.slice().sort(function (a, b) {
    return a.tick - b.tick;
  });
  var out = [];
  var lastTick = -1;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].tick === lastTick) continue;
    lastTick = sorted[i].tick;
    out.push(sorted[i]);
  }
  return out;
}

function buildTempoMap(tempoEvents) {
  var map = tempoEvents.slice().sort(function (a, b) {
    return a.tick - b.tick;
  });
  if (!map.length || map[0].tick > 0) {
    map.unshift({ tick: 0, usPerQuarter: DEFAULT_TEMPO });
  }
  return map;
}

function tickToMs(tick, map, ppq) {
  if (!ppq) return 0;
  var ms = 0;
  var prev = 0;
  var tempo = DEFAULT_TEMPO;
  for (var i = 0; i < map.length; i++) {
    var seg = map[i];
    if (seg.tick >= tick) break;
    ms += ((seg.tick - prev) * tempo) / (ppq * 1000);
    prev = seg.tick;
    tempo = seg.usPerQuarter;
  }
  ms += ((tick - prev) * tempo) / (ppq * 1000);
  return ms;
}

function smpteToMs(tick, division) {
  var fps = 256 - ((division >> 8) & 0xff);
  var ticksPerFrame = division & 0xff;
  if (!fps || !ticksPerFrame) return 0;
  return (tick / (fps * ticksPerFrame)) * 1000;
}
