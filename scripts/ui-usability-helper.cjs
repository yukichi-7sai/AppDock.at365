const assert = require('node:assert/strict');

/** Check keyboard usability without prescribing the focus ring's size or position. */
async function assertKeyboardFocus(control) {
  assert(await control.isVisible(), 'focused control is visible');
  const state = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const context = document.createElement('canvas').getContext('2d');
    const visibleColor = (value) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3] > 0;
    };
    const shadowColors = style.boxShadow.match(/(?:rgba?|color)\([^)]+\)/g) || [];
    return {
      focused: document.activeElement === element,
      indicated:
        element.matches(':focus-visible') &&
        ((parseFloat(style.outlineWidth) > 0 &&
          style.outlineStyle !== 'none' &&
          visibleColor(style.outlineColor)) ||
          shadowColors.some(visibleColor)),
    };
  });
  assert(state.focused, 'keyboard focus remains on the expected control');
  assert(state.indicated, 'keyboard focus has a visible indicator');
}

/** Measure rendered text against its composited ancestor background, independent of palette values. */
async function assertReadableText(control) {
  const ratio = await control.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d');
    const color = (value) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const over = (front, back) =>
      front
        .slice(0, 3)
        .map((channel, index) => (channel * front[3]) / 255 + back[index] * (1 - front[3] / 255));
    const parents = [];
    for (let node = element; node; node = node.parentElement) parents.push(node);
    const background = parents
      .reverse()
      .reduce(
        (back, node) => over(color(getComputedStyle(node).backgroundColor), back),
        [255, 255, 255],
      );
    const foreground = over(color(getComputedStyle(element).color), background);
    const luminance = (channels) =>
      channels
        .map((value) => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const a = luminance(background),
      b = luminance(foreground);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert(ratio >= 4.5, 'rendered text contrast is readable: ' + ratio);
}

module.exports = { assertKeyboardFocus, assertReadableText };
