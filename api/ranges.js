'use strict';
/** ММ — шкалы диапазона (ranges.json ММ): капсула, усы, «в диапазоне», путь, отдача пути, график 90 дней. Только чтение. */
const { serve } = require('./_mm.js');
module.exports = serve('ranges.json', v => {
  if (!v || v.schema !== 'mayak-ranges/1') throw Error('неизвестная схема шкал ММ');
  return v;
});
