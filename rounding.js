(function () {
  function roundToMultiple(value, multiple) {
    const amount = Number(value || 0);
    const factor = Number(multiple || 1);
    if (!factor) return amount;
    return Math.ceil(amount / factor) * factor;
  }

  window.roundingUtils = {
    roundToMultiple
  };
})();
