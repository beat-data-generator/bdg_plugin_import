module.exports = function activate(ctx) {
  ctx.log("main entry activated", ctx.id);
  ctx.onDispose(function () {
    ctx.log("main entry disposed");
  });
};
